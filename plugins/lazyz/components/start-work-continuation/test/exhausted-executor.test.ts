import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runStopHook } from "../src/codex-hook.js";
import type { ReadWriteFileSystem } from "../src/types.js";

const roots: string[] = [];
const fs: ReadWriteFileSystem = { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync };

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("start-work continuation after executor exhaustion", () => {
	it("continues a ZCode Stop payload without optional Codex metadata", () => {
		const cwd = fixture("other-session", "work-1");
		const output = runStopHook({
			hook_event_name: "Stop", session_id: "session-1", cwd,
			permission_mode: "default", stop_hook_active: false,
		}, fs);
		expect(JSON.parse(output).decision).toBe("block");
	});

	it("does not continue only when exhausted state matches the current session and work", () => {
		const cwd = fixture("session-1", "work-1");
		expect(runStopHook(input(cwd, "session-1"), fs)).toBe("");
	});

	it.each([
		["other-session", "work-1"],
		["session-1", "other-work"],
	])("preserves continuation for nonmatching executor state", (stateSession, stateWork) => {
		const cwd = fixture(stateSession, stateWork);
		expect(JSON.parse(runStopHook(input(cwd, "session-1"), fs)).decision).toBe("block");
	});
});

function fixture(stateSession: string, stateWork: string): string {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-start-work-exhausted-"));
	roots.push(cwd);
	mkdirSync(join(cwd, ".omo", "plans"), { recursive: true });
	writeFileSync(join(cwd, ".omo", "plans", "plan.md"), "## TODOs\n- [ ] Execute task\n");
	writeFileSync(
		join(cwd, ".omo", "boulder.json"),
		JSON.stringify({
			works: {
				"work-1": {
					work_id: "work-1",
					active_plan: ".omo/plans/plan.md",
					plan_name: "plan",
					status: "active",
					session_ids: ["codex:session-1"],
				},
			},
		}),
	);
	const stateDir = join(cwd, ".omo", "lazycodex-executor-verify", "tasks", digest(stateSession));
	mkdirSync(stateDir, { recursive: true });
	writeFileSync(
		join(stateDir, `${digest("task-1")}.json`),
		JSON.stringify({
			schemaVersion: 1,
			contract: {
				schemaVersion: 1,
				workId: stateWork,
				taskId: "task-1",
				runId: "run-1",
				role: "implementer",
				phase: "execute",
				criterionRefs: ["C001"],
				budget: { maxCalls: 1, maxSameFailure: 1 },
			},
			runs: [{ runId: "run-1", status: "failed", failureSignature: "receipt-marker-missing" }],
			exhausted: true,
		}),
	);
	return cwd;
}

function input(cwd: string, sessionId: string) {
	return {
		hook_event_name: "Stop",
		session_id: sessionId,
		turn_id: "turn-1",
		transcript_path: join(cwd, "transcript.jsonl"),
		cwd,
		model: "model",
		permission_mode: "default",
		stop_hook_active: false,
	};
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
