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
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { DispatchContract } from "../src/dispatch-contract.js";
import { getTaskStatePath, inspectSessionTasks, recordRunResult, reserveRun } from "../src/task-state.js";
import type { HookFileSystem } from "../src/types.js";

const roots: string[] = [];
const fs: HookFileSystem = {
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
const contract: DispatchContract = {
	schemaVersion: 1,
	workId: "work-1",
	taskId: "task-1",
	runId: "run-1",
	role: "implementer",
	phase: "execute",
	criterionRefs: ["G001-first/C001"],
	budget: { maxCalls: 5, maxSameFailure: 3 },
};

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("executor task state security boundary", () => {
	it("rejects a corrupt existing task state instead of resetting its budget", () => {
		const cwd = temporary("corrupt");
		const path = getTaskStatePath(cwd, "session-1", contract.taskId);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{}\n");
		expect(reserveRun(cwd, "session-1", contract, "tool-1", fs)).toEqual({ ok: false, reason: "task-state-invalid" });
		expect(inspectSessionTasks(cwd, "session-1", fs).invalid).toBe(true);
	});

	it("rejects a symlinked managed state ancestor without writing outside the workspace", () => {
		const cwd = temporary("workspace");
		const external = temporary("external");
		mkdirSync(join(cwd, ".omo"), { recursive: true });
		symlinkSync(external, join(cwd, ".omo", "lazycodex-executor-verify"));
		expect(reserveRun(cwd, "session-1", contract, "tool-1", fs)).toEqual({
			ok: false,
			reason: "task-state-path-rejected",
		});
		expect(readdirSync(external)).toEqual([]);
	});

	it("keeps exhaustion sticky when a late success is recorded", () => {
		const cwd = temporary("sticky");
		expect(reserveRun(cwd, "session-1", contract, "tool-1", fs).ok).toBe(true);
		const path = getTaskStatePath(cwd, "session-1", contract.taskId);
		const state = JSON.parse(readFileSync(path, "utf8"));
		state.exhausted = true;
		writeFileSync(path, JSON.stringify(state));
		expect(recordRunResult(cwd, "session-1", contract, "tool-1", { kind: "passed" }, fs).ok).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8")).exhausted).toBe(true);
	});

	it("rejects a result from a host call other than the one that reserved the run", () => {
		const cwd = temporary("host-call");
		expect(reserveRun(cwd, "session-1", contract, "tool-1", fs).ok).toBe(true);
		expect(recordRunResult(cwd, "session-1", contract, "tool-2", { kind: "passed" }, fs)).toEqual({
			ok: false,
			reason: "run-call-mismatch",
		});
	});
});

function temporary(label: string): string {
	const path = mkdtempSync(join(tmpdir(), `lazyz-state-${label}-`));
	roots.push(path);
	return path;
}
