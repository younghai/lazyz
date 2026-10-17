import { type UlwLoopScope } from "./paths.js";
export declare function isCrossProcessMutationLockHeld(repoRoot: string, scope?: UlwLoopScope): boolean;
export declare function withCrossProcessMutationLock<T>(repoRoot: string, scope: UlwLoopScope | undefined, fn: () => Promise<T>): Promise<T>;
