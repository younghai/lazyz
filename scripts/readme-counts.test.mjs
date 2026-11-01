import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve(import.meta.dirname, "readme-counts.mjs");
const startMarker = "<!-- lazyz-resource-counts:start -->";
const endMarker = "<!-- lazyz-resource-counts:end -->";

function createFixture() {
	const root = join(tmpdir(), `lazyz-readme-counts-${crypto.randomUUID()}`);
	const plugin = join(root, "plugins", "lazyz");
	for (const directory of [
		"agents",
		"commands",
		"hooks",
		"skills/alpha",
		"skills/beta",
	]) {
		mkdirSync(join(plugin, directory), { recursive: true });
	}
	writeFileSync(join(plugin, "agents", "one.md"), "agent\n");
	writeFileSync(join(plugin, "agents", "two.md"), "agent\n");
	writeFileSync(join(plugin, "commands", "run.md"), "command\n");
	writeFileSync(join(plugin, "skills", "alpha", "SKILL.md"), "skill\n");
	writeFileSync(join(plugin, "skills", "beta", "SKILL.md"), "skill\n");
	writeFileSync(
		join(plugin, "hooks", "hooks.json"),
		JSON.stringify({ hooks: { Start: [{ hooks: [{}, {}] }] } }),
	);
	writeFileSync(
		join(plugin, ".mcp.json"),
		JSON.stringify({ mcpServers: { local: {}, remote: {} } }),
	);
	const stale = `before\n${startMarker}\n> stale\n${endMarker}\nafter\n`;
	writeFileSync(join(root, "README.md"), stale);
	writeFileSync(join(plugin, "README.md"), stale);
	return root;
}

function run(root, mode) {
	return spawnSync(process.execPath, [scriptPath, mode, "--root", root], {
		encoding: "utf8",
	});
}

test("given stale generated markers when checking then the command reports drift", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));

	const result = run(root, "--check");

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /README inventory drift/);
});

test("given stale generated markers when writing then only marker contents change", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));

	const writeResult = run(root, "--write");
	const rootReadme = readFileSync(join(root, "README.md"), "utf8");
	const pluginReadme = readFileSync(
		join(root, "plugins", "lazyz", "README.md"),
		"utf8",
	);
	const checkResult = run(root, "--check");

	assert.equal(writeResult.status, 0, writeResult.stderr);
	assert.equal(rootReadme, pluginReadme);
	assert.match(rootReadme, /^before\n/);
	assert.match(
		rootReadme,
		/2 agents · 2 skills · 2 hooks · 2 MCP servers · 1 command/,
	);
	assert.match(rootReadme, /\nafter\n$/);
	assert.equal(checkResult.status, 0, checkResult.stderr);
});

test("given the repository manifests when checking then both README markers are current", () => {
	const result = run(resolve(import.meta.dirname, ".."), "--check");

	assert.equal(result.status, 0, result.stderr);
});
