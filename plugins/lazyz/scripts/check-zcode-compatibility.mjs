#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectZcodeHooks } from "../runtime/zcode-contract.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rootIndex = process.argv.indexOf("--root");
const root = resolve(rootIndex === -1 ? pluginRoot : process.argv[rootIndex + 1]);
const ignoredDirectories = new Set(["dist", "fixtures", "node_modules", "test", "tests", "vendor"]);
const userFacingExtensions = new Set([".js", ".json", ".md", ".mjs", ".ts"]);
const unsupportedOrchestration =
	/\b(?:call_omo_agent|background_output|multi_agent_v1\.(?:spawn_agent|wait_agent)|spawn_agent|team_[a-z_]+)\s*\(|\btask\s*\(\s*(?:subagent_type|category|prompt)\s*=/u;
const legacyUlwCommand = /\bomo\s+ulw-loop\b/u;

function filesUnder(directory, filter = () => true) {
	if (!existsSync(directory)) return [];
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...filesUnder(path, filter));
		else if (entry.isFile() && filter(path)) files.push(path);
	}
	return files;
}

function hasZcodeTranslation(content) {
	return (
		content.includes("## ZCode Harness Tool Compatibility") &&
		content.includes("Translate every such example to ZCode's native tools")
	);
}

const violations = [];
const hookPath = join(root, "hooks", "hooks.json");
if (existsSync(hookPath)) {
	try {
		const inspection = inspectZcodeHooks(JSON.parse(readFileSync(hookPath, "utf8")));
		violations.push(...inspection.invalid.map((issue) => `hooks/hooks.json: ${issue}`));
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		violations.push("hooks/hooks.json: malformed JSON");
	}
}
for (const directory of [join(root, "skills"), join(root, "commands")]) {
	for (const path of filesUnder(directory, (candidate) => candidate.endsWith("SKILL.md") || directory.endsWith("commands"))) {
		const content = readFileSync(path, "utf8");
		if (unsupportedOrchestration.test(content) && !hasZcodeTranslation(content)) {
			violations.push(`${relative(root, path)}: missing ZCode compatibility translation`);
		}
	}
}

for (const directory of [
	join(root, "skills"),
	join(root, "commands"),
	join(root, "components", "ulw-loop"),
	join(root, "components", "work-status"),
	join(root, "docs"),
]) {
	for (const path of filesUnder(directory, (candidate) => userFacingExtensions.has(extname(candidate)))) {
		if (legacyUlwCommand.test(readFileSync(path, "utf8"))) {
			violations.push(`${relative(root, path)}: active legacy command; use lazyz ulw-loop`);
		}
	}
}

if (violations.length > 0) {
	process.stderr.write(`${violations.join("\n")}\n`);
	process.exitCode = 1;
} else {
	process.stdout.write("[LazyZ] ZCode compatibility scan passed.\n");
}
