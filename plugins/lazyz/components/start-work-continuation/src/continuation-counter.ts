import { join } from "node:path";

import type { ReadWriteFileSystem } from "./types.js";

/**
 * Default cap on consecutive start-work continuations per session. ZCode has no
 * SubagentStop event, so the Stop-hook continuation loop is the main driver and
 * could spin without bound if the plan checklist never clears. Set to 0 or a
 * negative value via the env override below to disable the cap entirely.
 */
export const DEFAULT_MAX_CONTINUATIONS = 10;

const MAX_CONTINUATIONS_ENV = "LAZYZ_START_WORK_MAX_CONTINUATIONS";

export type ContinuationCountState = {
	readonly continuations: number;
	readonly updatedAt: string;
};

/**
 * Resolve the effective continuation cap. Reads LAZYZ_START_WORK_MAX_CONTINUATIONS
 * from env; a non-positive value disables the cap (returns Infinity).
 */
export function resolveMaxContinuations(env: NodeJS.ProcessEnv = process.env): number {
	const raw = env[MAX_CONTINUATIONS_ENV];
	if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_CONTINUATIONS;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) return DEFAULT_MAX_CONTINUATIONS;
	return parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function readContinuationCount(cwd: string, sessionId: string, fs: ReadWriteFileSystem): ContinuationCountState {
	const statePath = getStatePath(cwd, sessionId);
	if (!fs.existsSync(statePath)) return { continuations: 0, updatedAt: "" };
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(statePath, "utf8"));
		if (isContinuationCountState(parsed)) return parsed;
		return { continuations: 0, updatedAt: "" };
	} catch (error) {
		if (error instanceof SyntaxError || error instanceof Error) return { continuations: 0, updatedAt: "" };
		throw error;
	}
}

export function incrementContinuationCount(cwd: string, sessionId: string, fs: ReadWriteFileSystem): void {
	const current = readContinuationCount(cwd, sessionId, fs);
	writeContinuationCount(cwd, sessionId, { continuations: current.continuations + 1, updatedAt: new Date().toISOString() }, fs);
}

export function clearContinuationCount(cwd: string, sessionId: string, fs: ReadWriteFileSystem): void {
	fs.rmSync(getStatePath(cwd, sessionId), { force: true });
}

function writeContinuationCount(
	cwd: string,
	sessionId: string,
	state: ContinuationCountState,
	fs: ReadWriteFileSystem,
): void {
	const stateDir = getStateDir(cwd);
	const statePath = getStatePath(cwd, sessionId);
	const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
	fs.mkdirSync(stateDir, { recursive: true });
	fs.writeFileSync(tempPath, `${JSON.stringify(state)}\n`);
	fs.renameSync(tempPath, statePath);
}

function getStatePath(cwd: string, sessionId: string): string {
	return join(getStateDir(cwd), `${sanitizeKey(sessionId)}.json`);
}

function getStateDir(cwd: string): string {
	return join(cwd, ".omo", "start-work-continuation");
}

function sanitizeKey(value: string): string {
	const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	return sanitized.length > 0 ? sanitized : "missing";
}

function isContinuationCountState(value: unknown): value is ContinuationCountState {
	return (
		isRecord(value) &&
		typeof value["continuations"] === "number" &&
		Number.isInteger(value["continuations"]) &&
		(typeof value["updatedAt"] === "string" || value["updatedAt"] === undefined)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
