import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkpointUlwLoop } from "../src/checkpoint.js";
import { ulwLoopDir } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import { buildQualityGateContext } from "../src/quality-gate-context.js";
import { strictPlan, validStrictGate } from "./fixtures/strict-quality-gate.js";

const roots: string[] = [];

async function committedRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "lazyz-strict-checkpoint-"));
	roots.push(root);
	await mkdir(ulwLoopDir(root), { recursive: true });
	await writePlan(root, strictPlan());
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync(
		"git",
		["-c", "user.name=LazyZ Test", "-c", "user.email=lazyz@example.invalid", "commit", "-qm", "fixture"],
		{ cwd: root },
	);
	return root;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("strict final checkpoint", () => {
	it("#given generated quality context and bound evidence #when checkpointed #then aggregate completion retains strict receipts", async () => {
		const repoRoot = await committedRepo();
		const plan = strictPlan();
		const context = await buildQualityGateContext(repoRoot, "G002-final");
		const gate = await validStrictGate(repoRoot, plan, context.binding.source);
		gate["binding"] = context.binding;

		const result = await checkpointUlwLoop(repoRoot, {
			goalId: "G002-final",
			status: "complete",
			evidence: "All implementation, review, and manual QA evidence passed.",
			codexGoalJson: JSON.stringify({ goal: { objective: plan.codexObjective, status: "complete" } }),
			qualityGateJson: JSON.stringify(gate),
		});

		expect(result.aggregateCompletion?.status).toBe("complete");
		expect(result.ledgerEntry.qualityGate).toMatchObject({
			binding: context.binding,
			criteriaCoverage: { totalCriteria: 4, passCount: 4, criterionRefs: context.criterionRefs },
			manualQa: { executions: expect.arrayContaining([expect.objectContaining({ exitCode: 0 })]) },
		});
	});
});
