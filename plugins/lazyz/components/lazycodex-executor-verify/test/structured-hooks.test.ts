import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPostToolUseFailureHook, runPostToolUseHook, runPreToolUseHook, runStopHook } from "../src/codex-hook.js";
import { DISPATCH_MARKER } from "../src/dispatch-contract.js";
import { inspectSessionTasks } from "../src/task-state.js";
import type { HookFileSystem } from "../src/types.js";

const roots: string[] = [];
const fs: HookFileSystem = {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
};
const source = { commitSha: "a".repeat(40), treeOid: "b".repeat(40) };

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("structured executor hooks", () => {
	it("denies an unstructured general-purpose dispatch but permits read-only Explore", () => {
		const cwd = workspace();
		expect(decision(runPreToolUseHook(preInput(cwd, "general-purpose", "TASK: edit files"), fs))).toBe("deny");
		expect(runPreToolUseHook(preInput(cwd, "Explore", "TASK: read files"), fs)).toBe("");
	});

	it("applies the governed-dispatch policy to namespaced LazyZ executors while retaining namespaced Explore", () => {
		const cwd = workspace();
		const executors = ["lazycodex-executor", "lazyz:lazycodex-executor"] as const;
		const executorDecisions = executors.map((subagentType) =>
			decision(runPreToolUseHook(preInput(cwd, subagentType, "TASK: edit files"), fs)),
		);
		const explorer = runPreToolUseHook(
			preInput(cwd, "lazyz:explorer", "TASK: read files", "explore-call", true),
			fs,
		);

		expect(executorDecisions).toEqual(["deny", "deny"]);
		expect(explorer).toBe("");
	});

	it.each(["lazyz:lazycodex-executor", "Explore"])("denies structured background work for %s before reserving it", (agent) => {
		const cwd = workspace();
		const input = preInput(cwd, agent, prompt({ runId: "background-run" }), "background-call", true);
		const output = runPreToolUseHook(input, fs);
		expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe("deny");
		expect(JSON.parse(output).hookSpecificOutput.permissionDecisionReason).toBe(
			"structured-executor-background-unsupported",
		);
		expect(inspectSessionTasks(cwd, "session-1", fs).tasks).toEqual([]);
	});

	it("reserves each run once and freezes the task contract", () => {
		const cwd = workspace();
		const first = preInput(cwd, "general-purpose", prompt({ runId: "run-1" }));
		expect(runPreToolUseHook(first, fs)).toBe("");
		expect(runPreToolUseHook(first, fs)).toBe("");
		expect(
			decision(runPreToolUseHook(preInput(cwd, "general-purpose", prompt({ runId: "run-2", role: "qa" })), fs)),
		).toBe("deny");
	});

	it("rejects one run id reused by a different host tool call", () => {
		const cwd = workspace();
		const first = preInput(cwd, "general-purpose", prompt({ runId: "run-reused" }), "tool-1");
		const reused = preInput(cwd, "general-purpose", prompt({ runId: "run-reused" }), "tool-2");
		expect(runPreToolUseHook(first, fs)).toBe("");
		expect(JSON.parse(runPreToolUseHook(reused, fs)).hookSpecificOutput.permissionDecisionReason).toBe(
			"run-id-reused",
		);
	});

	it("enforces total and same-failure budgets with stable task identity", () => {
		const cwd = workspace();
		for (const runId of ["run-1", "run-2"] as const) {
			const input = preInput(cwd, "general-purpose", prompt({ runId, budget: { maxCalls: 2, maxSameFailure: 2 } }));
			expect(runPreToolUseHook(input, fs)).toBe("");
			expect(
				decision(runPostToolUseHook(postInput(input, "no receipt"), fs, { readGitProvenance: () => source })),
			).toBe("context");
		}
		const exhausted = preInput(
			cwd,
			"general-purpose",
			prompt({ runId: "run-3", budget: { maxCalls: 2, maxSameFailure: 2 } }),
		);
		expect(decision(runPreToolUseHook(exhausted, fs))).toBe("deny");
		expect(runStopHook(stopInput(cwd), fs)).toBe("");
	});

	it("blocks Stop while a reserved task still has retry budget", () => {
		const cwd = workspace();
		expect(runPreToolUseHook(preInput(cwd, "general-purpose", prompt({ runId: "run-1" })), fs)).toBe("");
		expect(JSON.parse(runStopHook(stopInput(cwd), fs)).decision).toBe("block");
	});

	it("accepts only a bound structured final receipt with current hashed artifacts", () => {
		const cwd = workspace();
		const input = preInput(cwd, "general-purpose", prompt({ runId: "run-final", phase: "final" }));
		expect(runPreToolUseHook(input, fs)).toBe("");
		const artifactPath = join(cwd, ".omo", "evidence", "result.txt");
		writeFileSync(artifactPath, "verified\n");
		const receiptPath = join(cwd, ".omo", "evidence", "receipt.json");
		writeFileSync(
			receiptPath,
			JSON.stringify({
				schemaVersion: 1,
				taskId: "task-7",
				runId: "run-final",
				role: "implementer",
				phase: "final",
				source,
				criteria: [
					{
						criterionRef: "G001",
						outcome: "passed",
						invocation: "npm test",
						exitCode: 0,
						artifactIds: ["result"],
					},
				],
				artifacts: [{ id: "result", path: ".omo/evidence/result.txt", sha256: sha256("verified\n") }],
			}),
		);
		const ordinary = postInput(input, "EVIDENCE_RECORDED: .omo/evidence/receipt.json");
		expect(decision(runPostToolUseHook(ordinary, fs, { readGitProvenance: () => source }))).toBe("context");
		const retry = preInput(cwd, "general-purpose", prompt({ runId: "run-final-2", phase: "final" }));
		expect(runPreToolUseHook(retry, fs)).toBe("");
		const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
		receipt.runId = "run-final-2";
		writeFileSync(receiptPath, JSON.stringify(receipt));
		const final = postInput(retry, {
			response: { text: "FINAL_EVIDENCE_RECORDED: .omo/evidence/receipt.json" },
		});
		expect(runPostToolUseHook(final, fs, { readGitProvenance: () => source })).toBe("");
		expect(runStopHook(stopInput(cwd), fs)).toBe("");
	});

	it("keeps a previously reserved task unresolved when a background launch reaches PostToolUse", () => {
		const cwd = workspace();
		const input = preInput(cwd, "lazyz:lazycodex-executor", prompt({ runId: "legacy-background" }), "legacy-call");
		expect(runPreToolUseHook(input, fs)).toBe("");

		const output = runPostToolUseHook(
			postInput(input, {
				status: "async_launched",
				isAsync: true,
				agentId: "agent-1",
				agentType: "lazyz:lazycodex-executor",
				description: "structured task",
				prompt: input.tool_input.prompt,
				childSessionId: "child-1",
				backgroundTaskId: "task-1",
				outputFile: "/tmp/agent-output",
				canReadOutputFile: false,
			}),
			fs,
			{ readGitProvenance: () => source },
		);

		expect(decision(output)).toBe("context");
		expect(inspectSessionTasks(cwd, "session-1", fs).tasks[0]?.runs[0]?.status).toBe("reserved");
		expect(JSON.parse(runStopHook(stopInput(cwd), fs)).decision).toBe("block");
	});

	it("rejects an oversized receipt before parsing its contents", () => {
		const cwd = workspace();
		const input = preInput(cwd, "general-purpose", prompt({ runId: "run-large" }));
		expect(runPreToolUseHook(input, fs)).toBe("");
		writeFileSync(join(cwd, ".omo", "evidence", "large.json"), "x".repeat(1024 * 1024 + 1));
		const output = runPostToolUseHook(postInput(input, "EVIDENCE_RECORDED: .omo/evidence/large.json"), fs, {
			readGitProvenance: () => source,
		});
		expect(JSON.parse(output).hookSpecificOutput.additionalContext).toContain("receipt-path-invalid");
	});

	it("exhausts after three typed tool execution failures without persisting raw errors", () => {
		const cwd = workspace();
		for (const runId of ["run-fail-1", "run-fail-2", "run-fail-3"] as const) {
			const input = preInput(cwd, "general-purpose", prompt({ runId }), `tool-${runId}`);
			expect(runPreToolUseHook(input, fs)).toBe("");
			const output = runPostToolUseFailureHook(
				{ ...input, hook_event_name: "PostToolUseFailure", error: "Authorization: Bearer secret-value" },
				fs,
			);
			expect(JSON.parse(output).hookSpecificOutput.hookEventName).toBe("PostToolUseFailure");
		}
		expect(runStopHook(stopInput(cwd), fs)).toBe("");
		const stateRoot = join(cwd, ".omo", "lazycodex-executor-verify");
		expect(readAllState(stateRoot)).not.toContain("secret-value");
	});
});

