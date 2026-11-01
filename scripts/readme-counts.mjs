#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const START_MARKER = "<!-- lazyz-resource-counts:start -->";
const END_MARKER = "<!-- lazyz-resource-counts:end -->";

function fail(message) {
	throw new Error(message);
}

function countMarkdownFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).filter(
		(entry) => entry.isFile() && entry.name.endsWith(".md"),
	).length;
}

function countSkills(directory) {
	return readdirSync(directory, { withFileTypes: true }).filter(
		(entry) =>
			entry.isDirectory() &&
			existsSync(join(directory, entry.name, "SKILL.md")),
	).length;
}

function readInventory(root) {
	const plugin = join(root, "plugins", "lazyz");
	const hooks = JSON.parse(
		readFileSync(join(plugin, "hooks", "hooks.json"), "utf8"),
	);
	const mcp = JSON.parse(readFileSync(join(plugin, ".mcp.json"), "utf8"));
	const hookCount = Object.values(hooks.hooks).reduce(
		(total, groups) =>
			total +
			groups.reduce((eventTotal, group) => eventTotal + group.hooks.length, 0),
		0,
	);
	return {
		agents: countMarkdownFiles(join(plugin, "agents")),
		skills: countSkills(join(plugin, "skills")),
		hooks: hookCount,
		mcpServers: Object.keys(mcp.mcpServers).length,
		commands: countMarkdownFiles(join(plugin, "commands")),
	};
}

function quantity(count, singular, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

function renderInventory(inventory) {
	return `> Generated inventory: **${[
		quantity(inventory.agents, "agent"),
		quantity(inventory.skills, "skill"),
		quantity(inventory.hooks, "hook"),
		quantity(inventory.mcpServers, "MCP server"),
		quantity(inventory.commands, "command"),
	].join(" · ")}**`;
}

function replaceMarker(content, generated, label) {
	const start = content.indexOf(START_MARKER);
	const end = content.indexOf(END_MARKER);
	if (start < 0 || end < start)
		fail(`${label} is missing generated inventory markers`);
	if (
		content.indexOf(START_MARKER, start + START_MARKER.length) >= 0 ||
		content.indexOf(END_MARKER, end + END_MARKER.length) >= 0
	)
		fail(`${label} has duplicate generated inventory markers`);
	const replacement = `${START_MARKER}\n${generated}\n${END_MARKER}`;
	return `${content.slice(0, start)}${replacement}${content.slice(end + END_MARKER.length)}`;
}

function parseArgs(argv) {
	let mode;
	let root = DEFAULT_ROOT;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--check" || argument === "--write") {
			if (mode !== undefined) fail("choose exactly one of --check or --write");
			mode = argument;
			continue;
		}
		if (argument === "--root" && argv[index + 1] !== undefined) {
			root = resolve(argv[index + 1]);
			index += 1;
			continue;
		}
		fail(`unknown argument: ${argument}`);
	}
	if (mode === undefined) fail("choose exactly one of --check or --write");
	return { mode, root };
}

function main() {
	const { mode, root } = parseArgs(process.argv.slice(2));
	const inventory = readInventory(root);
	const generated = renderInventory(inventory);
	const readmes = [
		join(root, "README.md"),
		join(root, "plugins", "lazyz", "README.md"),
	];
	const drift = [];
	for (const readme of readmes) {
		const current = readFileSync(readme, "utf8");
		const next = replaceMarker(current, generated, readme);
		if (next === current) continue;
		if (mode === "--write") writeFileSync(readme, next);
		else drift.push(readme);
	}
	if (drift.length > 0) fail(`README inventory drift: ${drift.join(", ")}`);
	console.log(`${generated.replace(/^> /, "")} (${mode.slice(2)})`);
}

try {
	main();
} catch (error) {
	console.error(
		`README count sync failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
}
