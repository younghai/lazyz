import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { filterRulesAlreadyInTranscript } from "../src/transcript-rule-filter.js";
import {
	DEFAULT_TRANSCRIPT_SEARCH_WINDOW_BYTES,
	readTranscriptRecoverySearchText,
	readTranscriptSearchWindow,
} from "../src/transcript-search.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function transcriptPath(contents: string): string {
	const directory = mkdtempSync(join(tmpdir(), "lazyz-transcript-search-"));
	tempDirectories.push(directory);
	const path = join(directory, "transcript.jsonl");
	writeFileSync(path, contents);
	return path;
}

describe("transcript search window", () => {
	it("#given a transcript larger than the search budget #when read #then bytes and output stay in the latest bounded window", () => {
		const marker = "Instructions from: /fixture/latest/AGENTS.md";
		const oldLine = `${JSON.stringify({ payload: "old".repeat(1024) })}\n`;
		const latestLine = `${JSON.stringify({ payload: marker })}\n`;
		const path = transcriptPath(oldLine.repeat(2_048) + latestLine);

		const result = readTranscriptSearchWindow(path);

		expect(result).not.toBeNull();
		expect(result?.metrics.truncated).toBe(true);
		expect(result?.metrics.bytesRead).toBeLessThanOrEqual(DEFAULT_TRANSCRIPT_SEARCH_WINDOW_BYTES);
		expect(Buffer.byteLength(result?.text ?? "", "utf8")).toBeLessThanOrEqual(
			DEFAULT_TRANSCRIPT_SEARCH_WINDOW_BYTES * 2,
		);
		expect(result?.text).toContain(marker);
		expect(result?.metrics.parsedJsonLines).toBeGreaterThan(0);
	});

	it("#given multiple compacted entries in the window #when recovery text is read #then only the latest replacement and later transcript are searched", () => {
		const path = transcriptPath(
			[
				JSON.stringify({ type: "compacted", payload: { replacement_history: ["old-routing-marker"] } }),
				JSON.stringify({ type: "response_item", payload: "between-compactions" }),
				JSON.stringify({ type: "compacted", payload: { replacement_history: ["latest-routing-marker"] } }),
				JSON.stringify({ type: "response_item", payload: "after-latest-compaction" }),
			].join("\n"),
		);

		const result = readTranscriptRecoverySearchText(path);

		expect(result?.text).toContain("latest-routing-marker");
		expect(result?.text).toContain("after-latest-compaction");
		expect(result?.text).not.toContain("old-routing-marker");
		expect(result?.text).not.toContain("between-compactions");
	});

	it("#given no compacted entry in the window #when recovery text is read #then the same bounded window is used without a second file read", () => {
		const path = transcriptPath(`${JSON.stringify({ payload: "routing-marker" })}\n`);

		const result = readTranscriptRecoverySearchText(path);

		expect(result?.text).toContain("routing-marker");
		expect(result?.metrics.readCalls).toBe(1);
	});

	it("#given a rule routing marker in the latest window #when transcript filtering runs #then the rule remains deduplicated", () => {
		const rulePath = "/fixture/latest/AGENTS.md";
		const path = transcriptPath(`${JSON.stringify({ payload: `Instructions from: ${rulePath}\nroute-body` })}\n`);
		let marked = 0;

		const pending = filterRulesAlreadyInTranscript(
			[
				{
					path: rulePath,
					realPath: rulePath,
					source: "plugin-bundled",
					distance: 0,
					isGlobal: false,
					isSingleFile: true,
					relativePath: "AGENTS.md",
					frontmatter: {},
					body: "route-body",
					contentHash: "fixture",
					matchReason: "single-file",
				},
			],
			path,
			() => {
				marked += 1;
			},
		);

		expect(pending).toEqual([]);
		expect(marked).toBe(1);
	});
});
