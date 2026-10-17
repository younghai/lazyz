#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(pluginRoot, "dist", "cli", "index.js");
const provenanceOutput = join(pluginRoot, "dist", "cli", "provenance.json");
const buildContract = { entryPoint: "runtime/cli.mjs", format: "esm", platform: "node", target: "node20" };
await mkdir(dirname(output), { recursive: true });
await build({
	entryPoints: [join(pluginRoot, buildContract.entryPoint)],
	bundle: true,
	platform: buildContract.platform,
	format: buildContract.format,
	target: buildContract.target,
	outfile: output,
});
await chmod(output, 0o755);
const runtimeSources = (await readdir(join(pluginRoot, "runtime")))
	.filter((name) => name.endsWith(".mjs"))
	.map((name) => `runtime/${name}`);
const sourcePaths = [...runtimeSources, "scripts/build-cli.mjs", "package.json"].sort();
const digest = (content) => createHash("sha256").update(content).digest("hex");
const provenance = {
	schemaVersion: 1,
	build: buildContract,
	buildConfigSha256: digest(JSON.stringify(buildContract)),
	output: { path: "dist/cli/index.js", sha256: digest(await readFile(output)) },
	sources: await Promise.all(
		sourcePaths.map(async (path) => ({ path, sha256: digest(await readFile(join(pluginRoot, path))) })),
	),
};
await writeFile(provenanceOutput, `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`[LazyZ] built ${output}\n`);
