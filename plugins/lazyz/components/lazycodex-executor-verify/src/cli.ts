#!/usr/bin/env node
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
	runPostToolUseFailureHook,
	runPostToolUseHook,
	runPreToolUseHook,
	runStopHook,
	runSubagentStopHook,
} from "./codex-hook.js";
import type { HookFileSystem } from "./types.js";

const nodeFileSystem: HookFileSystem = {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
};

const command = process.argv[2];
const subcommand = process.argv[3];

if (
	command === "hook" &&
	["pre-tool-use", "post-tool-use", "post-tool-use-failure", "stop", "subagent-stop"].includes(subcommand ?? "")
) {
	await runHookCli();
} else {
	process.stderr.write(
		"Usage: lazycodex-executor-verify hook <pre-tool-use|post-tool-use|post-tool-use-failure|stop|subagent-stop>\n",
	);
	process.exitCode = 1;
}

async function runHookCli(): Promise<void> {
	const raw = await readStdin();
	if (raw.trim().length === 0) return;
	const parsed = parseHookInput(raw);
	const output = routeHook(parsed);
	if (output.length > 0) processStdout.write(output);
}

function routeHook(input: unknown): string {
	switch (subcommand) {
		case "pre-tool-use":
			return runPreToolUseHook(input, nodeFileSystem);
		case "post-tool-use":
			return runPostToolUseHook(input, nodeFileSystem);
		case "post-tool-use-failure":
			return runPostToolUseFailureHook(input, nodeFileSystem);
		case "stop":
			return runStopHook(input, nodeFileSystem);
		case "subagent-stop":
			return runSubagentStopHook(input, nodeFileSystem);
		default:
			return "";
	}
}

function parseHookInput(raw: string): unknown | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed;
	} catch (error) {
		if (error instanceof SyntaxError) return undefined;
		throw error;
	}
}

function readStdin(): Promise<string> {
	return new Promise((resolve) => {
		let data = "";
		processStdin.setEncoding("utf8");
		processStdin.on("data", (chunk: string) => {
			data += chunk;
		});
		processStdin.once("error", () => resolve(data));
		processStdin.once("end", () => resolve(data));
	});
}
