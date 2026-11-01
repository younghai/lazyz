import { type UlwLoopScope } from "./paths.js";
import { type UlwLoopLedgerEntry, type UlwLoopPlan } from "./types.js";
export interface PlanCommitRecord {
    readonly version: 1;
    readonly revision: number;
    readonly plan: UlwLoopPlan;
    readonly ledger: readonly UlwLoopLedgerEntry[];
}
export declare function hasCode(error: unknown, code: string): boolean;
export declare function readOptional(path: string): string | undefined;
export declare function logNames(dir: string): string[];
export declare function readRecords(dir: string): PlanCommitRecord[];
export declare function readNewestRecord(dir: string): PlanCommitRecord | undefined;
export declare function reconcilePlan(dir: string): UlwLoopPlan | undefined;
export declare function assertProjectionComplete(plan: UlwLoopPlan, ledger: readonly UlwLoopLedgerEntry[]): void;
export declare function planExists(repoRoot: string, scope?: UlwLoopScope): boolean;
