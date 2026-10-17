import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createUlwLoopPlan } from "../src/plan-crud.js";
import { readUlwLoopPlan } from "../src/plan-io.js";

const execFileAsync = promisify(execFile);
const componentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(componentRoot, "dist", "cli.js");
const temporaryRoots: string[] = [];
const OWNER_TOKENS = {
	abandoned: "00000000-0000-4000-8000-000000000001",
	live: "00000000-0000-4000-8000-000000000002",
	observed: "00000000-0000-4000-8000-000000000003",
	recovery: "00000000-0000-4000-8000-000000000004",
	orphaned: "00000000-0000-4000-8000-000000000005",
} as const;

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

async function runCli(repoRoot: string, args: readonly string[]): Promise<void> {
	await execFileAsync(process.execPath, [cliPath, "ulw-loop", ...args], {
		cwd: repoRoot,
		env: {
			...process.env,
			OMO_ULW_LOOP_SESSION_ID: "",
			CODEX_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		},
	});
}

async function runCliWithLockWait(repoRoot: string, waitMs: string): Promise<void> {
	await execFileAsync(process.execPath, [cliPath, "ulw-loop", "create-goals", "--brief", "blocked"], {
		cwd: repoRoot,
		env: {
			...process.env,
			OMO_ULW_LOOP_LOCK_WAIT_MS: waitMs,
			OMO_ULW_LOOP_SESSION_ID: "",
			CODEX_SESSION_ID: "",
			CODEX_THREAD_ID: "",
		},
	});
}

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ulw-loop storage", () => {
	describe("#given concurrent CLI processes", () => {
		it("#then preserves every independently added goal", async () => {
			// Given: one plan shared by separate Node processes.
			const repoRoot = await temporaryRoot("lazyz-ulw-race-");
			await runCli(repoRoot, ["create-goals", "--brief", "# Goal\nInitial goal"]);

			// When: independent CLI processes mutate the plan concurrently.
			const additions = Array.from({ length: 16 }, (_, index) =>
				runCli(repoRoot, [
					"add-goal",
					"--title",
					`Concurrent ${index}`,
					"--objective",
					`Preserve concurrent goal ${index}`,
				]),
			);
			await Promise.all(additions);

			// Then: no completed mutation is lost from either durable record.
			const plan = await readUlwLoopPlan(repoRoot);
			const ledger = await readFile(join(repoRoot, ".omo", "ulw-loop", "ledger.jsonl"), "utf8");
			expect(plan.goals).toHaveLength(17);
			expect(ledger.match(/"kind":"goal_added"/g)).toHaveLength(16);
		});
	});

	describe("#given an existing mutation lock", () => {
		it("#then recovers a lock whose owner process has exited", async () => {
			// Given: a lock record owned by a PID that cannot be alive.
			const repoRoot = await temporaryRoot("lazyz-ulw-stale-lock-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			await mkdir(stateRoot, { recursive: true });
			await writeFile(
				join(stateRoot, ".mutation.lock"),
				`${JSON.stringify({ version: 1, pid: 2_147_483_647, token: OWNER_TOKENS.abandoned, acquiredAt: "2026-01-01T00:00:00.000Z" })}\n`,
				"utf8",
			);

			// When: a new mutation needs the abandoned lock.
			await createUlwLoopPlan(repoRoot, { brief: "# Goal\nRecover abandoned lock" });

			// Then: the mutation completes and owner cleanup leaves no lock artifact.
			expect(await readUlwLoopPlan(repoRoot)).toMatchObject({ version: 1 });
			expect((await readdir(stateRoot)).filter((entry) => entry.includes(".mutation.lock"))).toEqual([]);
		});

		it("#then times out without removing a live owner's lock", async () => {
			// Given: a lock owned by the still-running test process.
			const repoRoot = await temporaryRoot("lazyz-ulw-live-lock-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const lockPath = join(stateRoot, ".mutation.lock");
			const owner = { version: 1, pid: process.pid, token: OWNER_TOKENS.live, acquiredAt: new Date().toISOString() };
			await mkdir(stateRoot, { recursive: true });
			await writeFile(lockPath, `${JSON.stringify(owner)}\n`, "utf8");

			// When: another process waits for a bounded interval.
			const operation = execFileAsync(
				process.execPath,
				[cliPath, "ulw-loop", "create-goals", "--brief", "blocked"],
				{
					cwd: repoRoot,
					env: {
						...process.env,
						OMO_ULW_LOOP_LOCK_WAIT_MS: "60",
						OMO_ULW_LOOP_SESSION_ID: "",
						CODEX_SESSION_ID: "",
						CODEX_THREAD_ID: "",
					},
				},
			);

			// Then: it fails boundedly and preserves the live owner's record.
			await expect(operation).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Timed out") });
			expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(owner);
		});

		it("#then does not reap an observed stale lock while another recovery owns the guard", async () => {
			// Given: one recovery owns the guard while the abandoned lock still exists.
			const repoRoot = await temporaryRoot("lazyz-ulw-recovery-race-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const lockPath = join(stateRoot, ".mutation.lock");
			const recoveryPath = `${lockPath}.recovery`;
			const abandoned = {
				version: 1,
				pid: 2_147_483_647,
				token: OWNER_TOKENS.observed,
				acquiredAt: "2026-01-01T00:00:00.000Z",
			};
			const recoveryOwner = {
				version: 1,
				pid: process.pid,
				token: OWNER_TOKENS.recovery,
				acquiredAt: new Date().toISOString(),
			};
			await mkdir(stateRoot, { recursive: true });
			await writeFile(lockPath, `${JSON.stringify(abandoned)}\n`, "utf8");
			await writeFile(recoveryPath, `${JSON.stringify(recoveryOwner)}\n`, "utf8");

			// When: a second process attempts recovery during that deterministic interleaving.
			const operation = runCliWithLockWait(repoRoot, "60");

			// Then: it fails closed without renaming the lock from its stale observation.
			await expect(operation).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Timed out") });
			expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(abandoned);
			expect(JSON.parse(await readFile(recoveryPath, "utf8"))).toEqual(recoveryOwner);
		});

		it("#then fails closed when an orphaned recovery guard blocks an unlocked state", async () => {
			// Given: a crashed recovery left only its guard behind.
			const repoRoot = await temporaryRoot("lazyz-ulw-orphan-recovery-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const recoveryPath = join(stateRoot, ".mutation.lock.recovery");
			const orphan = {
				version: 1,
				pid: 2_147_483_647,
				token: OWNER_TOKENS.orphaned,
				acquiredAt: "2026-01-01T00:00:00.000Z",
			};
			await mkdir(stateRoot, { recursive: true });
			await writeFile(recoveryPath, `${JSON.stringify(orphan)}\n`, "utf8");

			// When: a process attempts a new mutation.
			const operation = runCliWithLockWait(repoRoot, "60");

			// Then: bounded failure preserves the orphan guard and creates no plan.
			await expect(operation).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Timed out") });
			expect(JSON.parse(await readFile(recoveryPath, "utf8"))).toEqual(orphan);
			await expect(readFile(join(stateRoot, "goals.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		});

		it.each([
			"",
			"not-json",
		])("#then boundedly fails closed for an empty or invalid owner record", async (ownerRecord) => {
			const repoRoot = await temporaryRoot("lazyz-ulw-invalid-owner-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const lockPath = join(stateRoot, ".mutation.lock");
			await mkdir(stateRoot, { recursive: true });
			await writeFile(lockPath, ownerRecord, "utf8");

			const operation = runCliWithLockWait(repoRoot, "60");

			await expect(operation).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Timed out") });
			expect(await readFile(lockPath, "utf8")).toBe(ownerRecord);
			await expect(readFile(join(stateRoot, "goals.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		});

		it("#then rejects a traversal token before it can rename outside the state directory", async () => {
			// Given: an abandoned owner token that would traverse through a prepared path segment.
			const repoRoot = await temporaryRoot("lazyz-ulw-owner-traversal-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const lockPath = join(stateRoot, ".mutation.lock");
			const outsideSentinel = join(repoRoot, "outside.stale");
			const maliciousOwner = {
				version: 1,
				pid: 2_147_483_647,
				token: "holder/../../../outside",
				acquiredAt: "2026-01-01T00:00:00.000Z",
			};
			await mkdir(join(stateRoot, ".mutation.lock.holder"), { recursive: true });
			await writeFile(lockPath, `${JSON.stringify(maliciousOwner)}\n`, "utf8");
			await writeFile(outsideSentinel, "outside-sentinel", "utf8");

			// When: another process encounters the malformed abandoned owner.
			const operation = runCliWithLockWait(repoRoot, "60");

			// Then: it fails closed without renaming or overwriting outside the state directory.
			await expect(operation).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Timed out") });
			expect(await readFile(outsideSentinel, "utf8")).toBe("outside-sentinel");
			expect(JSON.parse(await readFile(lockPath, "utf8"))).toEqual(maliciousOwner);
		});
	});

	describe("#given linked state paths", () => {
		it.each([
			".omo",
			".omo/ulw-loop",
		])("#then refuses an external %s directory before writing", async (linkedPath) => {
			// Given: a repository state directory linked outside the repository.
			const repoRoot = await temporaryRoot("lazyz-ulw-repo-");
			const externalRoot = await temporaryRoot("lazyz-ulw-external-");
			const absoluteLink = join(repoRoot, linkedPath);
			await mkdir(dirname(absoluteLink), { recursive: true });
			await symlink(externalRoot, absoluteLink, "dir");

			// When: plan creation would write the brief, snapshot, and ledger.
			const operation = createUlwLoopPlan(repoRoot, { brief: "# Goal\nDo not escape" });

			// Then: the linked path is rejected and the external directory stays untouched.
			await expect(operation).rejects.toMatchObject({ code: "ULW_LOOP_PATH_ESCAPE" });
			await expect(readFile(join(externalRoot, "brief.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
			await expect(readFile(join(externalRoot, "goals.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
			await expect(readFile(join(externalRoot, "ledger.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
		});

		it.each([
			"brief.md",
			"goals.json",
			"ledger.jsonl",
		])("#then refuses an external %s file before mutation", async (fileName) => {
			// Given: one ulw-loop state file linked to an external sentinel.
			const repoRoot = await temporaryRoot("lazyz-ulw-repo-");
			const externalRoot = await temporaryRoot("lazyz-ulw-external-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const sentinel = join(externalRoot, fileName);
			await mkdir(stateRoot, { recursive: true });
			await writeFile(sentinel, "outside-sentinel", "utf8");
			await symlink(sentinel, join(stateRoot, fileName), "file");

			// When: force creation would otherwise overwrite every state file.
			const operation = createUlwLoopPlan(repoRoot, { brief: "# Goal\nDo not escape", force: true });

			// Then: the linked file is rejected before the sentinel changes.
			await expect(operation).rejects.toMatchObject({ code: "ULW_LOOP_PATH_ESCAPE" });
			expect(await readFile(sentinel, "utf8")).toBe("outside-sentinel");
		});

		it("#then refuses reading a plan through an external file link", async () => {
			// Given: a valid-looking external plan linked into the repository state directory.
			const repoRoot = await temporaryRoot("lazyz-ulw-repo-");
			const externalRoot = await temporaryRoot("lazyz-ulw-external-");
			const stateRoot = join(repoRoot, ".omo", "ulw-loop");
			const externalPlan = join(externalRoot, "goals.json");
			await mkdir(stateRoot, { recursive: true });
			await writeFile(externalPlan, '{"version":1,"goals":[]}', "utf8");
			await symlink(externalPlan, join(stateRoot, "goals.json"), "file");

			// When: the plan is read through the public storage boundary.
			const operation = readUlwLoopPlan(repoRoot);

			// Then: the linked file is rejected rather than trusted.
			await expect(operation).rejects.toMatchObject({ code: "ULW_LOOP_PATH_ESCAPE" });
		});
	});
});
