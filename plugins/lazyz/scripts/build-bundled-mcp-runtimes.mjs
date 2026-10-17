#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
// LazyZ: vendored MCP runtime sources live under plugins/lazyz/vendor/ rather
// than at the lazycodex repo root.
const repoPackagesRoot = join(pluginRoot, "vendor");

const runtimes = [
	{
		label: "lsp-tools-mcp",
		packageRoot: join(repoPackagesRoot, "lsp-tools-mcp"),
		requiredOutputs: ["dist/cli.js", "dist/tools.js"],
	},
	{
		label: "lsp-daemon",
		packageRoot: join(repoPackagesRoot, "lsp-daemon"),
		requiredOutputs: ["dist/cli.js", "dist/index.js", "dist/index.d.ts"],
	},
	{
		label: "git-bash-mcp",
		packageRoot: join(repoPackagesRoot, "git-bash-mcp"),
		requiredOutputs: ["dist/cli.js"],
	},
];

for (const runtime of runtimes) {
	buildRuntime(runtime);
}

function buildRuntime(runtime) {
	if (!existsSync(join(runtime.packageRoot, "package.json"))) {
		assertBundledDist(runtime);
		console.log(`Using bundled ${runtime.label} dist`);
		return;
	}

	assertDependenciesInstalled(runtime);

	const result = spawnSync("npm", ["run", "build"], {
		cwd: runtime.packageRoot,
		shell: process.platform === "win32",
		stdio: "inherit",
	});
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertDependenciesInstalled(runtime) {
	for (let dir = runtime.packageRoot; ; dir = dirname(dir)) {
		if (existsSync(join(dir, "node_modules"))) return;
		const parent = dirname(dir);
		if (parent === dir) break;
	}

	console.error(
		`Cannot build ${runtime.label}: dependencies are not installed for ${runtime.packageRoot}. Run npm ci at the workspace root before building.`,
	);
	process.exit(1);
}

function assertBundledDist(runtime) {
	const missingOutputs = runtime.requiredOutputs.filter((output) => !existsSync(join(runtime.packageRoot, output)));
	if (missingOutputs.length === 0) return;
	console.error(`Missing bundled ${runtime.label} outputs:`);
	for (const output of missingOutputs) {
		console.error(`  ${join(runtime.packageRoot, output)}`);
	}
	process.exit(1);
}
