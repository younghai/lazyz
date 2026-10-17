import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getStatePath } from "../src/state.js";

describe("getStatePath", () => {
	it("confines session and agent identifiers to a state filename", () => {
		// Given: identifiers containing path separators and traversal tokens.
		const cwd = join("tmp", "repo");

		// When: the attempt-state path is resolved.
		const path = getStatePath(cwd, "session/../../escape", "agent\\one");

		// Then: the identifiers are represented only inside the state directory.
		expect(path).toBe(join(cwd, ".omo", "lazycodex-executor-verify", "session-..-..-escape-agent-one.json"));
	});
});