function workspace(): string {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-structured-hook-"));
	roots.push(cwd);
	mkdirSync(join(cwd, ".omo", "evidence"), { recursive: true });
	writeFileSync(join(cwd, "transcript.jsonl"), "");
	return cwd;
}

function prompt(overrides: Record<string, unknown>): string {
	return `${DISPATCH_MARKER}${JSON.stringify({
		schemaVersion: 1,
		workId: "work-42",
		taskId: "task-7",
		runId: "run-1",
		role: "implementer",
		phase: "execute",
		criterionRefs: ["G001"],
		budget: { maxCalls: 5, maxSameFailure: 3 },
		...overrides,
	})}`;
}

function preInput(
	cwd: string,
	subagentType: string,
	promptText: string,
	toolUseId = "call-id",
	runInBackground = false,
) {
	return {
		hook_event_name: "PreToolUse",
		session_id: "session-1",
		turn_id: "turn-1",
		cwd,
		transcript_path: join(cwd, "transcript.jsonl"),
		model: "model",
		permission_mode: "default",
		tool_name: "Agent",
		tool_use_id: toolUseId,
		tool_input: { subagent_type: subagentType, prompt: promptText, run_in_background: runInBackground },
	};
}

function postInput(input: ReturnType<typeof preInput>, response: unknown) {
	return { ...input, hook_event_name: "PostToolUse", tool_response: response };
}

function stopInput(cwd: string) {
	return {
		hook_event_name: "Stop",
		session_id: "session-1",
		turn_id: "turn-1",
		cwd,
		transcript_path: join(cwd, "transcript.jsonl"),
		model: "model",
		permission_mode: "default",
		stop_hook_active: false,
	};
}

function decision(output: string): string | undefined {
	const parsed = JSON.parse(output);
	return (
		parsed.hookSpecificOutput?.permissionDecision ??
		parsed.decision ??
		(parsed.hookSpecificOutput?.additionalContext ? "context" : undefined)
	);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function readAllState(root: string): string {
	return readdirSync(root, { withFileTypes: true })
		.map((entry) => {
			const path = join(root, entry.name);
			return entry.isDirectory() ? readAllState(path) : readFileSync(path, "utf8");
		})
		.join("\n");
}
