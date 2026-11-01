import type { PreToolUsePayload } from "./codex-hook.js";
export declare const DEFAULT_FANOUT_LIMIT = 24;
export interface SpawnGuardOptions {
    readonly lockTimeoutMs?: number;
}
export declare function applySpawnGuards(payload: PreToolUsePayload, options?: SpawnGuardOptions): string;
export declare function applySpawnBudgetGuards(payload: PreToolUsePayload, options?: SpawnGuardOptions): string;
export declare function runSpawnAdmissionRecorderCli(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream): Promise<void>;
export declare function runSpawnGuardCli(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream): Promise<void>;
