import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const pluginRoot = new URL("..", import.meta.url).pathname;

test("ast-grep MCP staged runtime matches its manifest and serves the bounded tool surface", async () => {
	// Given: the plugin MCP declaration and staged runtime contract.
	const mcp = JSON.parse(await readFile(join(pluginRoot, ".mcp.json"), "utf8"));
	const astGrep = mcp.mcpServers.ast_grep;
	assert.deepEqual(astGrep, {
		command: "node",
		args: ["runtime/ast-grep-mcp/cli.js"],
		cwd: ".",
		enabled: true,
		timeoutMs: 30000,
	});
	const runtimePath = join(pluginRoot, astGrep.args[0]);
	const manifestPath = join(pluginRoot, "runtime", "ast-grep-mcp", "manifest.json");

	// When: the committed artifact and its MCP handshake are inspected.
	const [runtime, manifestText, runtimeStat] = await Promise.all([
		readFile(runtimePath),
		readFile(manifestPath, "utf8"),
		stat(runtimePath),
	]);
	const manifest = JSON.parse(manifestText);
	const input = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
		{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
	]
		.map((request) => JSON.stringify(request))
		.join("\n") + "\n";
	const handshake = spawnSync(process.execPath, [runtimePath], {
		input,
		encoding: "utf8",
		timeout: 10_000,
	});

	// Then: the manifest is current and only search/scan/rewrite are exposed.
	assert.equal(handshake.status, 0, handshake.stderr);
	assert.equal(createHash("sha256").update(runtime).digest("hex"), manifest.sha256);
	if (process.platform !== "win32") assert.equal(runtimeStat.mode & 0o777, manifest.mode);
	const responses = handshake.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
	assert.equal(responses[0].result.serverInfo.name, "ast_grep");
	assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ["search", "rewrite", "scan"]);
});
