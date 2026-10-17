import type { DispatchContract } from "./dispatch-contract.js";
import type { HookFileSystem } from "./types.js";
export { getTaskStatePath } from "./task-state-path.js";
type RunStatus = "reserved" | "passed" | "failed";
type RunState = {
    readonly runId: string;
    readonly toolUseId: string;
    readonly status: RunStatus;
    readonly failureSignature?: string;
};
export type TaskState = {
    readonly schemaVersion: 1;
    readonly contract: DispatchContract;
    readonly runs: readonly RunState[];
    readonly exhausted: boolean;
};
export type StateResult = {
    readonly ok: true;
    readonly state: TaskState;
} | {
    readonly ok: false;
    readonly reason: string;
};
export type SessionTaskInspection = {
    readonly tasks: readonly TaskState[];
    readonly invalid: boolean;
};
export declare function reserveRun(cwd: string, sessionId: string, contract: DispatchContract, toolUseId: string, fs: HookFileSystem): StateResult;
export declare function recordRunResult(cwd: string, sessionId: string, contract: DispatchContract, toolUseId: string, result: {
    readonly kind: "passed";
} | {
    readonly kind: "failed";
    readonly signature: string;
}, fs: HookFileSystem): StateResult;
export declare function inspectSessionTasks(cwd: string, sessionId: string, fs: HookFileSystem): SessionTaskInspection;
