import { readdirSync as nodeReaddirSync, realpathSync as nodeRealpathSync } from "node:fs";
import { join } from "node:path";

import type { DispatchContract } from "./dispatch-contract.js";
import { parseDispatchPrompt, sameFrozenContract } from "./dispatch-contract.js";
import {
	digestStateKey,
	ensureSafeStateDirectory,
	getTaskStatePath,
	isInside,
	isSafeExistingStateDirectory,
	sessionStateDir,
} from "./task-state-path.js";
import type { HookFileSystem } from "./types.js";

export { getTaskStatePath } from "./task-state-path.js";

const MAX_STATE_BYTES = 1024 * 1024;
type RunStatus = "reserved" | "passed" | "failed";
type RunState = {
	readonly runId: string;
	readonly toolUseId: string;
	readonly status: RunStatus;
	readonly failureSignature?: string;
};
export type TaskState = {
	readonly schemaVersion: 1;
	readonly contract: DispatchContract;
	readonly runs: readonly RunState[];
	readonly exhausted: boolean;
};
type TaskRead =
	| { readonly kind: "missing" }
	| { readonly kind: "invalid" }
	| { readonly kind: "valid"; readonly state: TaskState };
export type StateResult =
	| { readonly ok: true; readonly state: TaskState }
	| { readonly ok: false; readonly reason: string };
export type SessionTaskInspection = { readonly tasks: readonly TaskState[]; readonly invalid: boolean };

export function reserveRun(
	cwd: string,
	sessionId: string,
	contract: DispatchContract,
	toolUseId: string,
	fs: HookFileSystem,
): StateResult {
	return withTaskLock(cwd, sessionId, contract.taskId, fs, () => {
		const read = readTaskState(cwd, sessionId, contract.taskId, fs);
		if (read.kind === "invalid") return { ok: false, reason: "task-state-invalid" };
		const existing = read.kind === "valid" ? read.state : null;
		if (existing !== null && !sameFrozenContract(existing.contract, contract))
			return { ok: false, reason: "task-contract-changed" };
		const state = existing ?? { schemaVersion: 1, contract, runs: [], exhausted: false };
		if (state.exhausted) return { ok: false, reason: "task-budget-exhausted" };
		if (state.runs.some((run) => run.status === "passed")) return { ok: false, reason: "task-already-passed" };
		const prior = state.runs.find((run) => run.runId === contract.runId);
		if (prior?.status === "reserved")
			return prior.toolUseId === toolUseId ? { ok: true, state } : { ok: false, reason: "run-id-reused" };
		if (prior !== undefined) return { ok: false, reason: "run-already-finished" };
		if (state.runs.some((run) => run.status === "reserved")) return { ok: false, reason: "task-run-in-flight" };
		if (state.runs.length >= contract.budget.maxCalls) {
			const exhausted = { ...state, exhausted: true };
			return writeOrFail(cwd, sessionId, exhausted, fs, "task-call-budget-exhausted");
		}
		const reserved = {
			...state,
			runs: [...state.runs, { runId: contract.runId, toolUseId, status: "reserved" }],
		} satisfies TaskState;
		return writeOrFail(cwd, sessionId, reserved, fs);
	});
}

export function recordRunResult(
	cwd: string,
	sessionId: string,
	contract: DispatchContract,
	toolUseId: string,
	result: { readonly kind: "passed" } | { readonly kind: "failed"; readonly signature: string },
	fs: HookFileSystem,
): StateResult {
	return withTaskLock(cwd, sessionId, contract.taskId, fs, () => {
		const read = readTaskState(cwd, sessionId, contract.taskId, fs);
		if (read.kind !== "valid" || !sameFrozenContract(read.state.contract, contract))
			return { ok: false, reason: "run-not-reserved" };
		const state = read.state;
		const run = state.runs.find((candidate) => candidate.runId === contract.runId);
		if (run === undefined) return { ok: false, reason: "run-not-reserved" };
		if (run.toolUseId !== toolUseId) return { ok: false, reason: "run-call-mismatch" };
		if (run.status !== "reserved") return { ok: true, state };
		const replacement: RunState =
			result.kind === "passed"
				? { runId: run.runId, toolUseId: run.toolUseId, status: "passed" }
				: { runId: run.runId, toolUseId: run.toolUseId, status: "failed", failureSignature: result.signature };
		const runs = state.runs.map((candidate) => (candidate.runId === run.runId ? replacement : candidate));
		const sameFailures =
			result.kind === "failed"
				? runs.filter((candidate) => candidate.failureSignature === result.signature).length
				: 0;
		const exhausted =
			state.exhausted ||
			(result.kind === "failed" &&
				(sameFailures >= contract.budget.maxSameFailure || runs.length >= contract.budget.maxCalls));
		return writeOrFail(cwd, sessionId, { ...state, runs, exhausted }, fs);
	});
}

