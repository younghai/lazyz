import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * LazyZ work-status reader.
 *
 * Reads `.omo/boulder.json` (start-work state) and `.omo/ulw-loop/goals.json`
 * (ulw-loop state) and reports in-progress work.
 *
 * Design notes:
 *   - This file is SELF-CONTAINED. The other LazyZ component
 *     `start-work-continuation/src/boulder-reader.ts` parses the same
 *     `.omo/boulder.json`, but each component is an independent bundled npm
 *     package and cannot import across. Keep the parsers in sync if the
 *     boulder schema evolves.
 *   - The boulder.json schema is written by the `start-work` skill prose (an
 *     LLM following instructions), so it is a SOFT schema: fields drift.
 *     Every parser below is defensive — missing/invalid fields degrade to
 *     "no work found", never throw.
 *   - Progress for start-work is derived from the plan markdown's column-0
 *     checkboxes under `## Todos` / `## Final Verification Wave`, NOT from
 *     boulder.json (which only carries the active-plan pointer).
 *   - ulw-loop goals.json is written by the `omo ulw-loop` TS CLI with atomic
 *     writes + a mutation lock, so its schema is stable (version 1).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PlanChecklist = {
	readonly completed: number;
	readonly remaining: number;
	readonly total: number;
	readonly nextTaskLabel: string | null;
};

export type StartWorkSnapshot = {
	readonly kind: "start-work";
	readonly planName: string;
	readonly planPath: string;
	readonly boulderPath: string;
	readonly ledgerPath: string;
	readonly worktreePath: string | null;
	readonly status: BoulderWorkStatus | undefined;
	readonly checklist: PlanChecklist;
	/** True when the plan or boulder.json could not be parsed confidently. */
	readonly degraded: boolean;
};

export type UlwLoopCriterionStatus = "pending" | "pass" | "fail" | "blocked";

export type UlwLoopGoalSnapshot = {
	readonly id: string;
	readonly label: string;
	readonly status: string;
	readonly criteriaTotal: number;
	readonly criteriaPassed: number;
};

export type UlwLoopSnapshot = {
	readonly kind: "ulw-loop";
	readonly goalsPath: string;
	readonly ledgerPath: string;
	readonly goals: readonly UlwLoopGoalSnapshot[];
	readonly totalCriteria: number;
	readonly passedCriteria: number;
	readonly degraded: boolean;
};

export type WorkSnapshot = StartWorkSnapshot | UlwLoopSnapshot;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type BoulderWorkStatus = "active" | "paused" | "completed" | "abandoned" | "blocked";

type BoulderWork = {
	readonly activePlan: string;
	readonly planName: string;
	readonly status?: BoulderWorkStatus;
	readonly failCount?: number;
	readonly startedAt?: string;
	readonly updatedAt?: string;
	readonly sessionIds: readonly string[];
	readonly worktreePath?: string;
};

type BoulderState = {
	readonly works: readonly BoulderWork[];
	readonly hasWorksMap: boolean;
};

const TODO_HEADING_LOWER = "todos";
const FINAL_VERIFICATION_HEADING_LOWER = "final verification wave";
const CHECKBOX_PREFIX_LENGTH = "- [ ] ".length;

// ---------------------------------------------------------------------------
// start-work: read boulder.json + plan markdown
// ---------------------------------------------------------------------------

/**
 * Find the most recent active/paused start-work in `.omo/boulder.json`.
 * Returns null if there is no boulder, no continuuable work, or no remaining
 * plan checkboxes.
 */
export function readInProgressStartWork(cwd: string): StartWorkSnapshot | null {
	const boulderPath = join(cwd, ".omo", "boulder.json");
	const boulderState = readBoulderState(boulderPath);
	if (boulderState === null) return null;

	const work = pickMostRecentContinuable(boulderState.works);
	if (work === null) return null;

	const planPath = resolveBoulderPlanPathForWork(cwd, work);
	const checklist = getPlanChecklist(planPath);
	if (checklist.remaining === 0) return null;

	return {
		kind: "start-work",
		planName: work.planName,
		planPath,
		boulderPath,
		ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
		worktreePath: work.worktreePath ?? null,
		status: work.status,
		checklist,
		degraded: false,
	};
}

/**
 * Lenient variant: returns a degraded snapshot when boulder.json exists but
 * is unparseable, so the SessionStart hook can surface a "수동 확인 바랍니다"
 * message instead of silently swallowing a half-written state.
 */
export function readInProgressStartWorkLenient(cwd: string): StartWorkSnapshot | null {
	const strict = readInProgressStartWork(cwd);
	if (strict !== null) return strict;

	const boulderPath = join(cwd, ".omo", "boulder.json");
	if (!existsSync(boulderPath)) return null;
	// boulder.json exists but produced no continuuable work; surface only if
	// it is actually unparseable, not merely "all completed".
	const raw = safeReadText(boulderPath);
	if (raw === null) return null;
	const isJson = tryParseJson(raw) !== undefined;
	if (!isJson) {
		return {
			kind: "start-work",
			planName: "(unparseable boulder.json)",
			planPath: "",
			boulderPath,
			ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
			worktreePath: null,
			status: undefined,
			checklist: emptyChecklist(),
			degraded: true,
		};
	}
	return null;
}

