import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitProvenance } from "../../../lazycodex-executor-verify/dist/git-provenance.js";
import { deriveQualityGatePlanFingerprint } from "../../src/quality-gate-binding.js";
import type { UlwLoopItem, UlwLoopPlan, UlwLoopSuccessCriterion } from "../../src/types.js";

export const NOW = "2026-09-12T00:00:00.000Z";

function criterion(id: string): UlwLoopSuccessCriterion {
	return {
		id,
		scenario: `${id} observable scenario`,
		userModel: id === "C002" ? "edge" : "happy",
		expectedEvidence: `${id} artifact-backed proof`,
		capturedEvidence: `${id} passed`,
		status: "pass",
	};
}

function goal(id: string, status: UlwLoopItem["status"], objective: string): UlwLoopItem {
	return {
		id,
		title: `${id} title`,
		objective,
		status,
		successCriteria: [criterion("C001"), criterion("C002")],
		attempt: 1,
		createdAt: NOW,
		updatedAt: NOW,
	};
}

export function strictPlan(finalStatus: UlwLoopItem["status"] = "in_progress"): UlwLoopPlan {
	return {
		version: 1,
		createdAt: NOW,
		updatedAt: NOW,
		briefPath: ".omo/ulw-loop/brief.md",
		goalsPath: ".omo/ulw-loop/goals.json",
		ledgerPath: ".omo/ulw-loop/ledger.jsonl",
		codexGoalMode: "aggregate",
		codexObjective:
			"Complete the durable ulw-loop plan in .omo/ulw-loop/goals.json, including later accepted/appended stories, under the original brief constraints; use .omo/ulw-loop/ledger.jsonl as the audit trail.",
		activeGoalId: "G002-final",
		goals: [
			goal("G001-first", "complete", "Complete first goal"),
			goal("G002-final", finalStatus, "Complete final goal"),
		],
	};
}

export function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export async function writeQaFile(repoRoot: string, relativePath: string, content: string): Promise<void> {
	await mkdir(join(repoRoot, ".omo", "ulw-loop", "qa"), { recursive: true });
	await writeFile(join(repoRoot, relativePath), content, "utf8");
}

export async function validStrictGate(
	repoRoot: string,
	plan: UlwLoopPlan,
	source: GitProvenance,
): Promise<Record<string, unknown>> {
	const qaRoot = ".omo/ulw-loop/qa";
	const codeReport = "code review approved\n";
	const gateReport = "gate review approved\n";
	await writeQaFile(repoRoot, `${qaRoot}/code-review.md`, codeReport);
	await writeQaFile(repoRoot, `${qaRoot}/gate-review.md`, gateReport);
	const refs = plan.goals.flatMap((item) =>
		item.successCriteria.map((itemCriterion) => `${item.id}/${itemCriterion.id}`),
	);
	const artifacts = [];
	const executions = [];
	const surfaceEvidence = [];
	for (const [index, criterionRef] of refs.entries()) {
		const artifactId = `artifact-${index + 1}`;
		const executionId = `run-${index + 1}`;
		const path = `${qaRoot}/${artifactId}.txt`;
		const content = `${criterionRef} passed\n`;
		await writeQaFile(repoRoot, path, content);
		artifacts.push({
			id: artifactId,
			kind: "cli-transcript",
			description: `${criterionRef} proof`,
			path,
			sha256: sha256(content),
		});
		executions.push({
			id: executionId,
			command: `verify ${criterionRef}`,
			exitCode: 0,
			criterionRefs: [criterionRef],
			artifactRefs: [artifactId],
		});
		surfaceEvidence.push({
			id: `surface-${index + 1}`,
			criterionRef,
			surface: "cli",
			invocation: `verify ${criterionRef}`,
			executionRef: executionId,
			verdict: "passed",
			artifactRefs: [artifactId],
		});
	}
	return {
		binding: {
			schemaVersion: 2,
			planFingerprint: deriveQualityGatePlanFingerprint(plan),
			finalGoalId: "G002-final",
			finalGoalObjective: "Complete final goal",
			source,
		},
		codeReview: {
			by: "lazycodex-code-reviewer",
			recommendation: "APPROVE",
			codeQualityStatus: "CLEAR",
			reportPath: `${qaRoot}/code-review.md`,
			reportSha256: sha256(codeReport),
			evidence: "Diff and tests reviewed.",
			blockers: [],
		},
		manualQa: {
			by: "lazycodex-qa-executor",
			status: "passed",
			evidence: "Executed all criterion scenarios.",
			surfaceEvidence,
			adversarialCases: [
				{
					id: "adversarial-boundary",
					criterionRef: refs[1],
					scenario: "boundary input",
					expectedBehavior: "fails closed",
					executionRef: "run-2",
					verdict: "passed",
					artifactRefs: ["artifact-2"],
				},
			],
			artifactRefs: artifacts,
			executions,
		},
		gateReview: {
			by: "lazycodex-gate-reviewer",
			recommendation: "APPROVE",
			reportPath: `${qaRoot}/gate-review.md`,
			reportSha256: sha256(gateReport),
			evidence: "Bindings and artifacts rechecked.",
			blockers: [],
		},
		iteration: {
			fullRerun: true,
			status: "passed",
			rerunCommands: executions.map((record) => record.command),
			evidence: "All recorded commands passed.",
		},
		criteriaCoverage: {
			totalCriteria: refs.length,
			passCount: refs.length,
			criterionRefs: refs,
			originalIntent: "Ship the requested plan.",
			desiredOutcome: "Every plan criterion has current proof.",
			userOutcomeReview: "The final result matches the requested outcome.",
			adversarialClassesCovered: ["boundary"],
		},
	};
}
