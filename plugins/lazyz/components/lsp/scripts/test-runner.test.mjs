import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function makeFixture(t, { files = ["b.test.mjs", "a test.test.mjs"], vitestStatus = 0, nodeStatus = 0 } = {}) {
	const root = await realpath(await mkdtemp(join(tmpdir(), "lazyz-lsp-test-runner-")));
	t.after(() => rm(root, { recursive: true, force: true }));
	const scripts = join(root, "path with spaces", "scripts");
	await mkdir(scripts, { recursive: true });
	const runner = join(scripts, "test.mjs");
	await copyFile(new URL("./test.mjs", import.meta.url), runner);
	for (const name of files) await writeFile(join(scripts, name), "");
	await writeFile(join(scripts, "helper.mjs"), "");
	await mkdir(join(scripts, "directory.test.mjs"));
	const log = join(root, "calls.jsonl");
	const preload = join(root, "capture-spawns.mjs");
	await writeFile(preload, `
import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
childProcess.spawnSync = (command, args, options) => {
	appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args, options }) + "\\n");
	return { status: command === "vitest" ? ${vitestStatus} : ${nodeStatus} };
};
syncBuiltinESMExports();
`);
	const run = () => spawnSync(process.execPath, ["--import", preload, runner, "--reporter=dot"], {
		cwd: root,
		encoding: "utf8",
		timeout: 10_000,
	});
	const calls = async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	return { scripts, run, calls };
}

test("LSP runner passes explicit sorted test paths without shell or Node glob expansion", async (t) => {
	const fixture = await makeFixture(t);
	const result = fixture.run();
	assert.equal(result.status, 0, result.stderr);
	const calls = await fixture.calls();
	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0].args, ["--run", "--reporter=dot"]);
	assert.equal(calls[1].command, process.execPath);
	assert.deepEqual(calls[1].args, ["--test", join(fixture.scripts, "a test.test.mjs"), join(fixture.scripts, "b.test.mjs")]);
	assert.equal(calls[1].options.shell, undefined);
});

test("LSP runner stops when Vitest fails", async (t) => {
	const fixture = await makeFixture(t, { vitestStatus: 7 });
	assert.equal(fixture.run().status, 7);
	assert.equal((await fixture.calls()).length, 1);
});

test("LSP runner propagates Node test failures", async (t) => {
	const fixture = await makeFixture(t, { nodeStatus: 3 });
	assert.equal(fixture.run().status, 3);
});

test("LSP runner rejects an empty test set instead of running an unbounded discovery", async (t) => {
	const fixture = await makeFixture(t, { files: [] });
	const result = fixture.run();
	assert.equal(result.status, 1);
	assert.match(result.stderr, /No Node test files found/);
	assert.equal((await fixture.calls()).length, 1);
});
