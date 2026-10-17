import { createHash } from "node:crypto";

import type { UlwLoopPlan } from "./types.js";

type PlanDefinition = {
	readonly version: number;
	readonly briefPath: string;
	readonly goalsPath: string;
	readonly ledgerPath: string;
	readonly codexGoalMode: string;
	readonly codexObjective: string | null;
	readonly codexObjectiveAliases: readonly string[];
	readonly goals: readonly {
		readonly id: string;
		readonly title: string;
		readonly objective: string;
		readonly criteria: readonly {
			readonly id: string;
			readonly scenario: string;
			readonly userModel: string;
			readonly expectedEvidence: string;
			readonly essential: boolean;
		}[];
	}[];
};

function planDefinition(plan: UlwLoopPlan): PlanDefinition {
	return {
		version: plan.version,
		briefPath: plan.briefPath,
		goalsPath: plan.goalsPath,
		ledgerPath: plan.ledgerPath,
		codexGoalMode: plan.codexGoalMode ?? "per_story",
		codexObjective: plan.codexObjective ?? null,
		codexObjectiveAliases: plan.codexObjectiveAliases ?? [],
		goals: plan.goals.map((goal) => ({
			id: goal.id,
			title: goal.title,
			objective: goal.objective,
			criteria: goal.successCriteria.map((criterion) => ({
				id: criterion.id,
				scenario: criterion.scenario,
				userModel: criterion.userModel,
				expectedEvidence: criterion.expectedEvidence,
				essential: criterion.essential ?? true,
			})),
		})),
	};
}

export function deriveQualityGatePlanFingerprint(plan: UlwLoopPlan): string {
	return createHash("sha256")
		.update(JSON.stringify(planDefinition(plan)))
		.digest("hex");
}

export function expectedQualityGateCriterionRefs(plan: UlwLoopPlan): readonly string[] {
	return plan.goals.flatMap((goal) => goal.successCriteria.map((criterion) => `${goal.id}/${criterion.id}`));
}
