import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runSubagentStopHook } from "../src/codex-hook.js";
import { fingerprintUntrackedContent, readGitProvenance } from "../src/git-provenance.js";
import type { HookFileSystem, SubagentStopInput } from "../src/types.js";

const cleanupRoots: string[] = [];
const currentProvenance = { commitSha: "a".repeat(40), treeOid: "b".repeat(40) };
const nodeFileSystem: HookFileSystem = {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
};

afterEach(() => {
	for (const root of cleanupRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("final evidence provenance", () => {
	it("accepts a final-review receipt bound to the current commit and tree", () => {
		// Given: a final receipt carrying the current repository provenance.
		const cwd = createWorkspace(currentProvenance);

		// When: the final receipt is verified.
		const output = runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem, {
			readGitProvenance: () => currentProvenance,
		});

		// Then: the completion gate accepts it.
		expect(output).toBe("");
	});

	it("rejects a final-review receipt from a stale commit", () => {
		// Given: a final receipt whose commit differs from the repository.
		const cwd = createWorkspace({ ...currentProvenance, commitSha: "c".repeat(40) });

		// When: the stale receipt is verified.
		const output = runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem, {
			readGitProvenance: () => currentProvenance,
		});

		// Then: the completion gate blocks it.
		expect(JSON.parse(output).decision).toBe("block");
	});

	it("rejects a final-review receipt from a stale tree", () => {
		// Given: a final receipt whose tree differs from the repository.
		const cwd = createWorkspace({ ...currentProvenance, treeOid: "d".repeat(40) });

		// When: the stale receipt is verified.
		const output = runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem, {
			readGitProvenance: () => currentProvenance,
		});

		// Then: the completion gate blocks it.
		expect(JSON.parse(output).decision).toBe("block");
	});

	it("continues to accept ordinary non-final task evidence", () => {
		// Given: a non-empty ordinary task receipt.
		const cwd = createWorkspace("task evidence\n");

		// When: the ordinary receipt is verified without Git provenance.
		const output = runSubagentStopHook(createInput(cwd, "EVIDENCE_RECORDED"), nodeFileSystem);

		// Then: pre-commit task evidence remains valid.
		expect(output).toBe("");
	});

	it("binds a final receipt to uncommitted material worktree changes", () => {
		// Given: a real repository with ignored evidence and a clean final receipt.
		const cwd = createGitWorkspace();
		const clean = readGitProvenance(cwd);
		expect(clean).not.toBeNull();
		writeFileSync(join(cwd, ".omo", "evidence", "receipt.json"), JSON.stringify(clean));
		expect(runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem)).toBe("");

		// When: tracked content changes without moving HEAD.
		writeFileSync(join(cwd, "tracked.txt"), "changed\n");
		const staleOutput = runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem);

		// Then: the clean receipt is stale, while the current dirty fingerprint is accepted.
		expect(JSON.parse(staleOutput).decision).toBe("block");
		const dirty = readGitProvenance(cwd);
		expect(dirty?.commitSha).toBe(clean?.commitSha);
		expect(dirty?.treeOid).not.toBe(clean?.treeOid);
		writeFileSync(join(cwd, ".omo", "evidence", "receipt.json"), JSON.stringify(dirty));
		expect(runSubagentStopHook(createInput(cwd, "FINAL_EVIDENCE_RECORDED"), nodeFileSystem)).toBe("");
	});

	it("fingerprints untracked content and mode without including ignored evidence", () => {
		const cwd = createGitWorkspace();
		const path = join(cwd, "untracked.txt");
		writeFileSync(path, "first\n", { mode: 0o644 });
		const first = readGitProvenance(cwd);
		writeFileSync(path, "second\n");
		const contentChanged = readGitProvenance(cwd);
		chmodSync(path, 0o755);
		const modeChanged = readGitProvenance(cwd);
		writeFileSync(join(cwd, ".omo", "evidence", "receipt.json"), "ignored change\n");
		const ignoredChanged = readGitProvenance(cwd);

		expect(contentChanged?.treeOid).not.toBe(first?.treeOid);
		expect(modeChanged?.treeOid).not.toBe(contentChanged?.treeOid);
		expect(ignoredChanged).toEqual(modeChanged);
	});

	it("fingerprints an untracked FIFO without reading from it", (context) => {
		if (process.platform === "win32") context.skip();
		const cwd = createGitWorkspace();
		const path = join(cwd, "untracked.fifo");
		execFileSync("mkfifo", [path]);
		expect(fingerprintUntrackedContent(path, lstatSync(path))).toBe("non-regular:fifo");
	});
});

function createWorkspace(receipt: object | string): string {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-final-receipt-"));
	cleanupRoots.push(cwd);
	const evidenceRoot = join(cwd, ".omo", "evidence");
	mkdirSync(evidenceRoot, { recursive: true });
	writeFileSync(join(evidenceRoot, "receipt.json"), typeof receipt === "string" ? receipt : JSON.stringify(receipt));
	return cwd;
}

function createGitWorkspace(): string {
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-final-receipt-git-"));
	cleanupRoots.push(cwd);
	execFileSync("git", ["init", "--quiet"], { cwd });
	execFileSync("git", ["config", "user.email", "qa@example.invalid"], { cwd });
	execFileSync("git", ["config", "user.name", "QA"], { cwd });
	writeFileSync(join(cwd, ".gitignore"), ".omo/\n");
	writeFileSync(join(cwd, "tracked.txt"), "initial\n");
	execFileSync("git", ["add", ".gitignore", "tracked.txt"], { cwd });
	execFileSync("git", ["commit", "--quiet", "-m", "initial"], { cwd });
	mkdirSync(join(cwd, ".omo", "evidence"), { recursive: true });
	return cwd;
}

function createInput(cwd: string, marker: "EVIDENCE_RECORDED" | "FINAL_EVIDENCE_RECORDED"): SubagentStopInput {
	return {
		hook_event_name: "SubagentStop",
		agent_type: "lazycodex-executor",
		agent_id: "agent-1",
		session_id: "session-1",
		cwd,
		transcript_path: join(cwd, "transcript.jsonl"),
		model: "model",
		permission_mode: "default",
		stop_hook_active: false,
		last_assistant_message: `${marker}: .omo/evidence/receipt.json`,
	};
}
