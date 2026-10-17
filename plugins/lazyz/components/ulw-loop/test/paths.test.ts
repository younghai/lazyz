import { describe, expect, it } from "vitest";

import { ULW_LOOP_HELP } from "../src/cli-output.js";
import { normalizeUlwLoopSessionId, ulwLoopRelativeDir } from "../src/paths.js";

describe("ULW_LOOP_HELP", () => {
	it("advertises only the LazyZ command surface", () => {
		// Given: the machine-visible ulw-loop help text.
		const help = ULW_LOOP_HELP;

		// When: command examples are inspected.
		const usesLegacyCommand = help.includes("omo ulw-loop");

		// Then: users are directed through the LazyZ executable.
		expect(help).toContain("lazyz ulw-loop status");
		expect(usesLegacyCommand).toBe(false);
	});
});

describe("normalizeUlwLoopSessionId", () => {
	it("normalizes traversal-like session identifiers into a scoped directory name", () => {
		// Given: a session identifier containing separators and traversal tokens.
		const sessionId = "../thread\\child";

		// When: the identifier and scoped directory are resolved.
		const normalized = normalizeUlwLoopSessionId(sessionId);
		const directory = ulwLoopRelativeDir({ sessionId });

		// Then: the scope contains no traversal segments.
		expect(normalized).toBe("thread-child");
		expect(directory).toBe(".omo/ulw-loop/thread-child");
	});
});
