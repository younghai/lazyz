import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isSameOrChildPath } from "../src/path-utils.js";

describe("isSameOrChildPath", () => {
	it("accepts a child path and rejects a sibling path", () => {
		// Given: one path below the project root and one beside it.
		const root = join("tmp", "project");

		// When: path containment is evaluated.
		const child = isSameOrChildPath(join(root, "src", "index.ts"), root);
		const sibling = isSameOrChildPath(join("tmp", "project-other", "index.ts"), root);

		// Then: only the real child is accepted.
		expect(child).toBe(true);
		expect(sibling).toBe(false);
	});
});
