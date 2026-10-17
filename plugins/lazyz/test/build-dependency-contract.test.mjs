import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";

const pluginRoot = join(import.meta.dirname, "..");

test("source builds reuse installed workspace dependencies without running an install", async () => {
	const root = await mkdtemp(join(tmpdir(), "lazyz-build-dependencies-"));
	try {
		const fakeBin = join(root, "bin");
		const npmLog = join(root, "npm.log");
		await mkdir(fakeBin, { recursive: true });
		await writeFile(
			join(fakeBin, "npm"),
			`#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.NPM_LOG, process.argv.slice(2).join(" ") + "\\n");\n`,
		);
		await chmod(join(fakeBin, "npm"), 0o755);

		for (const fixture of [
			{
				label: "lsp-tools-mcp",
				source: join(pluginRoot, "components", "lsp", "scripts", "build-lsp-tools.mjs"),
				script: join("components", "lsp", "scripts", "build-lsp-tools.mjs"),
				packageRoot: join("vendor", "lsp-tools-mcp"),
			},
			{
				label: "lsp-daemon",
				source: join(pluginRoot, "components", "lsp", "scripts", "build-lsp-daemon.mjs"),
				script: join("components", "lsp", "scripts", "build-lsp-daemon.mjs"),
				packageRoot: join("vendor", "lsp-daemon"),
			},
		]) {
			const fixtureRoot = join(root, fixture.label);
			const script = join(fixtureRoot, fixture.script);
			await mkdir(join(fixtureRoot, fixture.packageRoot), { recursive: true });
			await mkdir(join(fixtureRoot, "node_modules"));
			await mkdir(join(script, ".."), { recursive: true });
			await copyFile(fixture.source, script);
			await writeFile(join(fixtureRoot, fixture.packageRoot, "package.json"), "{}\n");
			await writeFile(npmLog, "");

			const result = runScript(script, fixtureRoot, fakeBin, npmLog);

			assert.equal(result.status, 0, result.stderr);
			assert.equal(await readFile(npmLog, "utf8"), "run build\n");
		}

		const bundledRoot = join(root, "bundled");
		const bundledScript = join(bundledRoot, "scripts", "build-bundled-mcp-runtimes.mjs");
		await mkdir(join(bundledRoot, "node_modules"), { recursive: true });
		await mkdir(join(bundledRoot, "scripts"), { recursive: true });
		await copyFile(join(pluginRoot, "scripts", "build-bundled-mcp-runtimes.mjs"), bundledScript);
		await writeFile(npmLog, "");
		await writeRuntime(bundledRoot, "lsp-tools-mcp", ["dist/cli.js", "dist/tools.js"]);
		await writeRuntime(bundledRoot, "lsp-daemon", []);
		await writeRuntime(bundledRoot, "git-bash-mcp", ["dist/cli.js"]);

		const bundledResult = runScript(bundledScript, bundledRoot, fakeBin, npmLog);

		assert.equal(bundledResult.status, 0, bundledResult.stderr);
		assert.equal(await readFile(npmLog, "utf8"), "run build\nrun build\nrun build\n");

		for (const label of ["lsp-tools-mcp", "lsp-daemon", "git-bash-mcp"]) {
			await rm(join(bundledRoot, "vendor", label, "package.json"));
		}
		await mkdir(join(bundledRoot, "vendor", "lsp-daemon", "dist"));
		for (const name of ["cli.js", "index.js", "index.d.ts"]) {
			await writeFile(join(bundledRoot, "vendor", "lsp-daemon", "dist", name), "");
		}
		await writeFile(npmLog, "");
		const distOnlyResult = runScript(bundledScript, bundledRoot, fakeBin, npmLog);
		assert.equal(distOnlyResult.status, 0, distOnlyResult.stderr);
		assert.equal(await readFile(npmLog, "utf8"), "");

		const missingRoot = join(root, "missing");
		const missingScript = join(missingRoot, "components", "lsp", "scripts", "build-lsp-daemon.mjs");
		await mkdir(join(missingRoot, "vendor", "lsp-daemon"), { recursive: true });
		await mkdir(join(missingScript, ".."), { recursive: true });
		await copyFile(join(pluginRoot, "components", "lsp", "scripts", "build-lsp-daemon.mjs"), missingScript);
		await writeFile(join(missingRoot, "vendor", "lsp-daemon", "package.json"), "{}\n");
		await writeFile(npmLog, "");

		const missingResult = runScript(missingScript, missingRoot, fakeBin, npmLog);

		assert.equal(missingResult.status, 1);
		assert.match(missingResult.stderr, /dependencies are not installed/u);
		assert.equal(await readFile(npmLog, "utf8"), "");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

function runScript(script, cwd, fakeBin, npmLog) {
	return spawnSync(process.execPath, [script], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			NPM_LOG: npmLog,
			PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
		},
	});
}

async function writeRuntime(root, label, outputs) {
	const packageRoot = join(root, "vendor", label);
	await mkdir(packageRoot, { recursive: true });
	await writeFile(join(packageRoot, "package.json"), "{}\n");
	for (const output of outputs) {
		const path = join(packageRoot, output);
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, "");
	}
}
