import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DISPATCH_MARKER } from "../src/dispatch-contract.js";
import { getTaskStatePath } from "../src/task-state.js";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("spawned hook CLI", () => {
	it("routes PreToolUse, PostToolUse, and Stop through the built executable", () => {
		const cwd = mkdtempSync(join(tmpdir(), "lazyz-executor-cli-"));
		roots.push(cwd);
		mkdirSync(join(cwd, ".omo", "evidence"), { recursive: true });
		writeFileSync(join(cwd, "transcript.jsonl"), "");
		const contract = {
			schemaVersion: 1,
			workId: "work-cli",
			taskId: "task-cli",
			runId: "run-cli",
			role: "implementer",
			phase: "execute",
			criterionRefs: ["C001"],
			budget: { maxCalls: 2, maxSameFailure: 2 },
		};
		const prompt = `${DISPATCH_MARKER}${JSON.stringify(contract)}`;
		const common = {
			session_id: "session-cli",
			turn_id: "turn-cli",
			cwd,
			transcript_path: join(cwd, "transcript.jsonl"),
			model: "model",
			permission_mode: "default",
			tool_name: "Agent",
			tool_use_id: "tool-cli",
			tool_input: { subagent_type: "general-purpose", prompt },
		};
		expect(runCli("pre-tool-use", { ...common, hook_event_name: "PreToolUse" })).toBe("");
		expect(
			JSON.parse(runCli("pre-tool-use", { ...common, hook_event_name: "PreToolUse", tool_use_id: "tool-reused" }))
				.hookSpecificOutput.permissionDecisionReason,
		).toBe("run-id-reused");
		expect(
			JSON.parse(runCli("post-tool-use", { ...common, hook_event_name: "PostToolUse", tool_response: "missing" }))
				.hookSpecificOutput.hookEventName,
		).toBe("PostToolUse");
		const failureCommon = {
			...common,
			tool_use_id: "tool-failure",
			tool_input: {
				subagent_type: "general-purpose",
				prompt: `${DISPATCH_MARKER}${JSON.stringify({ ...contract, taskId: "task-cli-failure", runId: "run-cli-failure" })}`,
			},
		};
		expect(runCli("pre-tool-use", { ...failureCommon, hook_event_name: "PreToolUse" })).toBe("");
		expect(
			JSON.parse(
				runCli("post-tool-use-failure", {
					...failureCommon,
					hook_event_name: "PostToolUseFailure",
					error: "Authorization: Bearer secret-value",
				}),
			).hookSpecificOutput.hookEventName,
		).toBe("PostToolUseFailure");
		expect(readFileSync(getTaskStatePath(cwd, "session-cli", "task-cli-failure"), "utf8")).not.toContain(
			"secret-value",
		);
		expect(JSON.parse(runCli("stop", { ...common, hook_event_name: "Stop", stop_hook_active: false })).decision).toBe(
			"block",
		);
	});

	it("never over-reserves a task when spawned hook processes race", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lazyz-executor-cli-race-"));
		roots.push(cwd);
		const calls = Array.from({ length: 10 }, (_, index) => {
			const prompt = `${DISPATCH_MARKER}${JSON.stringify({
				schemaVersion: 1,
				workId: "work-race",
				taskId: "task-race",
				runId: `run-${index}`,
				role: "implementer",
				phase: "execute",
				criterionRefs: ["G001-first/C001"],
				budget: { maxCalls: 5, maxSameFailure: 3 },
			})}`;
			return runCliAsync("pre-tool-use", {
				hook_event_name: "PreToolUse",
				session_id: "session-race",
				cwd,
				tool_name: "Agent",
				tool_use_id: `tool-${index}`,
				tool_input: { subagent_type: "general-purpose", prompt },
			});
		});
		await Promise.all(calls);
		const state = JSON.parse(readFileSync(getTaskStatePath(cwd, "session-race", "task-race"), "utf8"));
		expect(state.runs.length).toBeGreaterThan(0);
		expect(state.runs.length).toBeLessThanOrEqual(5);
	});
});

function runCli(subcommand: string, payload: unknown): string {
	return execFileSync(process.execPath, [join(process.cwd(), "dist", "cli.js"), "hook", subcommand], {
		input: JSON.stringify(payload),
		encoding: "utf8",
	});
}

async function runCliAsync(subcommand: string, payload: unknown): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [join(process.cwd(), "dist", "cli.js"), "hook", subcommand], {
			stdio: ["pipe", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`hook exited ${String(code)}: ${stderr}`));
		});
		child.stdin.end(JSON.stringify(payload));
	});
}
