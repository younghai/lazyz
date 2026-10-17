export type QualityGateExecution = {
    readonly id: string;
    readonly command: string;
    readonly exitCode: 0;
    readonly criterionRefs: readonly string[];
    readonly artifactRefs: readonly string[];
};
export declare function parseQualityGateExecutions(value: unknown, artifactIds: ReadonlySet<string>): readonly QualityGateExecution[];
