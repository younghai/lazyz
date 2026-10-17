import assert from "node:assert/strict";
import test from "node:test";
import { insertCodexCompatibilityGuidance } from "../scripts/sync-skills.mjs";

test("Given a translated skill, when guidance is generated, then governed dispatch and evidence requirements are included", () => {
	// given
	const source = "---\nname: fixture\n---\n\n# Fixture\n\nUse spawn_agent(...) to delegate.\n";
	// when
	const generated = insertCodexCompatibilityGuidance(source);
	// then
	assert.match(generated, /LAZYCODEX_DISPATCH_V1/);
	assert.match(generated, /same taskId/);
	assert.match(generated, /FINAL_EVIDENCE_RECORDED/);
	assert.match(generated, /# Fixture/);
});

test("Given current dispatch guidance, when synchronized again, then it is unchanged", () => {
	// given
	const generated = insertCodexCompatibilityGuidance("# Fixture\n\nUse spawn_agent(...) to delegate.\n");
	// when
	const repeated = insertCodexCompatibilityGuidance(generated);
	// then
	assert.equal(repeated, generated);
});
