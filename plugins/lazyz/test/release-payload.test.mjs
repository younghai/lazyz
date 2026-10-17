import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildReleasePayload } from "../runtime/release-payload.mjs";

test("Given a repository tree, when a payload is staged, then only runtime artifacts are hashed with mode and source commit", async () => {
	const source = await mkdtemp(join(tmpdir(), "lazyz-payload-src-"));
	const output = await mkdtemp(join(tmpdir(), "lazyz-payload-out-"));
	for (const path of [
		".omo/evidence",
		".pytest_cache",
		"dist/cli",
		"components/demo/dist",
		"components/demo/src",
		"release/previous",
		"runtime/ast-grep-mcp",
		"scripts",
		"skills/teammode",
		"test",
		"vendor/duplicate",
		"vendor/lsp-daemon/dist",
		"vendor/lsp-daemon/src",
	]) {
		mkdirSync(join(source, path), { recursive: true });
	}
	writeFileSync(join(source, "package.json"), "{}\n");
	writeFileSync(join(source, ".env"), "TOKEN=fixture-secret\n");
	writeFileSync(join(source, ".omo/evidence/private-note.txt"), "private\n");
	writeFileSync(join(source, ".pytest_cache/CACHEDIR.TAG"), "cache\n");
	writeFileSync(join(source, "dist/cli/index.js"), "runtime\n", { mode: 0o755 });
	writeFileSync(join(source, "components/demo/dist/cli.js"), "component\n");
	writeFileSync(join(source, "components/demo/src/cli.ts"), "source\n");
	writeFileSync(join(source, "runtime/ast-grep-mcp/cli.js"), "ast grep runtime\n");
	writeFileSync(join(source, "scripts/run-hook.sh"), "#!/bin/sh\n", { mode: 0o755 });
	writeFileSync(join(source, "scripts/build-cli.mjs"), "build\n");
	writeFileSync(join(source, "scripts/build-release-payload.mjs"), "build\n");
	writeFileSync(join(source, "scripts/migrate-codex-config.mjs"), "migrate\n");
	writeFileSync(join(source, "skills/teammode/SKILL.md"), "team mode\n");
	writeFileSync(join(source, "release/previous/duplicate.txt"), "old release\n");
	writeFileSync(join(source, "test/cli.test.mjs"), "test\n");
	writeFileSync(join(source, "vendor/duplicate/file.js"), "vendor\n");
	writeFileSync(join(source, "vendor/lsp-daemon/dist/cli.js"), "lsp runtime\n");
	writeFileSync(join(source, "vendor/lsp-daemon/src/cli.ts"), "lsp source\n");
	writeFileSync(join(source, "package-lock.json"), "{}\n");

	const manifest = await buildReleasePayload({ outputRoot: output, sourceCommit: "abc123", sourceRoot: source });
	assert.equal(manifest.sourceCommit, "abc123");
	assert.deepEqual(
		manifest.files.map((file) => file.path),
		[
			"components/demo/dist/cli.js",
			"dist/cli/index.js",
			"package.json",
			"runtime/ast-grep-mcp/cli.js",
			"scripts/run-hook.sh",
			"skills/teammode/SKILL.md",
			"vendor/lsp-daemon/dist/cli.js",
		],
	);
	assert.match(manifest.files[0].sha256, /^[a-f0-9]{64}$/);
	assert.equal(manifest.files[1].mode, "0755");
	const written = JSON.parse(readFileSync(join(output, "payload-manifest.json"), "utf8"));
	assert.deepEqual(written, manifest);
});
