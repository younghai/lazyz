import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scanner = join(pluginRoot, "scripts", "check-zcode-compatibility.mjs");

function createFixture(context) {
	const root = mkdtempSync(join(tmpdir(), "lazyz-zcode-compat-"));
	context.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

function writeFixture(root, relativePath, content) {
	const path = join(root, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function scan(root) {
	return spawnSync(process.execPath, [scanner, "--root", root], { encoding: "utf8" });
}

test("Given unsupported orchestration without translation, when scanned, then it fails", (context) => {
	const root = createFixture(context);
	writeFixture(root, "skills/example/SKILL.md", "# Example\n\ncall_omo_agent(...)\n");
	const result = scan(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /missing ZCode compatibility translation/);
});

test("Given unsupported orchestration with translation, when scanned, then it passes", (context) => {
	const root = createFixture(context);
	writeFixture(
		root,
		"skills/example/SKILL.md",
		"# Example\n\n## ZCode Harness Tool Compatibility\n\nTranslate every such example to ZCode's native tools.\n\ncall_omo_agent(...)\n",
	);
	const result = scan(root);
	assert.equal(result.status, 0, result.stderr);
});

test("Given an active legacy ulw command and a test-only alias, when scanned, then only active usage fails", (context) => {
	const root = createFixture(context);
	writeFixture(root, "docs/guide.md", "Run `omo ulw-loop status`.\n");
	writeFixture(root, "components/ulw-loop/test/legacy.test.ts", 'expect(help).not.toContain("omo ulw-loop");\n');
	const result = scan(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /active legacy command/);
	assert.doesNotMatch(result.stderr, /legacy\.test\.ts/);
});
