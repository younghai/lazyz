import { closeSync, fstatSync, openSync, readSync } from "node:fs";

import { ULTRAWORK_DIRECTIVE } from "./directive.js";

const ULTRAWORK_CURRENT_PROMPT_PATTERN = /(?:ultrawork|ulw)/i;
const ULTRAWORK_DIRECTIVE_MARKER = "<ultrawork-mode>";
const TRANSCRIPT_SEARCH_BYTES = 512_000;
const CONTEXT_PRESSURE_MARKERS = [
	"context compacted",
	"context_length_exceeded",
	"skill descriptions were shortened",
	"context_too_large",
	"codex ran out of room in the model's context window",
	"your input exceeds the context window",
	"long threads and multiple compactions",
] as const;

export type CodexUserPromptSubmitInput = {
	readonly hook_event_name: "UserPromptSubmit";
	readonly prompt: string;
	readonly transcript_path?: string | null;
};

interface UserPromptSubmitHookOutput {
	readonly hookSpecificOutput: {
		readonly hookEventName: "UserPromptSubmit";
		readonly additionalContext: string;
	};
}

export function runUserPromptSubmitHook(input: unknown): string {
	if (!isCodexUserPromptSubmitInput(input)) return "";
	if (!isUltraworkPrompt(input.prompt)) return "";
	if (isContextPressureRecoveryPrompt(input.prompt)) return "";
	const transcriptSignals = readTranscriptSignals(input.transcript_path);
	if (transcriptSignals.directiveAlreadyPresent || transcriptSignals.contextPressure) return "";
	return formatAdditionalContextOutput(ULTRAWORK_DIRECTIVE);
}

type TranscriptSignals = { readonly directiveAlreadyPresent: boolean; readonly contextPressure: boolean };

function readTranscriptSignals(transcriptPath: string | null | undefined): TranscriptSignals {
	if (transcriptPath === undefined || transcriptPath === null) return { directiveAlreadyPresent: false, contextPressure: false };
	try {
		const rawTranscript = readTranscriptTail(transcriptPath);
		const contextPressure = isContextPressureRecoveryPrompt(rawTranscript);
		let directiveAlreadyPresent = false;
		for (const line of rawTranscript.split(/\r?\n/)) {
			const parsed = parseJsonLine(line);
			if (parsed === null) {
				continue;
			}

			if (!isRecord(parsed)) {
				continue;
			}

			const hookSpecificOutput = parsed["hookSpecificOutput"];
			if (!isRecord(hookSpecificOutput)) {
				continue;
			}

			if (hookSpecificOutput["hookEventName"] !== "UserPromptSubmit") {
				continue;
			}

			if (
				typeof hookSpecificOutput["additionalContext"] === "string" &&
				hookSpecificOutput["additionalContext"].includes(ULTRAWORK_DIRECTIVE_MARKER)
			) {
				directiveAlreadyPresent = true;
				break;
			}
		}
		return { directiveAlreadyPresent, contextPressure };
	} catch (error) {
		if (error instanceof Error) return { directiveAlreadyPresent: false, contextPressure: false };
		throw error;
	}
}

export function readTranscriptTail(transcriptPath: string): string {
	const descriptor = openSync(transcriptPath, "r");
	try {
		const size = fstatSync(descriptor).size;
		const length = Math.min(size, TRANSCRIPT_SEARCH_BYTES);
		const buffer = Buffer.alloc(length);
		const bytesRead = readSync(descriptor, buffer, 0, length, size - length);
		return buffer.subarray(0, bytesRead).toString("utf8");
	} finally {
		closeSync(descriptor);
	}
}

export function isUltraworkPrompt(prompt: string): boolean {
	return ULTRAWORK_CURRENT_PROMPT_PATTERN.test(prompt);
}

function isContextPressureRecoveryPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.toLowerCase();
	return CONTEXT_PRESSURE_MARKERS.some((marker) => normalizedPrompt.includes(marker));
}

function formatAdditionalContextOutput(additionalContext: string): string {
	const normalizedContext = normalizeAdditionalContext(additionalContext);
	if (normalizedContext.length === 0) return "";
	const output: UserPromptSubmitHookOutput = {
		hookSpecificOutput: {
			hookEventName: "UserPromptSubmit",
			additionalContext: normalizedContext,
		},
	};
	return `${JSON.stringify(output)}\n`;
}

function normalizeAdditionalContext(additionalContext: string): string {
	return additionalContext.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function parseJsonLine(line: string): unknown | null {
	if (line.trim().length === 0) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(line);
		return parsed;
	} catch (error) {
		if (error instanceof Error) {
			return null;
		}
		throw error;
	}
}

function isCodexUserPromptSubmitInput(value: unknown): value is CodexUserPromptSubmitInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "UserPromptSubmit" &&
		typeof value["prompt"] === "string" &&
		(value["transcript_path"] === undefined ||
			value["transcript_path"] === null ||
			typeof value["transcript_path"] === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
