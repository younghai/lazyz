import { renderDirective } from "./directive.js";
import { type EvidenceVerifierOptions, hasValidEvidenceReceipt } from "./evidence-receipt.js";
import { readGitProvenance } from "./git-provenance.js";
import { clearAttemptState, MAX_ATTEMPTS, readAttemptState, writeAttemptState } from "./state.js";
import type { HookFileSystem, SubagentStopInput } from "./types.js";

const LEGACY_EXECUTOR_AGENTS = [
	"executor",
	"lazycodex-executor",
	"lazycodex-worker-high",
	"lazycodex-worker-medium",
	"lazycodex-worker-low",
] as const;

export function runSubagentStopHook(input: unknown, fs: HookFileSystem, options: EvidenceVerifierOptions = {}): string {
	if (!isSubagentStopInput(input)) return "";
	if (!LEGACY_EXECUTOR_AGENTS.some((agent) => agent === input.agent_type)) return "";
	if (transcriptHasContextPressureMarker(input.transcript_path, fs)) return "";
	if (
		hasValidEvidenceReceipt(input.last_assistant_message, {
			cwd: input.cwd,
			fs,
			readGitProvenance: options.readGitProvenance ?? readGitProvenance,
		})
	) {
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
	return JSON.stringify({ decision: "block", reason: renderDirective(attempts, input.last_assistant_message) });
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

function isSubagentStopInput(value: unknown): value is SubagentStopInput {
	return (
		isRecord(value) &&
		value["hook_event_name"] === "SubagentStop" &&
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

function optionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
