import type { UlwLoopScope } from "./paths.js";
import type { UlwLoopItem, UlwLoopPlan } from "./types.js";
import { UlwLoopError } from "./types.js";
export interface CheckpointCodexGoalValidation {
    readonly raw: unknown;
    readonly nextActions: readonly string[];
    readonly warnings: readonly string[];
    readonly unacknowledgedObjective?: string;
}
export declare function validateCheckpointCodexGoal(input: {
    readonly repoRoot: string;
    readonly plan: UlwLoopPlan;
    readonly goal: UlwLoopItem;
    readonly raw: string | undefined;
    readonly evidence: string;
    readonly scope?: UlwLoopScope;
}): Promise<CheckpointCodexGoalValidation>;
export declare function combineCheckpointValidationErrors(codexError: UlwLoopError, gateError: UlwLoopError): UlwLoopError;
