import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type HookCommand = { readonly command?: unknown; readonly args?: unknown };
type HookGroup = { readonly hooks?: unknown };

const pluginRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const hooksConfigPath = resolve(pluginRoot, "hooks/hooks.json");

function sessionStartCommands(config: unknown): readonly string[] {
	if (typeof config !== "object" || config === null || !("hooks" in config)) return [];
	const hooks = config.hooks;
	if (typeof hooks !== "object" || hooks === null || !("SessionStart" in hooks)) return [];
	const groups = hooks.SessionStart;
	if (!Array.isArray(groups)) return [];
	return groups.flatMap((group: HookGroup) =>
		Array.isArray(group.hooks)
			? group.hooks.flatMap((hook: HookCommand) => {
				if (typeof hook.command !== "string") return [];
				const args = Array.isArray(hook.args) ? hook.args.filter((arg: unknown) => typeof arg === "string") : [];
				return [[hook.command, ...args].join(" ")];
			})
			: [],
	);
}

describe("CodeGraph hook registration", () => {
	it("#given ZCode hook config #when inspected #then CodeGraph is registered after bootstrap SessionStart", () => {
		// given
		const hooksConfig: unknown = JSON.parse(readFileSync(hooksConfigPath, "utf8"));

		// when
		const commands = sessionStartCommands(hooksConfig);
		const bootstrapIndex = commands.findIndex((command) => command.includes("components/bootstrap/dist/cli.js"));
		const codegraphIndex = commands.findIndex((command) => command.includes("components/codegraph/dist/cli.js"));

		// then
		expect(bootstrapIndex).toBeGreaterThanOrEqual(0);
		expect(codegraphIndex).toBeGreaterThan(bootstrapIndex);
		expect(commands[codegraphIndex]).toContain("${ZCODE_PLUGIN_ROOT}");
	});
});
