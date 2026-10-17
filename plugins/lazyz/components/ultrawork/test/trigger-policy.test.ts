import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isUltraworkPrompt, readTranscriptTail } from "../src/codex-hook.js";

describe("isUltraworkPrompt", () => {
	it("routes explicit ultrawork triggers but not unrelated prompts", () => {
		// Given: minimal routing-bearing and unrelated prompt inputs.
		const triggers = ["ultrawork", "ULW"] as const;

		// When: the current prompts are classified.
		const routed = triggers.map((prompt) => isUltraworkPrompt(prompt));
		const unrelated = isUltraworkPrompt("explain the build");

		// Then: only explicit workflow triggers activate routing.
		expect(routed).toEqual([true, true]);
		expect(unrelated).toBe(false);
	});
});

describe("readTranscriptTail", () => {
	it("reads at most the bounded tail from a larger transcript", () => {
		const path = join(mkdtempSync(join(tmpdir(), "lazyz-ulw-")), "transcript.jsonl");
		writeFileSync(path, Buffer.alloc(512_000 + 17, 65));

		expect(Buffer.byteLength(readTranscriptTail(path))).toBe(512_000);
	});
});
