import { type UlwLoopScope } from "./paths.js";
import type { SuccessCriterionInput } from "./success-criteria-input.js";
import type { UlwLoopToolkitSurface } from "./surface.js";
import type { UlwLoopCodexGoalMode, UlwLoopItem, UlwLoopPlan } from "./types.js";
export { deriveGoalCandidates, seedDefaultSuccessCriteria } from "./plan-goal-factory.js";
export type { SuccessCriterionInput } from "./success-criteria-input.js";
export type UlwLoopPlanSummary = {
    readonly total: number;
    readonly pending: number;
    readonly in_progress: number;
    readonly complete: number;
    readonly failed: number;
    readonly blocked: number;
    readonly review_blocked: number;
    readonly needs_user_decision: number;
    readonly superseded: number;
    readonly criteria: {
        readonly total: number;
        readonly pass: number;
        readonly pending: number;
        readonly fail: number;
        readonly blocked: number;
    };
};
export declare function createUlwLoopPlan(repoRoot: string, args: {
    brief: string;
    codexGoalMode?: UlwLoopCodexGoalMode;
    force?: boolean;
    validationBatchesJson?: string;
}, scope?: UlwLoopScope, surface?: UlwLoopToolkitSurface): Promise<UlwLoopPlan>;
export declare function addUlwLoopGoal(repoRoot: string, args: {
    title: string;
    objective: string;
    successCriteria?: readonly SuccessCriterionInput[];
}, scope?: UlwLoopScope, surface?: UlwLoopToolkitSurface): Promise<{
    plan: UlwLoopPlan;
    goal: UlwLoopItem;
}>;
export declare function startNextUlwLoop(repoRoot: string, args?: {
    retryFailed?: boolean;
}, scope?: UlwLoopScope): Promise<{
    plan: UlwLoopPlan;
    goal: UlwLoopItem;
    resumed: boolean;
} | {
    done: true;
    plan: UlwLoopPlan;
}>;
export declare function summarizeUlwLoopPlan(plan: UlwLoopPlan): UlwLoopPlanSummary;
