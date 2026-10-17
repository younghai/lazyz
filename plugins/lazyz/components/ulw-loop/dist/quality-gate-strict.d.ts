import type { GitProvenance } from "../../lazycodex-executor-verify/dist/git-provenance.js";
import type { UlwLoopScope } from "./paths.js";
import { type QualityGateExecution } from "./quality-gate-executions.js";
import type { UlwLoopItem, UlwLoopPlan, UlwLoopQualityGate } from "./types.js";
export interface StrictQualityGateContext {
    readonly repoRoot: string;
    readonly plan: UlwLoopPlan;
    readonly finalGoal: UlwLoopItem | undefined;
    readonly source: GitProvenance | null;
    readonly scope?: UlwLoopScope;
}
type BoundArtifact = UlwLoopQualityGate["manualQa"]["artifactRefs"][number] & {
    readonly sha256: string;
};
type BoundSurfaceEvidence = UlwLoopQualityGate["manualQa"]["surfaceEvidence"][number] & {
    readonly executionRef: string;
};
type BoundAdversarialCase = UlwLoopQualityGate["manualQa"]["adversarialCases"][number] & {
    readonly executionRef: string;
};
export type UlwLoopStrictQualityGate = UlwLoopQualityGate & {
    readonly binding: {
        readonly schemaVersion: 2;
        readonly planFingerprint: string;
        readonly finalGoalId: string;
        readonly finalGoalObjective: string;
        readonly source: GitProvenance;
    };
    readonly codeReview: UlwLoopQualityGate["codeReview"] & {
        readonly reportSha256: string;
    };
    readonly manualQa: Omit<UlwLoopQualityGate["manualQa"], "surfaceEvidence" | "adversarialCases" | "artifactRefs"> & {
        readonly surfaceEvidence: readonly BoundSurfaceEvidence[];
        readonly adversarialCases: readonly BoundAdversarialCase[];
        readonly artifactRefs: readonly BoundArtifact[];
        readonly executions: readonly QualityGateExecution[];
    };
    readonly gateReview: UlwLoopQualityGate["gateReview"] & {
        readonly reportSha256: string;
    };
    readonly criteriaCoverage: UlwLoopQualityGate["criteriaCoverage"] & {
        readonly criterionRefs: readonly string[];
    };
};
export declare function validateStrictQualityGate(input: unknown, context: StrictQualityGateContext): UlwLoopStrictQualityGate;
export {};
