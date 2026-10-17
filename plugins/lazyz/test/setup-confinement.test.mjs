import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applySetupPlan, buildSetupPlan } from "../runtime/setup.mjs";

test("Given linked agent ancestors, when setup runs, then outside files are untouched", async () => {
	const root = await mkdtemp(join(tmpdir(), "lazyz-setup-boundary-"));
	try {
		// given
		const home = join(root, "home");
		const outside = join(root, "outside");
		const pluginRoot = join(root, "plugin");
		await mkdir(join(home, ".zcode"), { recursive: true });
		await mkdir(outside);
		await mkdir(join(pluginRoot, "agents"), { recursive: true });
		await writeFile(join(pluginRoot, "agents", "executor.md"), "fixture");
		await symlink(outside, join(home, ".zcode", "agents"));
		const plan = await buildSetupPlan({ home, pluginRoot, target: "zcode", dryRun: false });
		// when / then
		await assert.rejects(applySetupPlan(plan));
		assert.deepEqual(await readdir(outside), []);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("Given no Codex agents, when setup runs, then it leaves the working directory untouched", async () => {
	const root = await mkdtemp(join(tmpdir(), "lazyz-setup-empty-"));
	try {
		// given
		const home = join(root, "home");
		const cwd = join(root, "cwd");
		const pluginRoot = join(root, "plugin");
		await mkdir(home);
		await mkdir(cwd);
		await mkdir(join(pluginRoot, "components"), { recursive: true });
		// when
		const result = spawnSync(process.execPath, [join(import.meta.dirname, "../runtime/cli.mjs"), "setup", "--target", "codex", "--yes", "--json"], {
			cwd, env: { ...process.env, HOME: home, LAZYZ_PLUGIN_ROOT: pluginRoot }, encoding: "utf8",
		});
		// then
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(await readdir(cwd), []);
	} finally { await rm(root, { recursive: true, force: true }); }
});
