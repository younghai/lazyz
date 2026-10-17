import { describe, expect, it } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { executeSessionStartHook, type WorkerSpawnInvocation } from "../src/hook.ts";
import { LAZYZ_CLI_MARKER, runWorkerSetup } from "../src/setup.ts";
import { runBootstrapWorker } from "../src/worker.ts";

function snapshotTree(root: string): Record<string, string> {
	const snapshot: Record<string, string> = {};
	function visit(directory: string, prefix: string): void {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
			const path = join(directory, entry.name);
			const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
			const mode = (lstatSync(path).mode & 0o777).toString(8);
			if (entry.isDirectory()) {
				snapshot[relative] = `directory:${mode}`;
				visit(path, relative);
			} else if (entry.isSymbolicLink()) snapshot[relative] = `symlink:${mode}:${readlinkSync(path)}`;
			else snapshot[relative] = `file:${mode}:${readFileSync(path).toString("base64")}`;
		}
	}
	visit(root, "");
	return snapshot;
}

describe("LazyZ bootstrap setup safety", () => {
	it("Given explicit Codex setup, when setup runs, then Codex config is updated while user-owned omo stays unchanged", async () => {
		// Given
		const root = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-root-"));
		const codexHome = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-codex-"));
		const pluginData = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-data-"));
		const binDir = join(codexHome, "bin");
		const cliPath = join(root, "dist", "cli", "index.js");
		mkdirSync(join(root, "dist", "cli"), { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
		writeFileSync(cliPath, "#!/usr/bin/env node\n");
		writeFileSync(join(codexHome, "config.toml"), "user_owned = true\n");
		writeFileSync(join(binDir, "omo"), "#!/bin/sh\necho user-owned\n");

		// When
		const result = await runWorkerSetup({
			allowCodexWrites: true,
			codexHome,
			env: { CODEX_LOCAL_BIN_DIR: binDir },
			platform: "linux",
			pluginData,
			pluginRoot: root,
		});

		// Then
		expect(result.degraded).toEqual([]);
		const config = readFileSync(join(codexHome, "config.toml"), "utf8");
		expect(config).toStartWith("user_owned = true\n");
		expect(config).toContain('[plugins."omo@sisyphuslabs"]');
		expect(readFileSync(join(binDir, "omo"), "utf8")).toContain("user-owned");
		expect(readlinkSync(join(binDir, "lazyz"))).toBe(cliPath);
		expect(JSON.parse(readFileSync(join(binDir, "lazyz.lazyz-owned.json"), "utf8"))).toMatchObject({
			marker: LAZYZ_CLI_MARKER,
			owner: "lazyz",
		});
	});

	it("Given explicit Codex setup with a marker-owned legacy omo wrapper, when lazyz is linked, then omo is retired with a backup", async () => {
		// Given
		const root = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-root-"));
		const codexHome = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-codex-"));
		const pluginData = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-data-"));
		const binDir = join(codexHome, "bin");
		mkdirSync(join(root, "dist", "cli"), { recursive: true });
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true }));
		writeFileSync(join(root, "dist", "cli", "index.js"), "#!/usr/bin/env node\n");
		writeFileSync(join(binDir, "omo"), "#!/bin/sh\n# OMO_GENERATED_RUNTIME_WRAPPER\n");

		// When
		await runWorkerSetup({
			allowCodexWrites: true,
			codexHome,
			env: { CODEX_LOCAL_BIN_DIR: binDir },
			platform: "linux",
			pluginData,
			pluginRoot: root,
		});

		// Then
		expect(existsSync(join(binDir, "omo"))).toBe(false);
		expect(readdirSync(binDir).some((name) => name.startsWith("omo.lazyz-backup-"))).toBe(true);
		expect(existsSync(join(binDir, "lazyz"))).toBe(true);
	});

	it("Given setup without explicit write consent, when the legacy installer is called, then Codex stays unchanged", async () => {
		const codexHome = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-codex-"));
		const pluginRoot = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-root-"));
		const pluginData = mkdtempSync(join(tmpdir(), "lazyz-bootstrap-data-"));
		writeFileSync(join(codexHome, "config.toml"), "user_owned = true\n");
		const before = snapshotTree(codexHome);

		const result = await runWorkerSetup({ codexHome, env: {}, platform: "linux", pluginData, pluginRoot });

		expect(result).toEqual({ degraded: [] });
		expect(snapshotTree(codexHome)).toEqual(before);
	});

	it("Given SessionStart with an existing Codex home, when its default worker runs, then every Codex entry stays byte-for-byte unchanged", async () => {
		// Given
		const home = mkdtempSync(join(tmpdir(), "lazyz-session-home-"));
		const codexHome = join(home, ".codex");
		const pluginRoot = mkdtempSync(join(tmpdir(), "lazyz-session-plugin-"));
		const pluginData = mkdtempSync(join(tmpdir(), "lazyz-session-data-"));
		mkdirSync(join(codexHome, "agents"), { recursive: true, mode: 0o700 });
		mkdirSync(join(pluginRoot, ".zcode-plugin"), { recursive: true });
		writeFileSync(join(codexHome, "config.toml"), Buffer.from([0, 1, 2, 255]));
		writeFileSync(join(codexHome, "agents", "user.toml"), "user-owned\n");
		writeFileSync(join(pluginRoot, ".zcode-plugin", "plugin.json"), JSON.stringify({ version: "1.2.3" }));
		const env = { CODEX_HOME: codexHome, HOME: home, PLUGIN_DATA: pluginData, ZCODE_PLUGIN_ROOT: pluginRoot };
		const before = snapshotTree(codexHome);
		let invocation: WorkerSpawnInvocation | undefined;

		// When
		const hook = await executeSessionStartHook({
			env,
			now: 1_000,
			spawnWorker: (captured) => {
				invocation = captured;
			},
			stdin: Readable.from(["{}"]),
			writeNotice: () => undefined,
		});
		if (invocation === undefined) throw new Error("SessionStart did not dispatch its worker");
		const worker = await runBootstrapWorker({ env: invocation.env, now: 1_000 });

		// Then
		expect(hook.action).toBe("spawned");
		expect(worker).toMatchObject({ ran: true, status: "success" });
		expect(snapshotTree(codexHome)).toEqual(before);
	});
});
