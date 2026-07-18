import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	type WorkSnapshot,
	readInProgressStartWorkLenient,
	readInProgressUlwLoop,
} from "./work-status.js";

/**
 * SessionStart hook for the work-status features. Combines three Sprint 1
 * concerns, all fired from the same single SessionStart hook so we do not
 * add more hooks for the user to approve:
 *
 *   T4 — Work-resume prompt: when there is in-progress start-work / ulw-loop
 *        state in `<cwd>/.omo/`, emit a one-line resume prompt at most once
 *        per UTC day per work identity.
 *
 *   T5 — init-deep auto-suggestion: when the cwd has NO `AGENTS.md` (the
 *        project memory file), emit a one-line suggestion to run `init-deep`,
 *        at most once per UTC day per project.
 *
 *   T6 — Local MCP build-missing warning: when a `required: false` local MCP
 *        server's `dist/` is missing, warn once per UTC day so the user is
 *        not left wondering why codegraph/git_bash/lsp do not respond.
 *
 * Output is a single `hookSpecificOutput.additionalContext` JSON blob on
 * stdout (one or more lines joined), or the empty string when there is
 * nothing to say. Never throws.
 */

export type SessionStartInput = {
	readonly session_id: string;
	readonly cwd: string;
	readonly hook_event_name: "SessionStart";
	readonly source: "startup" | "resume" | "clear" | "compact" | string;
};

export type ResumePromptOptions = {
	readonly now?: Date;
	/**
	 * The plugin root, used to locate the local MCP `dist/` builds for the
	 * build-missing warning (T6). When omitted (e.g. in tests), the
	 * build-missing check is skipped.
	 */
	readonly pluginRoot?: string;
};

const PROMPT_STATE_PATH = ".omo/.lazyz-prompts.json";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Local MCP servers declared `required: false` in .mcp.json. If their dist/
// is missing, the server silently fails to load — surface that (T6).
const LOCAL_MCP_SERVERS: ReadonlyArray<{ readonly name: string; readonly dist: string }> = [
	{ name: "codegraph", dist: "components/codegraph/dist/serve.js" },
	{ name: "git_bash", dist: "components/git-bash/dist/cli.js" },
	{ name: "lsp", dist: "components/lsp/dist/cli.js" },
];

export function runSessionStartResume(input: SessionStartInput, options: ResumePromptOptions = {}): string {
	const now = (options.now ?? new Date()).getTime();
	const lines: string[] = [];

	// T4 — work resume prompt
	const resumeLine = maybeResumeLine(input.cwd, now);
	if (resumeLine !== null) lines.push(resumeLine);

	// T5 — init-deep suggestion when AGENTS.md is missing
	const initLine = maybeInitDeepSuggestion(input.cwd, now);
	if (initLine !== null) lines.push(initLine);

	// T6 — local MCP build-missing warning
	if (options.pluginRoot !== undefined && options.pluginRoot.length > 0) {
		const buildLines = maybeBuildMissingLines(options.pluginRoot, input.cwd, now);
		for (const line of buildLines) lines.push(line);
	}

	// T7 — Manual-QA pre-notification for freshly started work
	const qaLine = maybeManualQaNotice(input.cwd, now);
	if (qaLine !== null) lines.push(qaLine);

	if (lines.length === 0) return "";
	return encodeAdditionalContext(lines.join("\n\n"));
}

// ---------------------------------------------------------------------------
// T4 — work resume
// ---------------------------------------------------------------------------

function maybeResumeLine(cwd: string, nowMs: number): string | null {
	const snapshot = pickResumableWork(cwd);
	if (snapshot === null) return null;

	const key = `resume:${resumeKey(snapshot)}`;
	const lastAt = readPromptedAt(cwd, key);
	if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS) return null;

	writePromptedAt(cwd, key, nowMs);
	return renderResumePrompt(snapshot, nowMs, lastAt);
}

