import { lstatSync as nodeLstatSync, realpathSync as nodeRealpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDirective } from "./directive.js";
import { clearAttemptState, MAX_ATTEMPTS, readAttemptState, writeAttemptState } from "./state.js";
import type {
	HookFileSystem,
	PostToolUseDenyOutput,
	PostToolUseInput,
	StopHookOutput,
	SubagentStopInput,
} from "./types.js";
import { POST_TOOL_USE_EVENT, SUBAGENT_STOP_EVENT } from "./types.js";

const LAZYCODEX_EXECUTOR_AGENTS = [
	"lazycodex-executor",
	"lazycodex-worker-high",
	"lazycodex-worker-medium",
	"lazycodex-worker-low",
] as const;

export function runSubagentStopHook(input: unknown, fs: HookFileSystem): string {
	if (!isSubagentStopInput(input)) return "";
	if (!LAZYCODEX_EXECUTOR_AGENTS.includes(input.agent_type as (typeof LAZYCODEX_EXECUTOR_AGENTS)[number])) return "";
	if (transcriptHasContextPressureMarker(input.transcript_path, fs)) return "";
	if (hasValidEvidenceReceipt(input.last_assistant_message, input.cwd, fs)) {
		clearAttemptState(input.cwd, input.session_id, input.agent_id, fs);
		return "";
	}
	const state = readAttemptState(input.cwd, input.session_id, input.agent_id, fs);
	if (state.attempts >= MAX_ATTEMPTS) {
		clearAttemptState(input.cwd, input.session_id, input.agent_id, fs);
		return "";
	}
	const attempts = state.attempts + 1;
	writeAttemptState(input.cwd, input.session_id, input.agent_id, { attempts }, fs);
	return JSON.stringify({
		decision: "block",
		reason: renderDirective(attempts, input.last_assistant_message),
	} satisfies StopHookOutput);
}

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
export function runPostToolUseHook(input: unknown, fs: HookFileSystem): string {
	if (!isPostToolUseInput(input)) return "";
	if (input.tool_name !== "Agent" && input.tool_name !== "Task") return "";
	if (!isLazycodexExecutorAgentCall(input.tool_input)) return "";
	if (transcriptHasContextPressureMarker(input.transcript_path, fs)) return "";

	const assistantMessage = extractStringFromToolResponse(input.tool_response);
	if (hasValidEvidenceReceipt(assistantMessage, input.cwd, fs)) {
		clearAttemptState(input.cwd, input.session_id, input.tool_use_id, fs);
		return "";
	}
	const state = readAttemptState(input.cwd, input.session_id, input.tool_use_id, fs);
	if (state.attempts >= MAX_ATTEMPTS) {
		clearAttemptState(input.cwd, input.session_id, input.tool_use_id, fs);
		return "";
	}
	const attempts = state.attempts + 1;
	writeAttemptState(input.cwd, input.session_id, input.tool_use_id, { attempts }, fs);
	const reason = renderDirective(attempts, assistantMessage);
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: POST_TOOL_USE_EVENT,
			permissionDecision: "deny",
			permissionDecisionReason: reason,
		},
	} satisfies PostToolUseDenyOutput);
}

/**
 * Detects whether an Agent/Task tool call targeted a lazycodex executor/worker
 * subagent. ZCode's PostToolUse payload has no `agent_type`, so we inspect the
 * tool input's `subagent_type` field (the canonical ZCode spawn parameter).
 * Recognizes the legacy single executor plus the high/medium/low worker tiers.
 */
function isLazycodexExecutorAgentCall(toolInput: unknown): boolean {
	if (!isRecord(toolInput)) return false;
	const subagentType = toolInput["subagent_type"];
	if (typeof subagentType === "string" && LAZYCODEX_EXECUTOR_AGENTS.includes(subagentType as (typeof LAZYCODEX_EXECUTOR_AGENTS)[number])) return true;
	// Fallback: scan the prompt text for an explicit role assignment. This is
	// brittle but catches inline-prompt executor dispatches.
	const prompt = toolInput["prompt"];
	if (typeof prompt === "string" && LAZYCODEX_EXECUTOR_AGENTS.some((agent) => prompt.includes(agent))) return true;
	return false;
}

