import { createHash } from "node:crypto";
function planDefinition(plan) {
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
export function deriveQualityGatePlanFingerprint(plan) {
    return createHash("sha256")
        .update(JSON.stringify(planDefinition(plan)))
        .digest("hex");
}
export function expectedQualityGateCriterionRefs(plan) {
    return plan.goals.flatMap((goal) => goal.successCriteria.map((criterion) => `${goal.id}/${criterion.id}`));
}
