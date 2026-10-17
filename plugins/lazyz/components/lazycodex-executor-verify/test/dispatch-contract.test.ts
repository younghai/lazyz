import { describe, expect, it } from "vitest";

import { DISPATCH_MARKER, parseDispatchPrompt } from "../src/dispatch-contract.js";

const contract = {
	schemaVersion: 1,
	workId: "work-42",
	taskId: "task-7",
	runId: "run-1",
	role: "implementer",
	phase: "execute",
	criterionRefs: ["G001", "C001"],
	budget: { maxCalls: 4, maxSameFailure: 2 },
} as const;

describe("dispatch prompt boundary", () => {
	it("parses one versioned JSON marker with bounded budgets", () => {
		// Given: a general-purpose assignment with one canonical marker.
		const prompt = `TASK: implement the change\n${DISPATCH_MARKER}${JSON.stringify(contract)}`;

		// When: the prompt boundary parses the marker.
		const result = parseDispatchPrompt(prompt);

		// Then: the dispatch is a typed structured contract.
		expect(result).toEqual({ kind: "structured", contract });
	});

	it.each([
		`${DISPATCH_MARKER}{not-json}`,
		`${DISPATCH_MARKER}${JSON.stringify({ ...contract, schemaVersion: 2 })}`,
		`${DISPATCH_MARKER}${JSON.stringify({ ...contract, budget: { maxCalls: 6, maxSameFailure: 2 } })}`,
		`${DISPATCH_MARKER}${JSON.stringify({ ...contract, criterionRefs: ["free text"] })}`,
	])("fails closed when a marker is present but malformed", (prompt) => {
		// Given/When: marker-bearing input is parsed.
		const result = parseDispatchPrompt(prompt);

		// Then: it is rejected rather than treated as an unstructured prompt.
		expect(result.kind).toBe("malformed");
	});

	it("distinguishes a prompt with no structured marker", () => {
		expect(parseDispatchPrompt("read files only")).toEqual({ kind: "absent" });
	});

	it("accepts a canonical qualified goal and criterion reference", () => {
		const prompt = `${DISPATCH_MARKER}${JSON.stringify({ ...contract, criterionRefs: ["G001-first/C001"] })}`;
		expect(parseDispatchPrompt(prompt).kind).toBe("structured");
	});
});
