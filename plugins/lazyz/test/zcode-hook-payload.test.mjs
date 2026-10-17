import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const pluginRoot = resolve(import.meta.dirname, "..");

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "lazyz-native-payload-"));
	const cwd = join(root, "project");
	const home = join(root, "home");
	const data = join(root, "plugin-data");
	for (const path of [cwd, home, data]) mkdirSync(path);
	mkdirSync(join(cwd, ".git"));
	writeFileSync(join(cwd, "CONTEXT.md"), "Use ZCODE_FIXTURE_RULE for this isolated workspace.\n");
	return { cwd, home, data, legacy: join(root, "legacy") };
}

function hook(f, component, command, input) {
	const result = spawnSync(process.execPath, [join(pluginRoot, "components", component, "dist", "cli.js"), "hook", command], {
		cwd: f.cwd, input: JSON.stringify(input), encoding: "utf8", timeout: 10000,
		env: { PATH: process.env.PATH, HOME: f.home, ZCODE_PLUGIN_ROOT: pluginRoot,
			ZCODE_PLUGIN_DATA: f.data, PLUGIN_DATA: f.legacy, LAZYZ_RULES_DISABLE_BUNDLED: "1" },
	});
	assert.equal(result.status, 0, result.stderr || String(result.error));
	return result.stdout;
}

test("built rules CLI accepts ZCode events without model, turn or transcript metadata", () => {
	const f = fixture();
	for (const [event, command, fields] of [
		["SessionStart", "session-start", { source: "startup" }],
		["UserPromptSubmit", "user-prompt-submit", { prompt: "Implement the scoped task" }],
		["PostToolUse", "post-tool-use", { tool_name: "Write", tool_use_id: "write-1", tool_input: { file_path: join(f.cwd, "sample.ts") }, tool_response: {} }],
	]) {
		const output = hook(f, "rules", command, { hook_event_name: event, session_id: event,
			cwd: f.cwd, permission_mode: "default", ...fields });
		assert.equal(JSON.parse(output).hookSpecificOutput.hookEventName, event);
		assert.match(output, /ZCODE_FIXTURE_RULE/);
	}
	assert.equal(existsSync(f.legacy), false);
});

test("rules and LSP session caches cannot overwrite each other in shared plugin data", () => {
	const f = fixture();
	const rules = join(f.data, "rules", "sessions", "shared.json");
	const lsp = join(f.data, "lsp", "sessions", "shared.json");
	mkdirSync(join(f.data, "lsp", "sessions"), { recursive: true });
	writeFileSync(lsp, JSON.stringify({ unavailableExtensions: [".ts"] }));
	hook(f, "rules", "session-start", { hook_event_name: "SessionStart", session_id: "shared",
		cwd: f.cwd, permission_mode: "default", source: "startup" });
	assert.equal(existsSync(rules), true);
	const before = readFileSync(rules, "utf8");
	hook(f, "lsp", "session-start", { hook_event_name: "SessionStart", session_id: "shared", source: "compact" });
	assert.equal(JSON.parse(readFileSync(lsp, "utf8")).postCompactProbePending, true);
	assert.equal(readFileSync(rules, "utf8"), before);
	assert.equal(existsSync(f.legacy), false);
});

test("telemetry stays silent and creates no state for an opt-out default ZCode payload", () => {
	const f = fixture();
	assert.equal(hook(f, "telemetry", "session-start", { hook_event_name: "SessionStart", session_id: "privacy",
		cwd: f.cwd, permission_mode: "default", source: "startup" }), "");
	assert.deepEqual(readdirSync(f.home), []);
});
