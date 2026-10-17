#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReleasePayload } from "../runtime/release-payload.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
if (!output) {
	process.stderr.write("Usage: node scripts/build-release-payload.mjs --output <empty-directory> [--source-commit <sha>]\n");
	process.exit(2);
}
const commitIndex = process.argv.indexOf("--source-commit");
const sourceCommit =
	(commitIndex === -1 ? undefined : process.argv[commitIndex + 1]) ??
	execFileSync("git", ["rev-parse", "HEAD"], { cwd: pluginRoot, encoding: "utf8" }).trim();
const manifest = await buildReleasePayload({ outputRoot: resolve(output), sourceCommit, sourceRoot: pluginRoot });
process.stdout.write(`[LazyZ] staged ${manifest.files.length} files at ${resolve(output)}\n`);
