import type { HookFileSystem } from "./types.js";
export declare function runSubagentStopHook(input: unknown, fs: HookFileSystem): string;
/**
 * ZCode PostToolUse handler — best-effort proxy for Codex SubagentStop.
 *
 * Limitations vs the Codex original:
 * - No `agent_type` field; we detect lazycodex-executor runs by inspecting
 *   `tool_input.subagent_type`. Misses inline-prompt executor runs.
 * - No `agent_id`; we key attempt state on `tool_use_id` instead.
 * - `decision: "block"` (session continuation) is unavailable on PostToolUse;
 *   we emit a `deny` permissionDecision, which rejects the tool call itself.
 *   The 3-attempt cap still bounds how many times we deny.
 */
export declare function runPostToolUseHook(input: unknown, fs: HookFileSystem): string;
