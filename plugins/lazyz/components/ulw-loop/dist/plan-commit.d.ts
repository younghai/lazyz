import { type UlwLoopScope } from "./paths.js";
import { type UlwLoopLedgerEntry, type UlwLoopPlan } from "./types.js";
interface CommitHooks {
    readonly beforeMutation?: () => void | Promise<void>;
    readonly beforeCommit?: () => void | Promise<void>;
    readonly afterCommit?: () => void | Promise<void>;
    readonly link?: (source: string, destination: string) => void;
    readonly writeView?: (path: string, content: string) => Promise<void>;
}
export declare function withCommitHooks<T>(value: CommitHooks, fn: () => Promise<T>): Promise<T>;
export declare function beforePlanMutation(): Promise<void>;
export declare function writeViewFile(path: string, content: string): Promise<void>;
export declare function commit(repoRoot: string, scope: UlwLoopScope | undefined, mutation: {
    readonly plan: UlwLoopPlan;
    readonly entries: readonly UlwLoopLedgerEntry[];
}): Promise<void>;
export declare function materializeSync(dir: string): void;
export declare function materialize(dir: string): Promise<void>;
export {};
