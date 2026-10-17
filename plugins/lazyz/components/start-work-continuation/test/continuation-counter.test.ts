import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_CONTINUATIONS, resolveMaxContinuations } from "../src/continuation-counter.js";

describe("resolveMaxContinuations", () => {
	it("uses the default, accepts a positive cap, and disables the cap for zero", () => {
		// Given: absent, positive, and zero environment values.
		const absent = {};
		const positive = { LAZYZ_START_WORK_MAX_CONTINUATIONS: "4" };
		const disabled = { LAZYZ_START_WORK_MAX_CONTINUATIONS: "0" };

		// When: each continuation policy is resolved.
		const defaultCap = resolveMaxContinuations(absent);
		const explicitCap = resolveMaxContinuations(positive);
		const unlimitedCap = resolveMaxContinuations(disabled);

		// Then: the resulting limits preserve the documented state machine.
		expect(defaultCap).toBe(DEFAULT_MAX_CONTINUATIONS);
		expect(explicitCap).toBe(4);
		expect(unlimitedCap).toBe(Number.POSITIVE_INFINITY);
	});
});
