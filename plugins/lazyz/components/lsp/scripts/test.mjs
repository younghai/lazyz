#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const vitest = spawnSync("vitest", ["--run", ...process.argv.slice(2)], { stdio: "inherit" });
if (vitest.status !== 0) process.exit(vitest.status ?? 1);

const testFiles = readdirSync(new URL("./", import.meta.url), { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
	.map((entry) => fileURLToPath(new URL(entry.name, import.meta.url)))
	.sort();
if (testFiles.length === 0) throw new Error("No Node test files found beside the LSP test runner.");

const nodeTest = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
process.exit(nodeTest.status ?? 1);