function pickResumableWork(cwd: string): WorkSnapshot | null {
	const sw = readInProgressStartWorkLenient(cwd);
	if (sw !== null) return sw;
	return readInProgressUlwLoop(cwd);
}

function resumeKey(snapshot: WorkSnapshot): string {
	if (snapshot.kind === "start-work") {
		return `start-work:${snapshot.planName}:${snapshot.status ?? "unknown"}`;
	}
	return `ulw-loop:${snapshot.goalsPath}`;
}

function renderResumePrompt(snapshot: WorkSnapshot, nowMs: number, lastAt: number | null): string {
	const since = lastAt !== null ? ` (마지막 안내: ${formatElapsed(nowMs - lastAt)} 전)` : "";

	if (snapshot.kind === "start-work") {
		if (snapshot.degraded) {
			return `⏳ LazyZ: 진행 중인 start-work 작업이 있는 것으로 보이나 boulder.json을 완전히 읽지 못했습니다 (${snapshot.boulderPath}). 수동으로 확인해 주세요.${since}`;
		}
		if (snapshot.status === "blocked") {
			const fail = snapshot.failCount ?? 0;
			return `⛔ LazyZ: "${snapshot.planName}" 작업이 blocked 상태입니다 (실패 캡 도달, fail_count=${fail}). continuation이 중단됩니다. status를 "active"로 변경하거나 사용자 판단이 필요합니다.${since}`;
		}
		const { completed, total, nextTaskLabel } = snapshot.checklist;
		const next = nextTaskLabel ?? "(다음 작업 라벨 없음)";
		return `⏳ LazyZ: 진행 중인 작업이 있습니다 — "${snapshot.planName}" (${completed}/${total} 완료). 다음: ${truncate(next, 80)}.${
			snapshot.worktreePath !== null ? ` worktree: ${snapshot.worktreePath}.` : ""
		} 이어서 하시려면 start-work로 진행, 무시하셔도 됩니다.${since}`;
	}

	if (snapshot.degraded) {
		return `⏳ LazyZ: 진행 중인 ulw-loop 작업이 있는 것으로 보이나 goals.json을 완전히 읽지 못했습니다 (${snapshot.goalsPath}).${since}`;
	}
	const total = snapshot.goals.length;
	const incomplete = snapshot.goals.filter((g) => !isComplete(g.status)).length;
	const cr = `${snapshot.passedCriteria}/${snapshot.totalCriteria}`;
	return `⏳ LazyZ: 진행 중인 ulw-loop 작업이 있습니다 — 골 ${incomplete}/${total} 미완료, 크리테리아 ${cr} 통과. 이어서 하시려면 ulw-loop로 진행, 무시하셔도 됩니다.${since}`;
}

// ---------------------------------------------------------------------------
// T5 — init-deep suggestion when AGENTS.md is missing
// ---------------------------------------------------------------------------

function maybeInitDeepSuggestion(cwd: string, nowMs: number): string | null {
	// Project memory = AGENTS.md at the cwd root. init-deep generates the
	// hierarchy; without it, downstream skills (esp. ulw-plan) lose quality.
	if (existsSync(join(cwd, "AGENTS.md"))) return null;

	const key = "init-deep-suggestion";
	const lastAt = readPromptedAt(cwd, key);
	if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS) return null;

	writePromptedAt(cwd, key, nowMs);
	return (
		"💡 LazyZ: 이 프로젝트에 `AGENTS.md` 메모리가 없습니다. `init-deep`을 한 번 실행하면 " +
		"계층적 프로젝트 메모리가 생성되어 이후 계획·실행 품질이 크게 올라갑니다. " +
		"무시하셔도 됩니다. (최초 9개 스킬 안내는 플러그인 README의 'Start here' 섹션을 보세요.)"
	);
}

// ---------------------------------------------------------------------------
// T6 — local MCP build-missing warning
// ---------------------------------------------------------------------------

