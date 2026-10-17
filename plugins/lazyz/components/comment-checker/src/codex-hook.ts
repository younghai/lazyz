import { readFileSync } from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
	type CommentCheckRequest,
	extractCommentCheckRequests,
	isRecord,
	type ToolResultContent,
	type ToolResultLike,
	toHookInput,
} from "./core.js";
import { type CommentCheckerRunner, runCommentChecker } from "./runner.js";

export type CodexPostToolUseInput = {
	session_id: string;
	turn_id: string;
	transcript_path: string | null;
	cwd: string;
	hook_event_name: "PostToolUse";
	model: string;
	permission_mode: string;
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_response: unknown;
	tool_use_id: string;
};

export type CodexHookOptions = {
	run?: CommentCheckerRunner;
	readonly maxConcurrency?: number;
	readonly maxRequests?: number;
	readonly hookTimeoutMs?: number;
	readonly onMetrics?: (metrics: CommentCheckerHookMetrics) => void;
};

export interface CommentCheckerHookMetrics {
	readonly requested: number;
	readonly scheduled: number;
	readonly completed: number;
	readonly maxConcurrency: number;
	readonly timedOut: boolean;
	readonly durationMs: number;
}

const DEFAULT_MAX_HOOK_FEEDBACK_CHARS = 8000;
const CONTEXT_PRESSURE_MAX_HOOK_FEEDBACK_CHARS = 1200;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_REQUESTS = 16;
const DEFAULT_HOOK_TIMEOUT_MS = 4_500;
const CONTEXT_PRESSURE_MARKERS = [
	"context compacted",
	"context_length_exceeded",
	"skill descriptions were shortened",
	"context_too_large",
	"codex ran out of room in the model's context window",
	"your input exceeds the context window",
	"long threads and multiple compactions",
] as const;

export function extractCodexCommentCheckRequests(input: CodexPostToolUseInput): CommentCheckRequest[] {
	return extractCommentCheckRequests(toToolResultLike(input));
}

export async function runCommentCheckerPostToolUse(
	input: CodexPostToolUseInput,
	options: CodexHookOptions = {},
): Promise<string> {
	const requests = extractCodexCommentCheckRequests(input);
	const startedAt = Date.now();
	if (requests.length === 0) {
		options.onMetrics?.({
			requested: 0,
			scheduled: 0,
			completed: 0,
			maxConcurrency: 0,
			timedOut: false,
			durationMs: 0,
		});
		return "";
	}

	const maxRequests = normalizePositiveInteger(options.maxRequests, DEFAULT_MAX_REQUESTS);
	const scheduledRequests = uniqueRequestsByFile(requests).slice(0, maxRequests);
	const maxConcurrency = Math.min(
		normalizePositiveInteger(options.maxConcurrency, DEFAULT_MAX_CONCURRENCY),
		scheduledRequests.length,
	);
	const hookTimeoutMs = normalizePositiveInteger(options.hookTimeoutMs, DEFAULT_HOOK_TIMEOUT_MS);
	const runner = options.run ?? runCommentChecker;
	const warnings: Array<{ filePath: string; message: string } | undefined> = new Array(scheduledRequests.length);
	const controller = new AbortController();
	let nextIndex = 0;
	let completed = 0;
	let active = 0;
	let observedMaxConcurrency = 0;
	let timedOut = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<"timeout">((resolve) => {
		timeout = setTimeout(() => {
			timedOut = true;
			controller.abort("comment-checker hook deadline exceeded");
			resolve("timeout");
		}, hookTimeoutMs);
		timeout.unref?.();
	});
	const workers = Promise.all(
		Array.from({ length: maxConcurrency }, async () => {
			for (;;) {
				if (controller.signal.aborted) return;
				const index = nextIndex;
				nextIndex += 1;
				const request = scheduledRequests[index];
				if (request === undefined) return;
				active += 1;
				observedMaxConcurrency = Math.max(observedMaxConcurrency, active);
				try {
					const context = {
						sessionId: input.session_id,
						cwd: input.cwd,
						...(input.transcript_path === null ? {} : { transcriptPath: input.transcript_path }),
					};
					const result = await runner(toHookInput(request, context), { signal: controller.signal });
					if (result.status === "warning") {
						const message = normalizeHookText(result.message);
						if (message.length > 0) warnings[index] = { filePath: request.filePath, message };
					}
				} finally {
					active -= 1;
					completed += 1;
				}
			}
		}),
	);
	await Promise.race([workers.then(() => "complete" as const), deadline]);
	if (timeout !== undefined) clearTimeout(timeout);
	if (timedOut) void workers.catch(() => undefined);
	options.onMetrics?.({
		requested: requests.length,
		scheduled: scheduledRequests.length,
		completed,
		maxConcurrency: observedMaxConcurrency,
		timedOut,
		durationMs: Date.now() - startedAt,
	});

	const completedWarnings = warnings.filter(
		(warning): warning is { filePath: string; message: string } => warning !== undefined,
	);
	if (completedWarnings.length === 0) return "";

	return JSON.stringify({
		decision: "block",
		reason: limitHookText(formatWarnings(completedWarnings), hookFeedbackLimit(input.transcript_path)),
	});
}

