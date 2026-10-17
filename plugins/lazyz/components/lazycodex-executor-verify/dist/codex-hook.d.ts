import type { EvidenceVerifierOptions } from "./evidence-receipt.js";
import type { HookFileSystem } from "./types.js";
export { runSubagentStopHook } from "./legacy-hook.js";
export declare function runPreToolUseHook(input: unknown, fs: HookFileSystem): string;
export declare function runPostToolUseHook(input: unknown, fs: HookFileSystem, options?: EvidenceVerifierOptions): string;
export declare function runPostToolUseFailureHook(input: unknown, fs: HookFileSystem): string;
export declare function runStopHook(input: unknown, fs: HookFileSystem): string;
