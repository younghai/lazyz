import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { inspectGitProvenance, readGitProvenance } from "../src/git-provenance.js";

it("rejects oversized untracked input instead of reading it for final evidence", () => {
	// given
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-provenance-budget-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"commit",
				"--allow-empty",
				"-qm",
				"fixture",
			],
			{ cwd },
		);
		writeFileSync(join(cwd, "large.bin"), Buffer.alloc(9 * 1024 * 1024));
		// when
		const result = inspectGitProvenance(cwd);
		// then
		expect(result.provenance).toBeNull();
		expect(result.metrics.status).toBe("budget-exceeded");
		expect(result.metrics.untrackedBytes).toBe(0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

it.each([
	"evidence",
	"ulw-loop",
	"lazycodex-executor-verify",
])("keeps generated %s out of source provenance", (directory) => {
	// given
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-provenance-state-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"commit",
				"--allow-empty",
				"-qm",
				"fixture",
			],
			{ cwd },
		);
		const before = readGitProvenance(cwd);
		mkdirSync(join(cwd, ".omo", directory), { recursive: true });
		writeFileSync(join(cwd, ".omo", directory, "receipt.json"), "generated evidence");
		// when
		const afterEvidence = readGitProvenance(cwd);
		// then
		expect(afterEvidence).toEqual(before);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

it("includes project configuration and reports actual reads", () => {
	// given
	const cwd = mkdtempSync(join(tmpdir(), "lazyz-provenance-config-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"commit",
				"--allow-empty",
				"-qm",
				"fixture",
			],
			{ cwd },
		);
		const before = readGitProvenance(cwd);
		mkdirSync(join(cwd, ".omo"));
		writeFileSync(join(cwd, ".omo", "config.jsonc"), "{}");
		// when
		const result = inspectGitProvenance(cwd);
		// then
		expect(result.provenance?.treeOid).not.toEqual(before?.treeOid);
		expect(result.metrics.gitCalls).toBe(4);
		expect(result.metrics.untrackedBytes).toBe(2);
		expect(result.metrics.untrackedFiles).toBe(1);
		expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
		expect(result.metrics.status).toBe("complete");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