function uniqueRequestsByFile(requests: readonly CommentCheckRequest[]): CommentCheckRequest[] {
	const seen = new Set<string>();
	const unique: CommentCheckRequest[] = [];
	for (const request of requests) {
		if (seen.has(request.filePath)) continue;
		seen.add(request.filePath);
		unique.push(request);
	}
	return unique;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	return value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Math.floor(value);
}

export async function runCodexHookCli(): Promise<void> {
	const input = await readStdin();
	if (input.trim().length === 0) return;
	const parsed = parseCodexPostToolUseInput(input);
	if (!parsed) return;
	const output = await runCommentCheckerPostToolUse(parsed);
	if (output.length > 0) {
		processStdout.write(output);
		processStdout.write("\n");
	}
}

export function parseCodexPostToolUseInput(input: string): CodexPostToolUseInput | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		return undefined;
	}
	return isCodexPostToolUseInput(parsed) ? parsed : undefined;
}

function toToolResultLike(input: CodexPostToolUseInput): ToolResultLike {
	return {
		toolName: input.tool_name,
		input: normalizeToolInput(input.tool_name, input.tool_input),
		content: normalizeToolResponse(input.tool_response),
		isError: isErrorResponse(input.tool_response),
		details: isRecord(input.tool_response) ? input.tool_response : undefined,
	};
}

function normalizeToolInput(toolName: string, toolInput: Record<string, unknown>): Record<string, unknown> {
	if (toolName === "apply_patch" && typeof toolInput["command"] === "string") {
		return {
			...toolInput,
			input: toolInput["command"],
			patch: toolInput["command"],
		};
	}
	return toolInput;
}

function normalizeToolResponse(toolResponse: unknown): ToolResultContent[] {
	if (typeof toolResponse === "string") {
		return [{ type: "text", text: toolResponse }];
	}
	if (isRecord(toolResponse) && typeof toolResponse["text"] === "string") {
		return [{ type: "text", text: toolResponse["text"] }];
	}
	return [];
}

function isErrorResponse(toolResponse: unknown): boolean {
	return isRecord(toolResponse) && toolResponse["is_error"] === true;
}

function formatWarnings(warnings: Array<{ filePath: string; message: string }>): string {
	return warnings
		.map((warning) => `comment-checker found issues in ${warning.filePath}:\n${warning.message}`)
		.join("\n\n");
}

function normalizeHookText(value: string): string {
	return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function hookFeedbackLimit(transcriptPath: string | null): number {
	return isContextPressureTranscript(transcriptPath)
		? CONTEXT_PRESSURE_MAX_HOOK_FEEDBACK_CHARS
		: DEFAULT_MAX_HOOK_FEEDBACK_CHARS;
}

function isContextPressureTranscript(transcriptPath: string | null): boolean {
	if (transcriptPath === null) return false;
	try {
		return hasContextPressureMarker(readFileSync(transcriptPath, "utf8"));
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

function hasContextPressureMarker(text: string): boolean {
	const normalizedText = text.toLowerCase();
	return CONTEXT_PRESSURE_MARKERS.some((marker) => normalizedText.includes(marker));
}

function limitHookText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const marker = `\n\n[Truncated hook output to ${maxChars} chars to avoid Codex context overflow.]`;
	if (marker.length >= maxChars) return marker.slice(0, maxChars);
	const head = text.slice(0, maxChars - marker.length).replace(/[ \t\r\n]+$/, "");
	return `${head}${marker}`;
}

function isCodexPostToolUseInput(value: unknown): value is CodexPostToolUseInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "PostToolUse" &&
		typeof value["session_id"] === "string" &&
		typeof value["turn_id"] === "string" &&
		(typeof value["transcript_path"] === "string" || value["transcript_path"] === null) &&
		typeof value["cwd"] === "string" &&
		typeof value["model"] === "string" &&
		typeof value["permission_mode"] === "string" &&
		typeof value["tool_name"] === "string" &&
		isRecord(value["tool_input"]) &&
		typeof value["tool_use_id"] === "string"
	);
}

function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		processStdin.setEncoding("utf-8");
		processStdin.on("data", (chunk: string) => {
			data += chunk;
		});
		processStdin.once("error", reject);
		processStdin.once("end", () => {
			resolve(data);
		});
	});
}
