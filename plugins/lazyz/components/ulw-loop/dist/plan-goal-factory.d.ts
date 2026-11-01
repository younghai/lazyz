import { type SuccessCriterionInput } from "./success-criteria-input.js";
import type { UlwLoopToolkitSurface } from "./surface.js";
import type { UlwLoopItem, UlwLoopPlan, UlwLoopSuccessCriterion } from "./types.js";
export interface GoalSeedOptions {
    readonly goalId?: string;
    readonly surface?: UlwLoopToolkitSurface;
    readonly successCriteria?: readonly SuccessCriterionInput[];
}
export declare function seedDefaultSuccessCriteria(goalIndex: number, objective: string, options?: Pick<GoalSeedOptions, "goalId" | "surface">): UlwLoopSuccessCriterion[];
export declare function deriveGoalCandidates(brief: string): Array<{
    title: string;
    objective: string;
}>;
export declare function makeGoal(title: string, objective: string, index: number, now: string, options?: GoalSeedOptions): UlwLoopItem;
export declare function appendGoalToPlan(plan: UlwLoopPlan, title: string, objective: string, now: string, options?: GoalSeedOptions): UlwLoopItem;