// ---------------------------------------------------------------------------
// start-work: plan markdown checklist parser (mirrors start-work-continuation)
// ---------------------------------------------------------------------------

export function getPlanChecklist(planPath: string): PlanChecklist {
	if (!existsSync(planPath)) return emptyChecklist();
	const markdown = safeReadText(planPath);
	if (markdown === null) return emptyChecklist();
	return parsePlanChecklist(markdown);
}

function parsePlanChecklist(markdown: string): PlanChecklist {
	const lines = markdown.split(/\r?\n/);
	// start-work SKILL.md uses `## Todos` (and `## Final Verification Wave`).
	// Some older plans used `## TODOs`; accept both so a rename does not
	// silently zero out progress.
	const hasCountedSections = lines.some((line) => isCountedHeading(parseLevelTwoHeading(line)));
	let completed = 0;
	let remaining = 0;
	let nextTaskLabel: string | null = null;
	let isCountedSection = !hasCountedSections;

	for (const line of lines) {
		const heading = parseLevelTwoHeading(line);
		if (heading !== null) {
			isCountedSection = isCountedHeading(heading);
			continue;
		}
		if (!isCountedSection) continue;

		const checkbox = parseTopLevelCheckbox(line);
		if (checkbox === null) continue;

		if (checkbox.checked) {
			completed += 1;
		} else {
			remaining += 1;
			nextTaskLabel = nextTaskLabel ?? checkbox.label;
		}
	}

	return { completed, remaining, total: completed + remaining, nextTaskLabel };
}

// ---------------------------------------------------------------------------
// start-work: boulder.json parser (defensive, soft schema)
// ---------------------------------------------------------------------------

function readBoulderState(path: string): BoulderState | null {
	const raw = safeReadText(path);
	if (raw === null) return null;
	const parsed = tryParseJson(raw);
	if (parsed === undefined) return null;
	return parseBoulderState(parsed);
}

function parseBoulderState(value: unknown): BoulderState | null {
	if (!isRecord(value)) return null;

	const works: BoulderWork[] = [];
	const worksValue = value["works"];
	const hasWorksMap = isRecord(worksValue);
	if (hasWorksMap) {
		for (const workValue of Object.values(worksValue)) {
			const work = parseBoulderWork(workValue);
			if (work !== null) works.push(work);
		}
	}

	if (works.length === 0) return null;
	return { works, hasWorksMap };
}

function parseBoulderWork(value: unknown): BoulderWork | null {
	if (!isRecord(value)) return null;

	const activePlan = value["active_plan"];
	const planName = value["plan_name"];
	if (typeof activePlan !== "string") return null;

	const status = parseBoulderWorkStatus(value["status"]);
	const sessionIds = parseSessionIds(value["session_ids"]);
	const worktreePath = value["worktree_path"];
	const startedAt = value["started_at"];
	const updatedAt = value["updated_at"];
	const failCountRaw = value["fail_count"];
	const failCount = typeof failCountRaw === "number" && Number.isFinite(failCountRaw) ? failCountRaw : undefined;

	return {
		activePlan,
		planName: typeof planName === "string" ? planName : activePlan,
		sessionIds,
		...(status === undefined ? {} : { status }),
		...(failCount === undefined ? {} : { failCount }),
		...(typeof startedAt === "string" ? { startedAt } : {}),
		...(typeof updatedAt === "string" ? { updatedAt } : {}),
		...(typeof worktreePath === "string" ? { worktreePath } : {}),
	};
}

function pickMostRecentContinuable(works: readonly BoulderWork[]): BoulderWork | null {
	let best: BoulderWork | null = null;
	let bestMs = 0;
	for (const work of works) {
		if (!isContinuableStatus(work.status)) continue;
		const ms = parseIsoToMs(work.updatedAt ?? work.startedAt) ?? 0;
		if (best === null || ms > bestMs) {
			best = work;
			bestMs = ms;
		}
	}
	return best;
}

function resolveBoulderPlanPathForWork(cwd: string, work: BoulderWork): string {
	const absolutePlanPath = resolveTrackedPath(cwd, work.activePlan);
	const worktreePath = work.worktreePath?.trim();
	if (worktreePath === undefined || worktreePath.length === 0) return absolutePlanPath;

	const relativePlanPath = relative(resolve(cwd), absolutePlanPath);
	if (relativePlanPath.length === 0 || relativePlanPath.startsWith("..") || isAbsolute(relativePlanPath)) {
		return absolutePlanPath;
	}

	const worktreePlanPath = resolve(resolveTrackedPath(cwd, worktreePath), relativePlanPath);
	return existsSync(worktreePlanPath) ? worktreePlanPath : absolutePlanPath;
}

function resolveTrackedPath(baseDirectory: string, trackedPath: string): string {
	return isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(baseDirectory, trackedPath);
}

