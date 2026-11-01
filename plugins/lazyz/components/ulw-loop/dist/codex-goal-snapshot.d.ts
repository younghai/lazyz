export type CodexGoalSnapshotStatus = "active" | "complete" | "paused" | "usage_limited" | "budget_limited" | "cancelled" | "failed" | "unknown";
export interface CodexGoalSnapshot {
    available: boolean;
    objective?: string;
    status?: CodexGoalSnapshotStatus;
    raw: unknown;
}
export interface CodexGoalReconciliation {
    ok: boolean;
    snapshot: CodexGoalSnapshot;
    /** Facts to know (a differing driver objective); never something to do. */
    warnings: string[];
    /** Things to do next (create, re-create, or resume the driver goal). */
    nextActions: string[];
    errors: string[];
    /** The differing objective this reconciliation reported for the first time, for the caller to acknowledge. */
    unacknowledgedObjective?: string;
}
export interface ReconcileCodexGoalOptions {
    expectedObjective: string;
    readonly acceptedObjectives?: readonly string[];
    readonly acknowledgedObjectives?: readonly string[];
}
export declare class CodexGoalSnapshotError extends Error {
}
export declare function parseCodexGoalSnapshot(value: unknown): CodexGoalSnapshot;
export declare function readCodexGoalSnapshotInput(raw: string | undefined, cwd?: string): Promise<CodexGoalSnapshot | null>;
export declare function reconcileCodexGoalSnapshot(snapshot: CodexGoalSnapshot | null | undefined, options: ReconcileCodexGoalOptions): CodexGoalReconciliation;
export declare function formatCodexGoalReconciliation(reconciliation: CodexGoalReconciliation): string;
