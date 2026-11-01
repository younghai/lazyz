import type { UlwLoopSuccessCriterion, UlwLoopSuccessCriterionUserModel } from "./types.js";
export interface SuccessCriterionInput {
    readonly scenario: string;
    readonly expectedEvidence: string;
    readonly userModel?: UlwLoopSuccessCriterionUserModel;
    readonly essential?: boolean;
}
export declare function criterionId(index: number): string;
export declare function criteriaFromInput(input: readonly unknown[]): UlwLoopSuccessCriterion[];