export function inspectSessionTasks(cwd: string, sessionId: string, fs: HookFileSystem): SessionTaskInspection {
	const directory = sessionStateDir(cwd, sessionId);
	if (!fs.existsSync(directory)) return { tasks: [], invalid: false };
	if (!isSafeExistingStateDirectory(cwd, directory, fs)) return { tasks: [], invalid: true };
	try {
		const entries = fs.readdirSync?.(directory) ?? nodeReaddirSync(directory);
		let invalid = false;
		const tasks = entries
			.filter((entry) => entry.endsWith(".json"))
			.flatMap((entry) => {
				const read = readStateFile(join(directory, entry), cwd, fs);
				if (read.kind !== "valid") {
					invalid = true;
					return [];
				}
				return [read.state];
			});
		return { tasks, invalid };
	} catch (error) {
		if (error instanceof Error) return { tasks: [], invalid: true };
		throw error;
	}
}

function readTaskState(cwd: string, sessionId: string, taskId: string, fs: HookFileSystem): TaskRead {
	const path = getTaskStatePath(cwd, sessionId, taskId);
	return fs.existsSync(path) ? readStateFile(path, cwd, fs) : { kind: "missing" };
}

function readStateFile(path: string, cwd: string, fs: HookFileSystem): TaskRead {
	try {
		const link = fs.lstatSync?.(path);
		const stat = fs.statSync(path);
		if (
			link?.isSymbolicLink?.() === true ||
			stat.size <= 0 ||
			stat.size > MAX_STATE_BYTES ||
			(stat.isFile?.() ?? true) === false
		)
			return { kind: "invalid" };
		const realPath = fs.realpathSync?.(path) ?? nodeRealpathSync(path);
		if (!isInside(realPath, fs.realpathSync?.(cwd) ?? nodeRealpathSync(cwd))) return { kind: "invalid" };
		const state = parseTaskState(fs.readFileSync(path, "utf8"));
		return state === null ? { kind: "invalid" } : { kind: "valid", state };
	} catch (error) {
		if (error instanceof Error) return { kind: "invalid" };
		throw error;
	}
}

function parseTaskState(raw: string): TaskState | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (
			!isRecord(value) ||
			value["schemaVersion"] !== 1 ||
			!isRecord(value["contract"]) ||
			!Array.isArray(value["runs"]) ||
			typeof value["exhausted"] !== "boolean"
		)
			return null;
		const parsed = parseDispatchPrompt(`LAZYCODEX_DISPATCH_V1: ${JSON.stringify(value["contract"])}`);
		if (parsed.kind !== "structured" || !value["runs"].every(isRunState)) return null;
		return { schemaVersion: 1, contract: parsed.contract, runs: value["runs"], exhausted: value["exhausted"] };
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

function writeOrFail(
	cwd: string,
	sessionId: string,
	state: TaskState,
	fs: HookFileSystem,
	reason?: string,
): StateResult {
	return writeTaskState(cwd, sessionId, state.contract.taskId, state, fs)
		? reason === undefined
			? { ok: true, state }
			: { ok: false, reason }
		: { ok: false, reason: "task-state-write-rejected" };
}

function writeTaskState(cwd: string, sessionId: string, taskId: string, state: TaskState, fs: HookFileSystem): boolean {
	const directory = sessionStateDir(cwd, sessionId);
	if (!ensureSafeStateDirectory(cwd, directory, fs)) return false;
	const path = getTaskStatePath(cwd, sessionId, taskId);
	if (fs.existsSync(path) && readStateFile(path, cwd, fs).kind === "invalid") return false;
	const temporary = `${path}.${process.pid}.${Date.now()}.${digestStateKey(state.contract.runId).slice(0, 12)}.tmp`;
	try {
		fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`, { flag: "wx", mode: 0o600 });
		fs.renameSync(temporary, path);
		return true;
	} catch (error) {
		fs.rmSync(temporary, { force: true });
		if (error instanceof Error) return false;
		throw error;
	}
}

function withTaskLock(
	cwd: string,
	sessionId: string,
	taskId: string,
	fs: HookFileSystem,
	action: () => StateResult,
): StateResult {
	const directory = sessionStateDir(cwd, sessionId);
	if (!ensureSafeStateDirectory(cwd, directory, fs)) return { ok: false, reason: "task-state-path-rejected" };
	const lock = join(directory, `${digestStateKey(taskId)}.lock`);
	try {
		fs.mkdirSync(lock, { recursive: false, mode: 0o700 });
		if (!isSafeExistingStateDirectory(cwd, lock, fs)) {
			fs.rmSync(lock, { force: true, recursive: true });
			return { ok: false, reason: "task-state-lock-rejected" };
		}
	} catch (error) {
		if (error instanceof Error) return { ok: false, reason: "task-state-busy" };
		throw error;
	}
	try {
		return action();
	} finally {
		fs.rmSync(lock, { force: true, recursive: true });
	}
}

function isRunState(value: unknown): value is RunState {
	return (
		isRecord(value) &&
		typeof value["runId"] === "string" &&
		typeof value["toolUseId"] === "string" &&
		(value["status"] === "reserved" || value["status"] === "passed" || value["status"] === "failed") &&
		(value["failureSignature"] === undefined || typeof value["failureSignature"] === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
