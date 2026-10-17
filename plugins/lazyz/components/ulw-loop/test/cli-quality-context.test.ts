import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { ulwLoopDir } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import { strictPlan, validStrictGate } from "./fixtures/strict-quality-gate.js";

const execFileAsync = promisify(execFile);
const componentRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(componentRoot, "dist", "cli.js");
const roots: string[] = [];

async function runCli(repoRoot: string, args: readonly string[]): Promise<Record<string, unknown>> {
	const result = await execFileAsync(process.execPath, [cliPath, "ulw-loop", ...args], {
		cwd: repoRoot,
		env: { ...process.env, OMO_ULW_LOOP_SESSION_ID: "", CODEX_SESSION_ID: "", CODEX_THREAD_ID: "" },
	});
	return JSON.parse(result.stdout);
}

async function committedRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "lazyz-quality-context-cli-"));
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

describe("quality-context CLI workflow", () => {
	it("#given a final plan #when context feeds checkpoint #then the built CLI completes with bound evidence", async () => {
		const repoRoot = await committedRepo();
		const plan = strictPlan();
		const context = await runCli(repoRoot, ["quality-context", "--goal-id", "G002-final", "--json"]);
		const binding = context["binding"];
		if (typeof binding !== "object" || binding === null || !("source" in binding)) throw new Error("missing binding");
		const source = binding.source;
		if (
			typeof source !== "object" ||
			source === null ||
			!("commitSha" in source) ||
			!("treeOid" in source) ||
			typeof source.commitSha !== "string" ||
			typeof source.treeOid !== "string"
		) {
			throw new Error("missing source binding");
		}
		const gate = await validStrictGate(repoRoot, plan, { commitSha: source.commitSha, treeOid: source.treeOid });
		gate["binding"] = binding;
		const checkpoint = await runCli(repoRoot, [
			"checkpoint",
			"--goal-id",
			"G002-final",
			"--status",
			"complete",
			"--evidence",
			"Built CLI context and strict checkpoint passed.",
			"--codex-goal-json",
			JSON.stringify({ goal: { objective: plan.codexObjective, status: "complete" } }),
			"--quality-gate-json",
			JSON.stringify(gate),
			"--json",
		]);

		expect(context).toMatchObject({ ok: true, totalCriteria: 4, qaRoot: ".omo/ulw-loop/qa" });
		expect(checkpoint).toMatchObject({
			ok: true,
			goal: { id: "G002-final", status: "complete" },
			aggregateCompletion: { status: "complete" },
		});
	});
});
