import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateStrictQualityGate } from "../src/quality-gate-strict.js";
import { strictPlan, validStrictGate, writeQaFile } from "./fixtures/strict-quality-gate.js";

const roots: string[] = [];
const source = { commitSha: "a".repeat(40), treeOid: "b".repeat(64) };

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "lazyz-strict-gate-"));
	roots.push(root);
	return root;
}

function errorField(action: () => unknown): string | undefined {
	try {
		action();
	} catch (error) {
		if (error instanceof Error && "details" in error) {
			const details = error.details;
			if (typeof details === "object" && details !== null && "field" in details) return String(details.field);
		}
		throw error;
	}
	throw new Error("Expected strict quality gate rejection");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) throw new Error("Expected record fixture");
	return value;
}

function records(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value) || !value.every(isRecord)) throw new Error("Expected record array fixture");
	return value;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("validateStrictQualityGate", () => {
	it.each([
		[0, 0],
		[4, 999],
	])("#given self-asserted coverage %s/%s #when validated #then exact plan counts are required", async (totalCriteria, passCount) => {
		const root = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		gate["criteriaCoverage"] = { ...record(gate["criteriaCoverage"]), totalCriteria, passCount };
		expect(
			errorField(() => validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source })),
		).toContain("criteriaCoverage");
	});

	it.each([
		["unknown", ["G001-first/C001", "G001-first/C002", "G002-final/C001", "G999/C999"]],
		["missing", ["G001-first/C001", "G001-first/C002", "G002-final/C001"]],
		["duplicate", ["G001-first/C001", "G001-first/C002", "G002-final/C001", "G002-final/C001"]],
	])("#given an %s criterion set #when validated #then it rejects the reference", async (_case, criterionRefs) => {
		const root = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		const coverage = record(gate["criteriaCoverage"]);
		coverage["criterionRefs"] = criterionRefs;
		expect(
			errorField(() => validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source })),
		).toContain("criterionRefs");
	});

	it("#given a linked artifact outside qa #when validated #then it rejects the path", async () => {
		const root = await repo();
		const outside = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		await writeQaFile(outside, ".omo/ulw-loop/qa/outside.txt", "outside\n");
		await symlink(join(outside, ".omo/ulw-loop/qa/outside.txt"), join(root, ".omo/ulw-loop/qa/linked.txt"));
		const manualQa = record(gate["manualQa"]);
		const artifacts = records(manualQa["artifactRefs"]);
		artifacts[0] = { ...artifacts[0], path: ".omo/ulw-loop/qa/linked.txt" };
		expect(
			errorField(() => validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source })),
		).toContain("path");
	});

	it.each([
		["sha256", "0".repeat(64)],
		["source", { commitSha: "c".repeat(40), treeOid: "d".repeat(64) }],
		["finalGoalId", "G001-first"],
	])("#given mismatched %s binding #when validated #then it fails closed", async (field, value) => {
		const root = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		if (field === "sha256") {
			const manualQa = record(gate["manualQa"]);
			const artifacts = records(manualQa["artifactRefs"]);
			artifacts[0] = { ...artifacts[0], sha256: value };
		} else {
			const binding = record(gate["binding"]);
			binding[field] = value;
		}
		expect(() =>
			validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source }),
		).toThrow();
	});

	it("#given a nonzero recorded execution #when validated #then it rejects completion", async () => {
		const root = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		const manualQa = record(gate["manualQa"]);
		const executions = records(manualQa["executions"]);
		executions[0] = { ...executions[0], exitCode: 1 };
		expect(
			errorField(() => validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source })),
		).toContain("exitCode");
	});

	it("#given a valid multi-goal gate #when validated #then every scoped criterion is accepted", async () => {
		const root = await repo();
		const plan = strictPlan();
		const gate = await validStrictGate(root, plan, source);
		const result = validateStrictQualityGate(gate, { repoRoot: root, plan, finalGoal: plan.goals[1], source });
		expect(result.criteriaCoverage.criterionRefs).toEqual([
			"G001-first/C001",
			"G001-first/C002",
			"G002-final/C001",
			"G002-final/C002",
		]);
	});
});
