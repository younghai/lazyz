import { UlwLoopError } from "./runtime.js";
import type { UlwLoopToolkitSurface } from "./surface.js";
export declare const ULW_LOOP_CREATE_GOALS_COMMAND = "omo-agent-toolkit ulw-loop create-goals --brief \"<brief>\" --json";
export declare function createGoalsAction(surface: UlwLoopToolkitSurface): string;
export interface PlanMissingRecovery {
    readonly message: string;
    readonly details?: {
        readonly existingSessionIds: readonly string[];
    };
}
/**
 * A missing plan is either "never bootstrapped" or "bootstrapped under a different
 * session id"; the recovery text has to answer both without the caller guessing.
 */
export declare function planMissingRecovery(existingSessionIds: readonly string[], surface?: UlwLoopToolkitSurface): PlanMissingRecovery;
export declare function planMissingError(planPath: string, existingSessionIds: readonly string[], surface?: UlwLoopToolkitSurface): UlwLoopError;
export declare function sessionScopeRequiredMessage(flag: string, existingSessionIds: readonly string[]): string;
export declare function sessionIdRequiredMessage(flag: string): string;
