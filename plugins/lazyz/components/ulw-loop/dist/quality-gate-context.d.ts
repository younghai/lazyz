import type { UlwLoopScope } from "./paths.js";
export declare function buildQualityGateContext(repoRoot: string, goalId: string, scope?: UlwLoopScope): Promise<{
    binding: {
        schemaVersion: number;
        planFingerprint: string;
        finalGoalId: string;
        finalGoalObjective: string;
        source: import("../../lazycodex-executor-verify/dist/git-provenance.js").GitProvenance;
    };
    criterionRefs: readonly string[];
    totalCriteria: number;
    qaRoot: string;
}>;
