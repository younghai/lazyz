import { describe, expect, it } from "vitest";

import { extractCommentCheckRequests } from "../src/request-extractor.js";

describe("extractCommentCheckRequests", () => {
	it("returns a Write request when a successful write result is received", () => {
		// Given: a successful machine-consumed Write tool result.
		const event = {
			toolName: "Write",
			input: { file_path: "src/value.ts", content: "const value = 1;\n" },
			content: [{ type: "text" as const, text: "Success" }],
		};

		// When: comment-check requests are extracted.
		const requests = extractCommentCheckRequests(event);

		// Then: the checker receives the normalized Write contract.
		expect(requests).toEqual([
			{
				sourceToolName: "Write",
				toolName: "Write",
				filePath: "src/value.ts",
				toolInput: { file_path: "src/value.ts", content: "const value = 1;\n" },
			},
		]);
	});
});
