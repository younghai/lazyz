#!/usr/bin/env node
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";

import { runStopHook } from "./codex-hook.js";
import type { ReadWriteFileSystem } from "./types.js";

const nodeFileSystem: ReadWriteFileSystem = {
	readFileSync(path, encoding) {
		return readFileSync(path, encoding);
	},
	existsSync(path) {
		return existsSync(path);
	},
	mkdirSync(path, options) {
		mkdirSync(path, options);
	},
	writeFileSync(path, data) {
		writeFileSync(path, data);
	},
	renameSync(from, to) {
		renameSync(from, to);
	},
	rmSync(path, options) {
		rmSync(path, options);
	},
};

const command = process.argv[2];
const subcommand = process.argv[3];

if (command === "hook" && (subcommand === "stop" || subcommand === "subagent-stop")) {
	await runHookCli();
} else {
	process.stderr.write("Usage: omo-start-work-continuation hook <stop|subagent-stop>\n");
	process.exitCode = 1;
}

async function runHookCli(): Promise<void> {
	const raw = await readStdin();
	if (raw.trim().length === 0) return;
	const parsed = parseHookInput(raw);
	const output = runStopHook(parsed, nodeFileSystem);
	if (output.length > 0) processStdout.write(output);
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
