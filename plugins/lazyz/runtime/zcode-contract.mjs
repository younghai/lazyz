// Verified documentation contract, not a probe of the installed host version.
export const ZCODE_HOST_CONTRACT = Object.freeze({
	schemaVersion: 1,
	reviewedAt: "2026-10-07",
	source: "https://zcode.z.ai/en/docs/hooks",
	hostVerified: false,
	sourceVersion: "3.14.3",
	sourceCommit: "29628c9acdb81b703bbd4080c207a0e7ce5e276e",
	agentDiscovery: "enabled-plugin-agents",
	defaultAgentModel: "inherit",
	governedAgentExecution: "foreground",
	events: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop"],
	executor: "process",
	minimumNodeMajor: 20,
	stopConsecutiveBlockLimit: 3,
	defaultMaxOutputBytes: 32768,
	pluginDataEnvironment: "ZCODE_PLUGIN_DATA",
	transcriptLifetime: "hook-invocation",
	optionalMetadata: ["model", "turn_id"],
	unsupportedEvents: ["PostCompact", "SubagentStop"],
});

export function inspectZcodeHooks(manifest) {
	const invalid = [];
	const paths = [];
	let processCount = 0;
	let commandCount = 0;
	if (!manifest || typeof manifest.hooks !== "object" || manifest.hooks === null || Array.isArray(manifest.hooks)) {
		return { id: "zcode-hooks", status: "fail", invalid: ["hooks must be an event map"], paths };
	}
	for (const [event, groups] of Object.entries(manifest.hooks)) {
		if (!ZCODE_HOST_CONTRACT.events.includes(event)) invalid.push(`${event}: unsupported ZCode event`);
		if (!Array.isArray(groups)) { invalid.push(`${event}: groups must be an array`); continue; }
		for (const [groupIndex, group] of groups.entries()) {
			const label = `${event}[${groupIndex}]`;
			if (!Array.isArray(group?.hooks)) { invalid.push(`${label}: hooks must be an array`); continue; }
			if (group.matcher !== undefined && typeof group.matcher !== "string") invalid.push(`${label}: invalid matcher`);
			for (const hook of group.hooks) {
				if (!hook || typeof hook.command !== "string" || !hook.command.trim()) {
					invalid.push(`${label}: command is required`);
					continue;
				}
				if (hook.type === "process") {
					processCount += 1;
					if (!Array.isArray(hook.args) || hook.args.some((arg) => typeof arg !== "string")) {
						invalid.push(`${label}: process args must be a string array`);
						continue;
					}
					if (hook.async === true) invalid.push(`${label}: process hooks cannot run asynchronously`);
					for (const arg of [hook.command, ...hook.args]) {
						if (arg.startsWith("${ZCODE_PLUGIN_ROOT}/")) paths.push(arg.slice("${ZCODE_PLUGIN_ROOT}/".length));
					}
				} else if (hook.type === "command") {
					commandCount += 1;
					for (const match of hook.command.matchAll(/\$\{ZCODE_PLUGIN_ROOT\}\/([^\s"']+)/g)) paths.push(match[1]);
					if (hook.async === true && ["PreToolUse", "PermissionRequest", "Stop"].includes(event)) {
						invalid.push(`${label}: asynchronous output cannot enforce a decision`);
					}
				} else invalid.push(`${label}: unsupported hook type`);
				const timeout = hook.timeoutMs ?? (hook.timeout === undefined ? undefined : hook.timeout * 1000);
				if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) invalid.push(`${label}: invalid timeout`);
			}
		}
	}
	return { id: "zcode-hooks", status: invalid.length === 0 ? "pass" : "fail", invalid, paths: [...new Set(paths)].sort(), processCount, commandCount };
}