function extractStringFromToolResponse(toolResponse: unknown): string | undefined {
	if (typeof toolResponse === "string") return toolResponse;
	if (isRecord(toolResponse)) {
		const text = toolResponse["text"];
		if (typeof text === "string") return text;
		const content = toolResponse["content"];
		if (typeof content === "string") return content;
	}
	return undefined;
}

const CONTEXT_PRESSURE_MARKERS = [
	"context compacted",
	"context_length_exceeded",
	"skill descriptions were shortened",
	"context_too_large",
	"codex ran out of room in the model's context window",
	"your input exceeds the context window",
	"long threads and multiple compactions",
] as const;

function transcriptHasContextPressureMarker(transcriptPath: string, fs: HookFileSystem): boolean {
	try {
		const transcript = fs.readFileSync(transcriptPath, "utf8").toLowerCase();
		return CONTEXT_PRESSURE_MARKERS.some((marker) => transcript.includes(marker));
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

function hasValidEvidenceReceipt(lastAssistantMessage: string | undefined, cwd: string, fs: HookFileSystem): boolean {
	const receiptPath = extractEvidencePath(lastAssistantMessage);
	if (receiptPath === null) return false;
	const evidenceRoot = resolve(cwd, ".omo", "evidence");
	const resolvedPath = isAbsolute(receiptPath) ? resolve(receiptPath) : resolve(cwd, receiptPath);
	if (!isPathInsideDirectory(resolvedPath, evidenceRoot)) return false;
	try {
		return isNonEmptyFileInsideEvidenceRoot(resolvedPath, evidenceRoot, cwd, fs);
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
	const relativePath = relative(directoryPath, filePath);
	return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isNonEmptyFileInsideEvidenceRoot(
	filePath: string,
	evidenceRoot: string,
	cwd: string,
	fs: HookFileSystem,
): boolean {
	if (!fs.existsSync(filePath)) return false;
	const realCwd = realPath(cwd, fs);
	const realEvidenceRoot = realPath(evidenceRoot, fs);
	const realFilePath = realPath(filePath, fs);
	if (!isPathInsideDirectory(realEvidenceRoot, realCwd)) return false;
	if (!isPathInsideDirectory(realFilePath, realEvidenceRoot)) return false;
	return isNonEmptyFile(filePath, fs);
}

function isNonEmptyFile(filePath: string, fs: HookFileSystem): boolean {
	if (!fs.existsSync(filePath)) return false;
	const linkStat = fs.lstatSync?.(filePath) ?? nodeLstatSync(filePath);
	if (linkStat.isSymbolicLink?.() === true) return false;
	const stat = fs.statSync(filePath);
	if (stat.size <= 0) return false;
	return stat.isFile?.() ?? true;
}

function realPath(path: string, fs: HookFileSystem): string {
	return fs.realpathSync?.(path) ?? nodeRealpathSync(path);
}

function extractEvidencePath(message: string | undefined): string | null {
	if (message === undefined) return null;
	const match = /EVIDENCE_RECORDED:\s*(\S+)/.exec(message);
	const receiptPath = match?.[1];
	return receiptPath === undefined ? null : receiptPath;
}

function isSubagentStopInput(value: unknown): value is SubagentStopInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === SUBAGENT_STOP_EVENT &&
		typeof value["agent_type"] === "string" &&
		typeof value["agent_id"] === "string" &&
		typeof value["session_id"] === "string" &&
		typeof value["cwd"] === "string" &&
		typeof value["transcript_path"] === "string" &&
		typeof value["model"] === "string" &&
		typeof value["permission_mode"] === "string" &&
		typeof value["stop_hook_active"] === "boolean" &&
		optionalString(value["turn_id"]) &&
		optionalString(value["last_assistant_message"])
	);
}

function isPostToolUseInput(value: unknown): value is PostToolUseInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === POST_TOOL_USE_EVENT &&
		typeof value["session_id"] === "string" &&
		typeof value["cwd"] === "string" &&
		typeof value["transcript_path"] === "string" &&
		typeof value["tool_name"] === "string" &&
		typeof value["tool_use_id"] === "string"
	);
}

function optionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
