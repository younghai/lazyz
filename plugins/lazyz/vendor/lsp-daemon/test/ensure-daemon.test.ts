import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	DaemonUnreachableError,
	type EnsureDaemonDeps,
	ensureDaemonRunning,
	startupLockPath,
} from "../src/ensure-daemon.js";
import type { LockHandle } from "../src/lock.js";
import { daemonTestPaths } from "./daemon-path-fixture.js";

const PATHS = daemonTestPaths("/tmp/ensure-test", "9.9.9");
const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

interface Harness {
	deps: EnsureDaemonDeps;
	counts: { lock: number; release: number; spawn: number };
}

function makeHarness(config: { probeQueue: boolean[]; lockAvailable?: boolean; onSpawnPush?: boolean[] }): Harness {
	const queue = [...config.probeQueue];
	const counts = { lock: 0, release: 0, spawn: 0 };
	let now = 0;
	const lock: LockHandle = {
		release: () => {
			counts.release += 1;
		},
	};

	const deps: EnsureDaemonDeps = {
		probe: () => Promise.resolve(queue.shift() ?? false),
		acquireStartupLock: () => {
			counts.lock += 1;
			return config.lockAvailable === false ? null : lock;
		},
		spawnDaemon: () => {
			counts.spawn += 1;
			for (const value of config.onSpawnPush ?? []) queue.push(value);
		},
		sleep: (ms) => {
			now += ms;
			return Promise.resolve();
		},
		now: () => now,
	};

	return { deps, counts };
}

