import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runDoctor } from "../runtime/doctor.mjs";
import { inspectZcodeHooks } from "../runtime/zcode-contract.mjs";

async function hookFixture(hook) {
	const root = await mkdtemp(join(tmpdir(), "lazyz-process-hook-"));
	await mkdir(join(root, "hooks"));
	await writeFile(join(root, "hooks/hooks.json"), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [hook] }] } }));
	await writeFile(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
	return root;
}

test("doctor rejects a missing process-hook entrypoint passed through args", async () => {
	// Given a documented ZCode process hook whose script is missing.
	const root = await hookFixture({ type: "process", command: "node", args: ["${ZCODE_PLUGIN_ROOT}/components/missing/dist/cli.js", "hook", "pre-tool-use"], timeoutMs: 1000 });
	// When doctor resolves the argv-based entrypoint.
	const report = await runDoctor({ env: {}, home: root, pluginRoot: root });
	// Then the missing script is reported, not silently omitted.
	assert.ok(report.checks.find((check) => check.id === "entrypoints").invalid.includes("components/missing/dist/cli.js: missing or unreadable"));
});

test("doctor rejects a process-hook path escaping the plugin root", async () => {
	// Given a traversal hidden inside an argv entry.
	const root = await hookFixture({ type: "process", command: "node", args: ["${ZCODE_PLUGIN_ROOT}/../outside.js"], timeoutMs: 1000 });
	// When the configured hook is inspected.
	const report = await runDoctor({ env: {}, home: root, pluginRoot: root });
	// Then it is rejected before access outside the plugin.
	assert.ok(report.checks.find((check) => check.id === "entrypoints").invalid.includes("../outside.js: unsafe path"));
});

test("the hook contract rejects asynchronous decision hooks and unsupported events", () => {
	// Given unsupported completion and a fire-and-forget permission gate.
	const manifest = { hooks: {
		SubagentStop: [],
		PreToolUse: [{ hooks: [{ type: "command", command: "node gate.js", async: true }] }],
	} };
	// When the host contract is checked.
	const report = inspectZcodeHooks(manifest);
	// Then neither unsupported decision path is accepted.
	assert.equal(report.status, "fail");
	assert.equal(report.invalid.length, 2);
});

test("process argv preserves spaces and Unicode in a plugin-relative path", () => {
	// Given a direct argv argument with no shell quoting.
	const manifest = { hooks: { SessionStart: [{ hooks: [{ type: "process", command: "node", args: ["${ZCODE_PLUGIN_ROOT}/folder with spaces/한글.mjs"], timeoutMs: 5000 }] }] } };
	// When entrypoints are extracted.
	const report = inspectZcodeHooks(manifest);
	// Then the entire path is retained as one argument.
	assert.deepEqual(report.paths, ["folder with spaces/한글.mjs"]);
	assert.equal(report.status, "pass");
});
