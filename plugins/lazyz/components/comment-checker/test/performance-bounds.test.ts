import { execPath } from "node:process";
import { describe, expect, it } from "vitest";

import {
	type CodexPostToolUseInput,
	type CommentCheckerHookMetrics,
	runCommentCheckerPostToolUse,
} from "../src/codex-hook.js";
import { spawnProcess } from "../src/runner.js";

function patchInput(fileCount: number): CodexPostToolUseInput {
	const command = Array.from(
		{ length: fileCount },
		(_, index) => `*** Update File: /tmp/file-${index}.ts\n@@\n-old\n+new\n`,
	).join("");
	return {
		session_id: "session",
		turn_id: "turn",
		transcript_path: null,
		cwd: "/tmp",
		hook_event_name: "PostToolUse",
		model: "model",
		permission_mode: "default",
		tool_name: "apply_patch",
		tool_input: { command },
		tool_response: "Done",
		tool_use_id: "tool",
	};
}

describe("comment checker performance bounds", () => {
	it("#given eight changed files #when checks run #then fanout is capped and counters are observable", async () => {
		let calls = 0;
		let active = 0;
		let maxActive = 0;
		let releaseFirstBatch: (() => void) | undefined;
		const firstBatchGate = new Promise<void>((resolve) => {
			releaseFirstBatch = resolve;
		});
		let metrics: CommentCheckerHookMetrics | undefined;
		const run = async () => {
			calls += 1;
			active += 1;
			maxActive = Math.max(maxActive, active);
			if (calls <= 4) await firstBatchGate;
			active -= 1;
			return { status: "pass" as const, message: "" };
		};

		const checking = runCommentCheckerPostToolUse(patchInput(8), {
			run,
			maxConcurrency: 4,
			onMetrics: (value) => {
				metrics = value;
			},
		});
		await waitFor(() => calls === 4);
		expect(maxActive).toBe(4);
		releaseFirstBatch?.();
		await checking;

		expect(calls).toBe(8);
		expect(metrics).toMatchObject({ requested: 8, scheduled: 8, completed: 8, maxConcurrency: 4, timedOut: false });
	});

	it("#given more requests than the hook budget #when checks run #then only the bounded unique prefix is scheduled", async () => {
		let calls = 0;
		let metrics: CommentCheckerHookMetrics | undefined;

		await runCommentCheckerPostToolUse(patchInput(10), {
			maxRequests: 3,
			run: async () => {
				calls += 1;
				return { status: "pass", message: "" };
			},
			onMetrics: (value) => {
				metrics = value;
			},
		});

		expect(calls).toBe(3);
		expect(metrics).toMatchObject({ requested: 10, scheduled: 3, completed: 3 });
	});

	it("#given repeated edits for one file #when checks run #then the file is checked once", async () => {
		const input = patchInput(1);
		input.tool_input["command"] = `${String(input.tool_input["command"])}${String(input.tool_input["command"])}`;
		let calls = 0;
		let metrics: CommentCheckerHookMetrics | undefined;

		await runCommentCheckerPostToolUse(input, {
			run: async () => {
				calls += 1;
				return { status: "pass", message: "" };
			},
			onMetrics: (value) => {
				metrics = value;
			},
		});

		expect(calls).toBe(1);
		expect(metrics).toMatchObject({ requested: 2, scheduled: 1, completed: 1 });
	});

	it("#given a checker that waits for cancellation #when the hook deadline expires #then the hook returns a timed-out result", async () => {
		let metrics: CommentCheckerHookMetrics | undefined;
		const startedAt = Date.now();

		await runCommentCheckerPostToolUse(patchInput(1), {
			hookTimeoutMs: 25,
			run: (_input, options) =>
				new Promise((resolve) => {
					options?.signal?.addEventListener("abort", () => resolve({ status: "error", message: "cancelled" }), {
						once: true,
					});
				}),
			onMetrics: (value) => {
				metrics = value;
			},
		});

		expect(Date.now() - startedAt).toBeLessThan(250);
		expect(metrics?.timedOut).toBe(true);
	});

	it("#given a child process exceeds its deadline #when spawned #then it is terminated with an observable timeout", async () => {
		const result = await spawnProcess(execPath, ["-e", "setInterval(() => {}, 1000)"], "", {
			timeoutMs: 25,
		});

		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBeNull();
	});
});

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error("condition was not reached");
}