function parseTopLevelCheckbox(line: string): { readonly checked: boolean; readonly label: string } | null {
	if (line.startsWith("- [ ] ")) return { checked: false, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
		return { checked: true, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	}
	return null;
}

function parseLevelTwoHeading(line: string): string | null {
	if (!line.startsWith("## ")) return null;
	return line.slice("## ".length).trim();
}

function isCountedHeading(heading: string | null): boolean {
	if (heading === null) return false;
	const normalized = heading.toLowerCase();
	return normalized === TODO_HEADING_LOWER || normalized === FINAL_VERIFICATION_HEADING_LOWER;
}

function parseBoulderWorkStatus(value: unknown): BoulderWorkStatus | undefined {
	if (value === "active" || value === "paused" || value === "completed" || value === "abandoned" || value === "blocked") return value;
	return undefined;
}

function parseSessionIds(value: unknown): readonly string[] {
	if (!Array.isArray(value)) return [];
	const sessionIds: string[] = [];
	for (const item of value) {
		if (typeof item === "string") sessionIds.push(item);
	}
	return sessionIds;
}

function parseIsoToMs(value: string | undefined): number | null {
	if (value === undefined) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function isContinuableStatus(status: BoulderWorkStatus | undefined): boolean {
	return status === "active" || status === "paused";
}

function emptyChecklist(): PlanChecklist {
	return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
}

// ---------------------------------------------------------------------------
// ulw-loop: read goals.json (schema-validated, stable)
// ---------------------------------------------------------------------------

/**
 * Read `.omo/ulw-loop/goals.json`. Returns null when there is no plan or
 * every goal is complete.
 */
export function readInProgressUlwLoop(cwd: string): UlwLoopSnapshot | null {
	const goalsPath = join(cwd, ".omo", "ulw-loop", "goals.json");
	if (!existsSync(goalsPath)) return null;

	const raw = safeReadText(goalsPath);
	if (raw === null) {
		return degradedUlwLoop(cwd, goalsPath);
	}
	const parsed = tryParseJson(raw);
	if (parsed === undefined) {
		return degradedUlwLoop(cwd, goalsPath);
	}

	const plan = parseUlwLoopPlan(parsed);
	if (plan === null) return null;

	let totalCriteria = 0;
	let passedCriteria = 0;
	const goals: UlwLoopGoalSnapshot[] = [];
	let hasIncomplete = false;

	for (const goal of plan.goals) {
		let cTotal = 0;
		let cPassed = 0;
		const criteria = goal.successCriteria;
		if (Array.isArray(criteria)) {
			for (const c of criteria) {
				if (!isRecord(c)) continue;
				cTotal += 1;
				if (parseCriterionStatus(c["status"]) === "pass") cPassed += 1;
			}
		}
		totalCriteria += cTotal;
		passedCriteria += cPassed;

		const goalStatus = typeof goal.status === "string" ? goal.status : "unknown";
		if (!isUlwLoopGoalComplete(goalStatus)) hasIncomplete = true;

		goals.push({
			id: typeof goal.id === "string" ? goal.id : "",
			label: typeof goal.label === "string" ? goal.label : "(unlabeled goal)",
			status: goalStatus,
			criteriaTotal: cTotal,
			criteriaPassed: cPassed,
		});
	}

	if (!hasIncomplete && goals.length > 0) return null;

	return {
		kind: "ulw-loop",
		goalsPath,
		ledgerPath: join(cwd, ".omo", "ulw-loop", "ledger.jsonl"),
		goals,
		totalCriteria,
		passedCriteria,
		degraded: false,
	};
}

function degradedUlwLoop(cwd: string, goalsPath: string): UlwLoopSnapshot {
	return {
		kind: "ulw-loop",
		goalsPath,
		ledgerPath: join(cwd, ".omo", "ulw-loop", "ledger.jsonl"),
		goals: [],
		totalCriteria: 0,
		passedCriteria: 0,
		degraded: true,
	};
}

type ParsedUlwLoopGoal = {
	readonly id: unknown;
	readonly label: unknown;
	readonly status: unknown;
	readonly successCriteria: unknown;
};

type ParsedUlwLoopPlan = {
	readonly goals: readonly ParsedUlwLoopGoal[];
};

function parseUlwLoopPlan(value: unknown): ParsedUlwLoopPlan | null {
	if (!isRecord(value)) return null;
	const goals = parseGoalArray(value["goals"]);
	if (goals === null) return null;
	return { goals };
}

function parseGoalArray(value: unknown): readonly ParsedUlwLoopGoal[] | null {
	if (!Array.isArray(value)) return null;
	const goals: ParsedUlwLoopGoal[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		goals.push({
			id: item["id"],
			label: item["label"] ?? item["title"] ?? item["description"],
			status: item["status"],
			successCriteria: item["successCriteria"] ?? item["criteria"],
		});
	}
	return goals;
}

function parseCriterionStatus(value: unknown): UlwLoopCriterionStatus | null {
	if (value === "pending" || value === "pass" || value === "fail" || value === "blocked") return value;
	return null;
}

function isUlwLoopGoalComplete(status: string): boolean {
	return status === "complete" || status === "completed" || status === "pass";
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function safeReadText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function tryParseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