describe("ensureDaemonRunning", () => {
	it("#given daemon already reachable #when ensure #then does not lock or spawn", async () => {
		const { deps, counts } = makeHarness({ probeQueue: [true] });
		await ensureDaemonRunning(PATHS, deps);
		expect(counts.spawn).toBe(0);
		expect(counts.lock).toBe(0);
	});

	it("#given not running #when ensure #then spawns without owning the daemon lock and waits", async () => {
		const { deps, counts } = makeHarness({
			probeQueue: [false, false],
			onSpawnPush: [true],
		});
		await ensureDaemonRunning(PATHS, deps);
		expect(counts.spawn).toBe(1);
		expect(counts.release).toBe(1);
	});

	it("#given another process owns the startup lock #when ensure #then waits without spawning", async () => {
		const { deps, counts } = makeHarness({
			probeQueue: [false, true],
			lockAvailable: false,
		});
		await ensureDaemonRunning(PATHS, deps);
		expect(counts.spawn).toBe(0);
		expect(counts.lock).toBe(1);
	});

	it("#given concurrent callers in one process #when daemon startup is ensured #then one shared startup performs one spawn", async () => {
		let reachable = false;
		let spawnCount = 0;
		let releaseCount = 0;
		const deps: EnsureDaemonDeps = {
			probe: () => Promise.resolve(reachable),
			acquireStartupLock: () => ({
				release: () => {
					releaseCount += 1;
				},
			}),
			spawnDaemon: () => {
				spawnCount += 1;
				queueMicrotask(() => {
					reachable = true;
				});
			},
			sleep: () => Promise.resolve(),
			now: () => 0,
		};

		await Promise.all(Array.from({ length: 16 }, () => ensureDaemonRunning(PATHS, deps)));

		expect(spawnCount).toBe(1);
		expect(releaseCount).toBe(1);
	});

	it("#given daemon ownership lock path #when startup lock is resolved #then it uses a distinct sibling lock", () => {
		expect(startupLockPath(PATHS)).toBe(`${PATHS.lock}.start`);
	});

	it("#given two independent processes #when they ensure the same fake service #then the filesystem startup lock permits one spawn", async () => {
		const directory = mkdtempSync(join(tmpdir(), "lazyz-lsp-startup-"));
		tempDirectories.push(directory);
		const paths = daemonTestPaths(directory, "9.9.9");
		const readyPath = join(directory, "ready");
		const spawnCountPath = join(directory, "spawns");
		const ensureUrl = new URL("../src/ensure-daemon.ts", import.meta.url).href;
		const lockUrl = new URL("../src/lock.ts", import.meta.url).href;
		const script = `
			import { appendFileSync, existsSync, writeFileSync } from "node:fs";
			import { ensureDaemonRunning } from ${JSON.stringify(ensureUrl)};
			import { tryAcquireLock } from ${JSON.stringify(lockUrl)};
			const paths = ${JSON.stringify(paths)};
			const readyPath = ${JSON.stringify(readyPath)};
			const spawnCountPath = ${JSON.stringify(spawnCountPath)};
			await ensureDaemonRunning(paths, {
				probe: async () => existsSync(readyPath),
				acquireStartupLock: (path) => tryAcquireLock(path),
				spawnDaemon: () => {
					appendFileSync(spawnCountPath, "spawn\\n");
					setTimeout(() => writeFileSync(readyPath, "ready\\n"), 30);
				},
				sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				now: () => Date.now(),
			}, { readyTimeoutMs: 1_000, pollIntervalMs: 10 });
		`;

		const [first, second] = await Promise.all([runBunScript(script), runBunScript(script)]);

		expect(first.stderr).toBe("");
		expect(second.stderr).toBe("");
		expect(readFileSync(spawnCountPath, "utf8").trim().split("\n")).toHaveLength(1);
	});

	it("#given spawn never becomes reachable #when ensure #then throws", async () => {
		const { deps, counts } = makeHarness({ probeQueue: [false, false] });
		await expect(
			ensureDaemonRunning(PATHS, deps, { readyTimeoutMs: 300, pollIntervalMs: 100 }),
		).rejects.toBeInstanceOf(DaemonUnreachableError);
		expect(counts.spawn).toBe(1);
		expect(counts.release).toBe(1);
	});

	it("#given daemon probing is pending #when startup is aborted #then ensure settles without spawning", async () => {
		const controller = new AbortController();
		const probeStarted = deferred();
		const probeRelease = deferred();
		let probeCount = 0;
		let spawnCount = 0;
		let observedSignal: AbortSignal | undefined;
		const deps: EnsureDaemonDeps = {
			probe: async (_paths, signal?: AbortSignal) => {
				probeCount += 1;
				observedSignal = signal;
				if (probeCount !== 1) return true;
				probeStarted.resolve();
				await probeRelease.promise;
				return false;
			},
			acquireStartupLock: () => null,
			spawnDaemon: () => {
				spawnCount += 1;
			},
			sleep: () => Promise.resolve(),
			now: () => 0,
		};
		const ensure = ensureDaemonRunning(PATHS, deps, { signal: controller.signal });
		await probeStarted.promise;

		controller.abort();
		const settledBeforeProbeRelease = await settlesWithin(ensure, 100);
		probeRelease.resolve();
		const outcome = await ensure.then(
			() => null,
			(error: unknown) => error,
		);

		expect(settledBeforeProbeRelease).toBe(true);
		expect(outcome).toBeInstanceOf(Error);
		if (!(outcome instanceof Error)) throw new Error("ensure did not reject with an Error");
		expect(outcome.name).toBe("AbortError");
		expect(probeCount).toBe(1);
		expect(spawnCount).toBe(0);
		expect(observedSignal).toBe(controller.signal);
	});

	it("#given a probe is already aborted #when its socket cannot connect #then the socket error stays contained", async () => {
		const moduleUrl = new URL("../src/ensure-daemon.ts", import.meta.url).href;
		const script = `
			import { pingDaemon } from ${JSON.stringify(moduleUrl)};
			const controller = new AbortController();
			controller.abort();
			let uncaughtError;
			process.once("uncaughtException", (error) => { uncaughtError = error; });
			const value = await pingDaemon({ socket: ${JSON.stringify(PATHS.socket)} }, "test-token", 100, controller.signal);
			await new Promise((resolve) => setImmediate(resolve));
			if (value !== null) throw new Error("aborted ping returned a daemon owner");
			if (uncaughtError) throw uncaughtError;
		`;

		const child = spawnSync("bun", ["--eval", script], { encoding: "utf8" });

		expect(child.status, child.stderr).toBe(0);
	});
});

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
	let resolvePromise: (() => void) | undefined;
	const promise = new Promise<void>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: () => resolvePromise?.() };
}

async function settlesWithin(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise.then(
				() => true,
				() => true,
			),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), timeoutMs);
				timer.unref();
			}),
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

function runBunScript(script: string): Promise<{ readonly stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("bun", ["--eval", script], { stdio: ["ignore", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve({ stderr });
			else reject(new Error(`fake startup child exited ${String(code)}: ${stderr}`));
		});
	});
}
