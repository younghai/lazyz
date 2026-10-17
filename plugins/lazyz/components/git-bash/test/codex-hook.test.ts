import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyGitBashPreToolUseReminder, applyGitBashSessionStartReset, parsePreToolUsePayload } from "../src/codex-hook.js";

describe("parsePreToolUsePayload", () => {
	it("accepts the complete PreToolUse payload and rejects an incomplete payload", () => {
		// Given: one complete and one incomplete hook payload.
		const complete = JSON.stringify({
			cwd: "/repo",
			hook_event_name: "PreToolUse",
			model: "model",
			permission_mode: "default",
			session_id: "session-1",
			tool_input: { command: "pwd" },
			tool_name: "Bash",
			tool_use_id: "call-1",
			transcript_path: null,
			turn_id: "turn-1",
		});
		const incomplete = JSON.stringify({ hook_event_name: "PreToolUse" });

		// When: both boundary values are parsed.
		const parsedComplete = parsePreToolUsePayload(complete);
		const parsedIncomplete = parsePreToolUsePayload(incomplete);

		// Then: only the complete payload crosses the boundary.
		expect(parsedComplete?.tool_name).toBe("Bash");
		expect(parsedIncomplete).toBeNull();
	});
});

describe("SessionStart reset", () => {
	it("clears the reminder on compact/clear but preserves it on startup", () => {
		const pluginDataRoot = mkdtempSync(join(tmpdir(), "lazyz-git-bash-"));
		const options = { platform: "win32", pluginDataRoot } as const;
		applyGitBashPreToolUseReminder(
			{ cwd: "/repo", hook_event_name: "PreToolUse", permission_mode: "default", session_id: "s", tool_input: {}, tool_name: "Bash", tool_use_id: "u" },
			options,
		);
		const marker = join(pluginDataRoot, "git-bash-reminder", "s.seen");
		expect(existsSync(marker)).toBe(true);
		applyGitBashSessionStartReset({ hook_event_name: "SessionStart", session_id: "s", source: "startup" }, options);
		expect(existsSync(marker)).toBe(true);
		applyGitBashSessionStartReset({ hook_event_name: "SessionStart", session_id: "s", source: "compact" }, options);
		expect(existsSync(marker)).toBe(false);
	});
});
