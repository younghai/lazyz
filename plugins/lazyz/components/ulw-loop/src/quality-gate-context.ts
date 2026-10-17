import { inspectGitProvenance } from "../../lazycodex-executor-verify/dist/git-provenance.js";
import { isFinalRunCompletionCandidate } from "./goal-status.js";
import type { UlwLoopScope } from "./paths.js";
import { ulwLoopRelativeDir } from "./paths.js";
import { readUlwLoopPlan } from "./plan-io.js";
import { deriveQualityGatePlanFingerprint, expectedQualityGateCriterionRefs } from "./quality-gate-binding.js";
import type { UlwLoopItem } from "./types.js";
import { UlwLoopError } from "./types.js";

function findGoal(goals: readonly UlwLoopItem[], goalId: string): UlwLoopItem {
	const goal = goals.find((candidate) => candidate.id === goalId);
	if (goal !== undefined) return goal;
	throw new UlwLoopError(`Unknown ulw-loop id: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { details: { goalId } });
}

export async function buildQualityGateContext(repoRoot: string, goalId: string, scope?: UlwLoopScope) {
	const plan = await readUlwLoopPlan(repoRoot, scope);
	const finalGoal = findGoal(plan.goals, goalId);
	if (!isFinalRunCompletionCandidate(plan, finalGoal)) {
		throw new UlwLoopError(
			`Goal ${goalId} is not the final completion candidate.`,
			"ULW_LOOP_QUALITY_CONTEXT_NOT_FINAL",
			{ details: { goalId } },
		);
	}
	const inspection = inspectGitProvenance(repoRoot);
	if (inspection.provenance === null) {
		throw new UlwLoopError(
			`Current git provenance is unavailable (${inspection.metrics.status}).`,
			"ULW_LOOP_SOURCE_PROVENANCE_UNAVAILABLE",
		);
	}
	const criterionRefs = expectedQualityGateCriterionRefs(plan);
	return {
		binding: {
			schemaVersion: 2,
			planFingerprint: deriveQualityGatePlanFingerprint(plan),
			finalGoalId: finalGoal.id,
			finalGoalObjective: finalGoal.objective,
			source: inspection.provenance,
		},
		criterionRefs,
		totalCriteria: criterionRefs.length,
		qaRoot: `${ulwLoopRelativeDir(scope)}/qa`,
	};
}
