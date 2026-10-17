import { aggregateCodexObjectiveForScope } from "./goal-status.js";
import { isCrossProcessMutationLockHeld, withCrossProcessMutationLock } from "./mutation-lock.js";
import { repoRelative, type UlwLoopScope, ulwLoopBriefPath, ulwLoopGoalsPath, ulwLoopLedgerPath } from "./paths.js";
import {
	appendSafeTextFile,
	assertSafeUlwLoopPath,
	assertUlwLoopStatePaths,
	ensureUlwLoopStateDir,
	readSafeTextFile,
	safeFileExists,
	writeSafeTextFile,
} from "./state-path.js";
import type { UlwLoopLedgerEntry, UlwLoopPlan } from "./types.js";
import { iso, ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError } from "./types.js";

const LEGACY_OBJECTIVE_PREFIX = `Complete all ulw-loop stories in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}: `;
const LEGACY_OBJECTIVE = `Complete all ulw-loop stories listed in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}. Use ${ULW_LOOP_DIR}/${ULW_LOOP_LEDGER} as the durable audit trail.`;
function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function isLegacyEnumeratedAggregateObjective(objective: string | undefined): objective is string {
	return objective === LEGACY_OBJECTIVE || Boolean(objective?.startsWith(LEGACY_OBJECTIVE_PREFIX));
}

function isSteeringKind(value: unknown): value is UlwLoopLedgerEntry["kind"] {
	return value === "steering_accepted" || value === "steering_rejected" || value === "criteria_revised";
}

export async function withUlwLoopMutationLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T>;
export async function withUlwLoopMutationLock<T>(
	repoRoot: string,
	scope: UlwLoopScope | undefined,
	fn: () => Promise<T>,
): Promise<T>;
export async function withUlwLoopMutationLock<T>(
	repoRoot: string,
	scopeOrFn: UlwLoopScope | (() => Promise<T>) | undefined,
	maybeFn?: () => Promise<T>,
): Promise<T> {
	const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
	const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
	if (fn === undefined) throw new UlwLoopError("Missing ulw-loop mutation body.", "ULW_LOOP_LOCK_BODY_MISSING");
	return withCrossProcessMutationLock(repoRoot, scope, async () => {
		await assertUlwLoopStatePaths(repoRoot, scope);
		return fn();
	});
}

export async function readUlwLoopPlan(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopPlan> {
	const path = ulwLoopGoalsPath(repoRoot, scope);
	let raw: string;
	try {
		await assertSafeUlwLoopPath(repoRoot, path);
		raw = await readSafeTextFile(path);
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
		throw new UlwLoopError(
			`No ulw-loop plan found at ${repoRelative(path, repoRoot)}. Run \`lazyz ulw-loop create-goals ...\` first.`,
			"ULW_LOOP_PLAN_MISSING",
			{ cause: error },
		);
	}
	const parsed: UlwLoopPlan = JSON.parse(raw);
	if (parsed.version !== 1 || !Array.isArray(parsed.goals)) {
		throw new UlwLoopError(`Invalid ulw-loop plan at ${repoRelative(path, repoRoot)}.`, "ULW_LOOP_PLAN_INVALID");
	}
	const previousObjective = parsed.codexObjective;
	if (
		(parsed.codexGoalMode ?? "per_story") === "aggregate" &&
		isLegacyEnumeratedAggregateObjective(previousObjective)
	) {
		if (!isCrossProcessMutationLockHeld(repoRoot, scope)) {
			return withUlwLoopMutationLock(repoRoot, scope, () => readUlwLoopPlan(repoRoot, scope));
		}
		const now = iso();
		parsed.codexObjective = aggregateCodexObjectiveForScope(scope);
		parsed.codexObjectiveAliases = [...new Set([...(parsed.codexObjectiveAliases ?? []), previousObjective])];
		parsed.updatedAt = now;
		await writePlan(repoRoot, parsed, scope);
		await appendLedger(
			repoRoot,
			{
				at: now,
				kind: "aggregate_objective_migrated",
				message: "Migrated legacy enumerated aggregate Codex objective to the stable pointer objective.",
				before: { codexObjective: previousObjective },
				after: { codexObjective: parsed.codexObjective },
			},
			scope,
		);
	}
	return parsed;
}

export async function writePlan(repoRoot: string, plan: UlwLoopPlan, scope?: UlwLoopScope): Promise<void> {
	await ensureUlwLoopStateDir(repoRoot, scope);
	const path = ulwLoopGoalsPath(repoRoot, scope);
	await assertSafeUlwLoopPath(repoRoot, path);
	await writeSafeTextFile(path, `${JSON.stringify(plan, null, 2)}\n`);
}

export async function appendLedger(repoRoot: string, entry: UlwLoopLedgerEntry, scope?: UlwLoopScope): Promise<void> {
	await ensureUlwLoopStateDir(repoRoot, scope);
	const path = ulwLoopLedgerPath(repoRoot, scope);
	await assertSafeUlwLoopPath(repoRoot, path);
	await appendSafeTextFile(path, `${JSON.stringify(entry)}\n`);
}

export async function readSteeringLedgerEntries(repoRoot: string, scope?: UlwLoopScope): Promise<UlwLoopLedgerEntry[]> {
	let raw: string;
	try {
		const path = ulwLoopLedgerPath(repoRoot, scope);
		await assertSafeUlwLoopPath(repoRoot, path);
		raw = await readSafeTextFile(path);
	} catch (error) {
		if (hasCode(error, "ENOENT")) return [];
		throw error;
	}
	const entries: UlwLoopLedgerEntry[] = [];
	for (const line of raw.split(/\r?\n/).filter(Boolean)) {
		const entry: UlwLoopLedgerEntry = JSON.parse(line);
		if (isSteeringKind(entry.kind)) entries.push(entry);
	}
	return entries;
}

export async function ulwLoopPlanExists(repoRoot: string, scope?: UlwLoopScope): Promise<boolean> {
	return safeFileExists(repoRoot, ulwLoopGoalsPath(repoRoot, scope));
}

export async function writeUlwLoopBrief(repoRoot: string, brief: string, scope?: UlwLoopScope): Promise<void> {
	await ensureUlwLoopStateDir(repoRoot, scope);
	const path = ulwLoopBriefPath(repoRoot, scope);
	await assertSafeUlwLoopPath(repoRoot, path);
	await writeSafeTextFile(path, brief.endsWith("\n") ? brief : `${brief}\n`);
}

export async function readUlwLoopBrief(repoRoot: string, scope?: UlwLoopScope): Promise<string | null> {
	const path = ulwLoopBriefPath(repoRoot, scope);
	await assertSafeUlwLoopPath(repoRoot, path);
	try {
		return await readSafeTextFile(path);
	} catch (error) {
		if (hasCode(error, "ENOENT")) return null;
		throw error;
	}
}

export async function resetUlwLoopLedger(repoRoot: string, scope?: UlwLoopScope): Promise<void> {
	await ensureUlwLoopStateDir(repoRoot, scope);
	const path = ulwLoopLedgerPath(repoRoot, scope);
	await assertSafeUlwLoopPath(repoRoot, path);
	await writeSafeTextFile(path, "");
}
