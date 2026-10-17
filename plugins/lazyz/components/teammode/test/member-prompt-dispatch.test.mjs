import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "team.mjs");

function runTeam(cwd, ...args) {
	return spawnSync(process.execPath, [script, ...args], {
		cwd,
		encoding: "utf8",
		timeout: 10_000,
	});
}

function createTeam(cwd) {
	const init = runTeam(cwd, "init", "--name", "Dispatch", "--session-name", "Regression", "--session", "dispatch-team");
	assert.equal(init.status, 0, init.stderr);
	const add = runTeam(
		cwd,
		"add-member",
		"--team",
		"dispatch-team",
		"--id",
		"A",
		"--name",
		"producer",
		"--focus",
		"member prompt generation",
		"--lens",
		"ownership",
		"--deliverable",
		"a structured dispatch prompt",
	);
	assert.equal(add.status, 0, add.stderr);
	return add;
}

function parseDispatch(stdout) {
	const lines = stdout.split("\n").filter((line) => line.startsWith("LAZYCODEX_DISPATCH_V1: "));
	assert.equal(lines.length, 1);
	return JSON.parse(lines[0].slice("LAZYCODEX_DISPATCH_V1: ".length));
}

test("#given an existing team member #when member-prompt runs with legacy arguments #then the CLI still returns a prompt", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-member-prompt-baseline-"));
	try {
		createTeam(cwd);

		const result = runTeam(cwd, "member-prompt", "--team", "dispatch-team", "--id", "A");

		assert.equal(result.status, 0, result.stderr);
		assert.ok(result.stdout.trim().length > 0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("#given an existing team member #when member-prompt runs twice #then dispatch identity is stable and each run identity is fresh", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-member-prompt-identity-"));
	try {
		createTeam(cwd);

		const first = runTeam(cwd, "member-prompt", "--team", "dispatch-team", "--id", "A");
		const second = runTeam(cwd, "member-prompt", "--team", "dispatch-team", "--id", "A");

		assert.equal(first.status, 0, first.stderr);
		assert.equal(second.status, 0, second.stderr);
		const firstDispatch = parseDispatch(first.stdout);
		const secondDispatch = parseDispatch(second.stdout);
		assert.equal(firstDispatch.schemaVersion, 1);
		assert.equal(firstDispatch.workId, secondDispatch.workId);
		assert.equal(firstDispatch.taskId, secondDispatch.taskId);
		assert.notEqual(firstDispatch.runId, secondDispatch.runId);
		assert.equal(firstDispatch.role, "implementer");
		assert.equal(firstDispatch.phase, "execute");
		assert.deepEqual(firstDispatch.criterionRefs, ["C001"]);
		assert.deepEqual(firstDispatch.budget, { maxCalls: 5, maxSameFailure: 3 });
		assert.match(first.stdout, /EVIDENCE_RECORDED: \.omo\/evidence\//);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("#given a final reviewer dispatch #when member-prompt receives bounded overrides #then the contract and final receipt marker reflect them", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-member-prompt-final-"));
	try {
		createTeam(cwd);

		const result = runTeam(
			cwd,
			"member-prompt",
			"--team",
			"dispatch-team",
			"--id",
			"A",
			"--role",
			"reviewer",
			"--phase",
			"final",
			"--max-calls",
			"2",
			"--max-same-failure",
			"1",
		);

		assert.equal(result.status, 0, result.stderr);
		const dispatch = parseDispatch(result.stdout);
		assert.equal(dispatch.role, "reviewer");
		assert.equal(dispatch.phase, "final");
		assert.deepEqual(dispatch.budget, { maxCalls: 2, maxSameFailure: 1 });
		assert.match(result.stdout, /FINAL_EVIDENCE_RECORDED: \.omo\/evidence\//);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("#given add-member emits an immediately usable prompt #when the member is added #then the prompt carries one structured dispatch marker", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-add-member-dispatch-"));
	try {
		const result = createTeam(cwd);

		const dispatch = parseDispatch(result.stdout);
		assert.equal(dispatch.role, "implementer");
		assert.equal(dispatch.phase, "execute");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("#given a dispatch budget above the hard cap #when member-prompt validates it #then the CLI refuses to emit a prompt", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-member-prompt-budget-"));
	try {
		createTeam(cwd);

		const result = runTeam(
			cwd,
			"member-prompt",
			"--team",
			"dispatch-team",
			"--id",
			"A",
			"--max-calls",
			"6",
		);

		assert.notEqual(result.status, 0);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /max-calls/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("#given a dispatch budget above the hard cap #when add-member validates it #then team state is not partially mutated", () => {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-teammode-add-member-budget-"));
	try {
		const init = runTeam(cwd, "init", "--name", "Dispatch", "--session-name", "Regression", "--session", "dispatch-team");
		assert.equal(init.status, 0, init.stderr);

		const result = runTeam(
			cwd,
			"add-member",
			"--team",
			"dispatch-team",
			"--id",
			"A",
			"--focus",
			"member prompt generation",
			"--lens",
			"ownership",
			"--deliverable",
			"a structured dispatch prompt",
			"--max-calls",
			"6",
		);

		const team = JSON.parse(readFileSync(join(cwd, ".omo", "teams", "dispatch-team", "team.json"), "utf8"));
		assert.notEqual(result.status, 0);
		assert.deepEqual(team.members, []);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