function maybeBuildMissingLines(pluginRoot: string, cwd: string, nowMs: number): string[] {
	const missing: string[] = [];
	for (const server of LOCAL_MCP_SERVERS) {
		const distPath = join(pluginRoot, server.dist);
		if (!existsSync(distPath)) missing.push(server.name);
	}
	if (missing.length === 0) return [];

	const key = `build-missing:${missing.sort().join(",")}`;
	const lastAt = readPromptedAt(cwd, key);
	if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS) return [];

	writePromptedAt(cwd, key, nowMs);
	const list = missing.join(", ");
	return [
		`⚠️ LazyZ: 로컬 MCP 서버가 빌드되지 않았습니다 (${list}). 이 서버들은 \`required: false\`라 조용히 스킵됩니다. 기능이 필요하면 \`cd plugins/lazyz && npm install && npm run build\` 후 ZCode를 재시작하세요. 무시하셔도 됩니다.`,
	];
}

// ---------------------------------------------------------------------------
// T7 — Manual-QA pre-notification for freshly started work
// ---------------------------------------------------------------------------

function maybeManualQaNotice(cwd: string, nowMs: number): string | null {
	// Only fire when there is a freshly started start-work (completed === 0),
	// so the user sees the channel requirement before the first checkbox.
	const sw = readInProgressStartWorkLenient(cwd);
	if (sw === null || sw.checklist.completed !== 0) return null;

	const key = `manual-qa-notice:start-work:${sw.planName}`;
	const lastAt = readPromptedAt(cwd, key);
	if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS) return null;

	writePromptedAt(cwd, key, nowMs);
	return `ℹ️ LazyZ: 이 작업의 사용자 노출 체크박스는 각각 Manual-QA 증거가 필요합니다 — HTTP(curl), tmux, browser, computer-use 중 해당 채널을 준비해 주세요. (CLI/데이터 형태는 보조 증거 허용; --dry-run은 증불가) 무시하셔도 됩니다.`;
}

// ---------------------------------------------------------------------------
// Shared small helpers
// ---------------------------------------------------------------------------

function isComplete(status: string): boolean {
	return status === "complete" || status === "completed" || status === "pass";
}

function formatElapsed(ms: number): string {
	if (ms < 60_000) return "방금";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes}분`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}시간`;
	const days = Math.floor(hours / 24);
	return `${days}일`;
}

function truncate(text: string, max: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

// ---------------------------------------------------------------------------
// .omo/.lazyz-prompts.json — at-most-once-per-day dedup
// ---------------------------------------------------------------------------

function readPromptedAt(cwd: string, key: string): number | null {
	const path = join(cwd, PROMPT_STATE_PATH);
	if (!existsSync(path)) return null;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(parsed)) return null;
		const v = parsed[key];
		return typeof v === "number" ? v : null;
	} catch {
		return null;
	}
}

function writePromptedAt(cwd: string, key: string, ms: number): void {
	const path = join(cwd, PROMPT_STATE_PATH);
	const state: Record<string, number> = {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed)) {
			for (const [k, v] of Object.entries(parsed)) {
				if (typeof v === "number") state[k] = v;
			}
		}
	} catch {
		// missing or corrupt — start fresh
	}
	state[key] = ms;
	try {
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		// Atomic write: write to a temp file then rename. Prevents lost-update
		// races when multiple sessions start concurrently in the same workspace.
		const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
		writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`);
		renameSync(tempPath, path);
	} catch {
		// best-effort; if .omo/ is not writable we just skip the dedup write.
		// A failed rename may leave a .tmp file; it is harmless and will be
		// overwritten on the next successful write.
	}
}

// ---------------------------------------------------------------------------
// Hook output encoding
// ---------------------------------------------------------------------------

function encodeAdditionalContext(text: string): string {
	if (text.length === 0) return "";
	return JSON.stringify({
		hookSpecificOutput: {
			hookEventName: "SessionStart",
			additionalContext: text,
		},
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
