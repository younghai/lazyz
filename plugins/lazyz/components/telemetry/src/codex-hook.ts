import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { stderr } from "node:process";
import {
	isTelemetryOptOutFilePresent,
	shouldDisableTelemetry,
	type TelemetryDiagnosticErrorKind,
	type TelemetryDiagnosticEvent,
} from "@oh-my-opencode/telemetry-core";
import {
	createPluginPostHog,
	getPostHogDistinctId,
	type PostHogActivityReason,
	type PostHogClient,
} from "./posthog.js";
import { writeComponentTelemetryDiagnostic } from "./product-identity.js";

export type CodexSessionStartInput = {
	session_id: string;
	transcript_path: string | null;
	cwd: string;
	hook_event_name: "SessionStart";
	model: string;
	permission_mode: string;
	source: "startup" | "resume" | "clear";
};

export type CodexTelemetryHookOptions = {
	createClient?: () => PostHogClient | Promise<PostHogClient>;
	getDistinctId?: () => string;
};

const SESSION_START_REASON: PostHogActivityReason = "session_start";

/**
 * First-run notice: prints a one-time message to stderr explaining that
 * anonymous telemetry is collected and how to opt out. A sentinel file
 * (`~/.omo/telemetry-notified`) prevents repeat notices.
 */
function maybePrintFirstRunNotice(homeDir: string = homedir()): void {
	const notifiedMarker = join(homeDir, ".omo", "telemetry-notified");
	if (existsSync(notifiedMarker)) return;
	try {
		mkdirSync(dirname(notifiedMarker), { recursive: true, mode: 0o700 });
		writeFileSync(notifiedMarker, new Date().toISOString());
	}	catch {
		// Best-effort: if we can't write the marker, we may re-notify later.
	}
	stderr.write(
		[
			"[LazyZ] Telemetry is OFF by default (privacy-by-default).",
			"[LazyZ] To enable anonymous daily-active tracking:",
			"[LazyZ]   export LAZYZ_ENABLE_TELEMETRY=1",
			"[LazyZ] (single daily event: hashed hostname, OS/runtime metadata only",
			"[LazyZ]  — no prompts, files, or tokens).",
			"[LazyZ] This notice appears once. See README → Privacy for full details.",
			"",
		].join("\n"),
	);
}

function writeHookDiagnostic(
	event: TelemetryDiagnosticEvent,
	error: unknown,
	errorKind: TelemetryDiagnosticErrorKind,
): void {
	writeComponentTelemetryDiagnostic({
		event,
		source: "plugin",
		error,
		errorKind,
	});
}

export async function runSessionStartHook(
	_input: CodexSessionStartInput,
	options: CodexTelemetryHookOptions = {},
): Promise<string> {
	const createClient = options.createClient ?? createPluginPostHog;
	const getDistinctId = options.getDistinctId ?? getPostHogDistinctId;

	// File-based opt-out: ~/.omo/telemetry-disabled
	if (isTelemetryOptOutFilePresent()) {
		return "";
	}

	// Opt-in gate: telemetry is OFF by default. The user must explicitly
	// enable it by setting LAZYZ_ENABLE_TELEMETRY=1 (or the legacy
	// OMO_ENABLE_TELEMETRY=1). This aligns with GDPR/privacy-by-default.
	const env = process.env;
	const isEnabled =
		isTruthy(env["LAZYZ_ENABLE_TELEMETRY"]) ||
		isTruthy(env["OMO_ENABLE_TELEMETRY"]) ||
		isTruthy(env["OMO_CODEX_ENABLE_TELEMETRY"]);
	if (!isEnabled) {
		return "";
	}

	// First-run notice (only when telemetry is active)
	maybePrintFirstRunNotice();

	let client: PostHogClient;
	try {
		client = await createClient();
	} catch (error) {
		writeHookDiagnostic("telemetry_posthog_init_failed", error, error instanceof Error ? "error" : "non_error");
		return "";
	}

	try {
		client.trackActive(getDistinctId(), SESSION_START_REASON);
	} catch (error) {
		writeHookDiagnostic("telemetry_capture_failed", error, error instanceof Error ? "error" : "non_error");
		await safeShutdown(client);
		return "";
	}
	await safeShutdown(client);
	return "";
}

function isTruthy(value: string | undefined): boolean {
	if (value === undefined) return false;
	return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function safeShutdown(client: PostHogClient): Promise<void> {
	try {
		await client.shutdown();
	} catch (error) {
		writeHookDiagnostic("telemetry_shutdown_failed", error, error instanceof Error ? "error" : "non_error");
		return;
	}
}
