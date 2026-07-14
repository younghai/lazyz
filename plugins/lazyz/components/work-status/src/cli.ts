#!/usr/bin/env node
import { stdout as processStdout } from "node:process";

import { runSessionStartResume, type SessionStartInput } from "./hook.js";
import { readInProgressStartWork, readInProgressUlwLoop } from "./work-status.js";

const command = process.argv[2];

if (command === "hook" && process.argv[3] === "session-start") {
	await runHookCli();
} else if (command === "query") {
	runQueryCli(process.argv[3] ?? process.cwd());
} else {
	process.stderr.write("Usage: lazyz-work-status hook session-start | query [cwd]\n");
	process.exitCode = 1;
}

// --------------------------------------------------------------------------
// `hook session-start` — stdin is the SessionStart payload.
//
// The plugin root is passed via the ZCODE_PLUGIN_ROOT env var (expanded by
// ZCode from the hook's `${ZCODE_PLUGIN_ROOT}` template variable). We fall
// back to CLAUDE_PLUGIN_ROOT for compatibility. When neither is present
// (e.g. running manually in dev), the build-missing check (T6) is skipped.
// --------------------------------------------------------------------------

async function runHookCli(): Promise<void> {
	const raw = await readStdin();
	if (raw.trim().length === 0) return;
	const parsed = parseJson(raw);
	if (!isSessionStartInput(parsed)) return;
	const pluginRoot =
		process.env["ZCODE_PLUGIN_ROOT"] ??
		process.env["CLAUDE_PLUGIN_ROOT"] ??
		"";
	const output = runSessionStartResume(parsed, {
		pluginRoot: pluginRoot.length > 0 ? pluginRoot : undefined,
	});
	if (output.length > 0) processStdout.write(output);
}

function isSessionStartInput(value: unknown): value is SessionStartInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "SessionStart" &&
		typeof value["session_id"] === "string" &&
		typeof value["cwd"] === "string"
	);
}

// --------------------------------------------------------------------------
// `query [cwd]` — print a machine-readable progress snapshot (for the C
// progress-display feature). Prints JSON to stdout. Always exits 0;
// "no work" prints `{"work":"none"}`.
// --------------------------------------------------------------------------

function runQueryCli(cwd: string): void {
	const startWork = readInProgressStartWork(cwd);
	if (startWork !== null) {
		processStdout.write(`${JSON.stringify(serializeStartWork(startWork))}\n`);
		return;
	}
	const ulwLoop = readInProgressUlwLoop(cwd);
	if (ulwLoop !== null) {
		processStdout.write(`${JSON.stringify(serializeUlwLoop(ulwLoop))}\n`);
		return;
	}
	processStdout.write(`${JSON.stringify({ work: "none" })}\n`);
}

function serializeStartWork(s: ReturnType<typeof readInProgressStartWork>) {
	if (s === null) return null;
	return {
		kind: s.kind,
		planName: s.planName,
		planPath: s.planPath,
		status: s.status ?? "unknown",
		worktreePath: s.worktreePath,
		progress: {
			completed: s.checklist.completed,
			remaining: s.checklist.remaining,
			total: s.checklist.total,
			nextTaskLabel: s.checklist.nextTaskLabel,
		},
		// INTENTIONAL: no ETA field. Effort estimates from checkbox counts are
		// unreliable and erode user trust (PM DoD decision).
	};
}

function serializeUlwLoop(s: ReturnType<typeof readInProgressUlwLoop>) {
	if (s === null) return null;
	return {
		kind: s.kind,
		goalsPath: s.goalsPath,
		goals: s.goals,
		criteria: {
			passed: s.passedCriteria,
			total: s.totalCriteria,
		},
	};
}

// --------------------------------------------------------------------------
// Shared
// --------------------------------------------------------------------------

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk: string) => {
			data += chunk;
		});
		process.stdin.once("error", reject);
		process.stdin.once("end", () => resolve(data));
	});
}
