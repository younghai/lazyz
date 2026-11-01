import type { UlwLoopPlan } from "./types.js";
export declare function normalizeDriverObjective(value: string): string;
export declare function acknowledgedDriverObjectives(plan: UlwLoopPlan): readonly string[];
export declare function acknowledgeDriverObjective(plan: UlwLoopPlan, objective: string | undefined): boolean;
