import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
	type PlanChecklist,
	getPlanChecklist,
	readInProgressStartWork,
	readInProgressUlwLoop,
} from "../src/work-status.js";
import { runSessionStartResume, type SessionStartInput } from "../src/hook.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(() => {
	tmpRoot = mkdtempSync(join(tmpdir(), "lazyz-work-status-"));
});

afterAll(() => {
	rmSync(tmpRoot, { recursive: true, force: true });
});

function writeBoulder(dir: string, works: object): void {
	mkdirSync(join(dir, ".omo"), { recursive: true });
	writeFileSync(join(dir, ".omo", "boulder.json"), JSON.stringify({ schema_version: 2, active_work_id: "w1", works }));
}

function writePlan(dir: string, slug: string, body: string): string {
	mkdirSync(join(dir, ".omo", "plans"), { recursive: true });
	const path = join(dir, ".omo", "plans", `${slug}.md`);
	writeFileSync(path, body);
	return path;
}

function sessionStartInput(cwd: string, source: string = "startup"): SessionStartInput {
	return { session_id: "s1", cwd, hook_event_name: "SessionStart", source };
}

const PLAN_WITH_CHECKBOXES = `# rate-limit - Work Plan

## TL;DR (For humans)
Add a 5/min-per-IP rate-limit to /login.

## Todos
- [x] Add Redis client
- [x] Add rate-limit middleware
- [ ] Wire middleware into /login
- [ ] Add tests
- [ ] Manual QA: curl 6 times, 6th must 429

## Final Verification Wave
- [ ] F1 plan compliance
- [ ] F2 code quality review
`;

// ---------------------------------------------------------------------------
// Plan checklist parser
// ---------------------------------------------------------------------------

describe("getPlanChecklist", () => {
	it("counts column-0 checkboxes under ## Todos and ## Final Verification Wave", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-"));
		const planPath = writePlan(dir, "p", PLAN_WITH_CHECKBOXES);
		const got: PlanChecklist = getPlanChecklist(planPath);
		expect(got.completed).toBe(2);
		expect(got.remaining).toBe(5);
		expect(got.total).toBe(7);
		expect(got.nextTaskLabel).toContain("Wire middleware");
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns empty checklist for a missing file", () => {
		const got = getPlanChecklist(join(tmpRoot, "does-not-exist.md"));
		expect(got).toEqual({ completed: 0, remaining: 0, total: 0, nextTaskLabel: null });
	});

	it("does NOT count indented sub-checkboxes", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-indent-"));
		const body = `# p\n\n## Todos\n- [x] Top level\n  - [ ] indented sub\n  - [x] another sub\n- [ ] Top level 2\n`;
		const planPath = writePlan(dir, "p", body);
		const got = getPlanChecklist(planPath);
		expect(got.total).toBe(2);
		expect(got.completed).toBe(1);
		expect(got.remaining).toBe(1);
		rmSync(dir, { recursive: true, force: true });
	});

	it("accepts the legacy 'TODOs' heading as well as 'Todos'", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-legacy-"));
		const body = `# p\n\n## TODOs\n- [x] one\n- [ ] two\n`;
		const planPath = writePlan(dir, "p", body);
		const got = getPlanChecklist(planPath);
		expect(got.total).toBe(2);
		rmSync(dir, { recursive: true, force: true });
	});

	it("treats checkboxes outside counted sections as progress when no counted heading exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "plan-nohead-"));
		const body = `# p\n\n- [x] orphan done\n- [ ] orphan todo\n`;
		const planPath = writePlan(dir, "p", body);
		const got = getPlanChecklist(planPath);
		// No counted heading → all top-level checkboxes count.
		expect(got.total).toBe(2);
		rmSync(dir, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// readInProgressStartWork
// ---------------------------------------------------------------------------

describe("readInProgressStartWork", () => {
	it("returns the active work with a derived checklist", () => {
		const dir = mkdtempSync(join(tmpdir(), "sw-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "rate-limit", PLAN_WITH_CHECKBOXES);

		const got = readInProgressStartWork(dir);
		expect(got).not.toBeNull();
		expect(got?.kind).toBe("start-work");
		expect(got?.planName).toBe("rate-limit");
		expect(got?.status).toBe("active");
		expect(got?.checklist.total).toBe(7);
		expect(got?.checklist.remaining).toBe(5);
		expect(got?.degraded).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});

	it("prefers the most recently updated active work", () => {
		const dir = mkdtempSync(join(tmpdir(), "sw-recent-"));
		writeBoulder(dir, {
			old: {
				work_id: "old",
				active_plan: ".omo/plans/old.md",
				plan_name: "old",
				session_ids: ["codex:s1"],
				status: "active",
				updated_at: "2024-01-01T00:00:00.000Z",
			},
			new: {
				work_id: "new",
				active_plan: ".omo/plans/new.md",
				plan_name: "new",
				session_ids: ["codex:s1"],
				status: "active",
				updated_at: "2024-06-01T00:00:00.000Z",
			},
		});
		writePlan(dir, "old", `# old\n\n## Todos\n- [ ] a\n`);
		writePlan(dir, "new", `# new\n\n## Todos\n- [ ] b\n`);

		const got = readInProgressStartWork(dir);
		expect(got?.planName).toBe("new");
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when no work is active/paused (all completed)", () => {
		const dir = mkdtempSync(join(tmpdir(), "sw-done-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "completed",
			},
		});
		expect(readInProgressStartWork(dir)).toBeNull();
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when boulder.json is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "sw-none-"));
		expect(readInProgressStartWork(dir)).toBeNull();
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when the plan has no remaining checkboxes", () => {
		const dir = mkdtempSync(join(tmpdir(), "sw-emptyplan-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/empty.md",
				plan_name: "empty",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "empty", `# empty\n\n## Todos\n- [x] only one, done\n`);
		expect(readInProgressStartWork(dir)).toBeNull();
		rmSync(dir, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// readInProgressUlwLoop
// ---------------------------------------------------------------------------

describe("readInProgressUlwLoop", () => {
	it("aggregates criteria across goals", () => {
		const dir = mkdtempSync(join(tmpdir(), "ulw-"));
		mkdirSync(join(dir, ".omo", "ulw-loop"), { recursive: true });
		writeFileSync(
			join(dir, ".omo", "ulw-loop", "goals.json"),
			JSON.stringify({
				version: 1,
				goals: [
					{
						id: "g1",
						label: "Goal 1",
						status: "in_progress",
						successCriteria: [
							{ id: "c1", status: "pass" },
							{ id: "c2", status: "pending" },
						],
					},
					{
						id: "g2",
						label: "Goal 2",
						status: "pending",
						successCriteria: [{ id: "c3", status: "pending" }],
					},
				],
			}),
		);

		const got = readInProgressUlwLoop(dir);
		expect(got).not.toBeNull();
		expect(got?.kind).toBe("ulw-loop");
		expect(got?.goals.length).toBe(2);
		expect(got?.totalCriteria).toBe(3);
		expect(got?.passedCriteria).toBe(1);
		expect(got?.degraded).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when goals.json is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "ulw-none-"));
		expect(readInProgressUlwLoop(dir)).toBeNull();
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when every goal is complete", () => {
		const dir = mkdtempSync(join(tmpdir(), "ulw-done-"));
		mkdirSync(join(dir, ".omo", "ulw-loop"), { recursive: true });
		writeFileSync(
			join(dir, ".omo", "ulw-loop", "goals.json"),
			JSON.stringify({
				version: 1,
				goals: [{ id: "g1", label: "G", status: "complete", successCriteria: [{ id: "c1", status: "pass" }] }],
			}),
		);
		expect(readInProgressUlwLoop(dir)).toBeNull();
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns a degraded snapshot when goals.json is unparseable", () => {
		const dir = mkdtempSync(join(tmpdir(), "ulw-broken-"));
		mkdirSync(join(dir, ".omo", "ulw-loop"), { recursive: true });
		writeFileSync(join(dir, ".omo", "ulw-loop", "goals.json"), "{not valid json");
		const got = readInProgressUlwLoop(dir);
		expect(got).not.toBeNull();
		expect(got?.degraded).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// runSessionStartResume — T4 work resume + dedup
// ---------------------------------------------------------------------------

describe("runSessionStartResume — T4 work resume", () => {
	it("prompts once, then suppresses the same work on the next call within a day", () => {
		const dir = mkdtempSync(join(tmpdir(), "resume-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "rate-limit", PLAN_WITH_CHECKBOXES);

		const first = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		expect(first).toContain("rate-limit");
		expect(first).toContain("2/7");

		// Same work, 1 hour later — must be suppressed.
		const second = runSessionStartResume(sessionStartInput(dir), { now: new Date(60 * 60 * 1000) });
		expect(second).toBe("");

		rmSync(dir, { recursive: true, force: true });
	});

	it("emits nothing when there is no in-progress work and no other concern", () => {
		const dir = mkdtempSync(join(tmpdir(), "resume-empty-"));
		// No .omo/, no AGENTS.md absence concern in this assertion (T5 tested below).
		// Note: T5 will fire because AGENTS.md is missing; we suppress it by creating one.
		writeFileSync(join(dir, "AGENTS.md"), "# project memory\n");
		expect(runSessionStartResume(sessionStartInput(dir))).toBe("");
		rmSync(dir, { recursive: true, force: true });
	});

	it("re-prompts after more than a day for the same work", () => {
		const dir = mkdtempSync(join(tmpdir(), "resume-nextday-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "rate-limit", PLAN_WITH_CHECKBOXES);

		const first = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		expect(first.length).toBeGreaterThan(0);

		// 25 hours later — past the 24h dedup window, must re-prompt.
		const later = runSessionStartResume(sessionStartInput(dir), { now: new Date(25 * 60 * 60 * 1000) });
		expect(later.length).toBeGreaterThan(0);

		rmSync(dir, { recursive: true, force: true });
	});

	it("emits valid hookSpecificOutput JSON with additionalContext", () => {
		const dir = mkdtempSync(join(tmpdir(), "resume-json-"));
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "rate-limit", PLAN_WITH_CHECKBOXES);

		const out = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		const parsed = JSON.parse(out);
		expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(typeof parsed.hookSpecificOutput.additionalContext).toBe("string");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("rate-limit");

		rmSync(dir, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// runSessionStartResume — T5 init-deep suggestion
// ---------------------------------------------------------------------------

describe("runSessionStartResume — T5 init-deep suggestion", () => {
	it("suggests init-deep once when AGENTS.md is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "init-"));
		// No AGENTS.md, no .omo/ work → only T5 should fire.
		const first = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		expect(first).toContain("init-deep");
		expect(first).toContain("AGENTS.md");

		// Second call same day — suppressed.
		const second = runSessionStartResume(sessionStartInput(dir), { now: new Date(60 * 60 * 1000) });
		expect(second).toBe("");

		rmSync(dir, { recursive: true, force: true });
	});

	it("does NOT suggest init-deep when AGENTS.md exists", () => {
		const dir = mkdtempSync(join(tmpdir(), "init-has-"));
		writeFileSync(join(dir, "AGENTS.md"), "# project memory\n");
		const out = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		expect(out).toBe("");
		rmSync(dir, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// runSessionStartResume — T6 build-missing warning
// ---------------------------------------------------------------------------

describe("runSessionStartResume — T6 build-missing warning", () => {
	it("warns when a local MCP server dist/ is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "build-miss-"));
		writeFileSync(join(dir, "AGENTS.md"), "# memory\n"); // suppress T5
		// A fake plugin root with NO dist files.
		const fakePluginRoot = mkdtempSync(join(tmpdir(), "plugin-root-"));

		const out = runSessionStartResume(sessionStartInput(dir), {
			now: new Date(0),
			pluginRoot: fakePluginRoot,
		});
		expect(out).toContain("빌드되지 않았습니다");
		expect(out).toContain("codegraph");

		rmSync(dir, { recursive: true, force: true });
		rmSync(fakePluginRoot, { recursive: true, force: true });
	});

	it("does NOT warn when all local MCP dist files exist", () => {
		const dir = mkdtempSync(join(tmpdir(), "build-ok-"));
		writeFileSync(join(dir, "AGENTS.md"), "# memory\n");
		const fakePluginRoot = mkdtempSync(join(tmpdir(), "plugin-root-ok-"));
		// Create all three dist files so nothing is "missing".
		mkdirSync(join(fakePluginRoot, "components/codegraph/dist"), { recursive: true });
		writeFileSync(join(fakePluginRoot, "components/codegraph/dist/serve.js"), "// built\n");
		mkdirSync(join(fakePluginRoot, "components/git-bash/dist"), { recursive: true });
		writeFileSync(join(fakePluginRoot, "components/git-bash/dist/cli.js"), "// built\n");
		mkdirSync(join(fakePluginRoot, "components/lsp/dist"), { recursive: true });
		writeFileSync(join(fakePluginRoot, "components/lsp/dist/cli.js"), "// built\n");

		const out = runSessionStartResume(sessionStartInput(dir), {
			now: new Date(0),
			pluginRoot: fakePluginRoot,
		});
		expect(out).toBe("");

		rmSync(dir, { recursive: true, force: true });
		rmSync(fakePluginRoot, { recursive: true, force: true });
	});

	it("skips the build-missing check when pluginRoot is not provided", () => {
		const dir = mkdtempSync(join(tmpdir(), "build-noroot-"));
		writeFileSync(join(dir, "AGENTS.md"), "# memory\n");
		// No pluginRoot → T6 skipped, T5 satisfied → empty output.
		const out = runSessionStartResume(sessionStartInput(dir), { now: new Date(0) });
		expect(out).toBe("");
		rmSync(dir, { recursive: true, force: true });
	});

	it("dedups the build-missing warning within a day", () => {
		const dir = mkdtempSync(join(tmpdir(), "build-dedup-"));
		writeFileSync(join(dir, "AGENTS.md"), "# memory\n");
		const fakePluginRoot = mkdtempSync(join(tmpdir(), "plugin-root-dedup-"));

		const first = runSessionStartResume(sessionStartInput(dir), {
			now: new Date(0),
			pluginRoot: fakePluginRoot,
		});
		expect(first).toContain("빌드되지 않았습니다");

		const second = runSessionStartResume(sessionStartInput(dir), {
			now: new Date(60 * 60 * 1000),
			pluginRoot: fakePluginRoot,
		});
		expect(second).toBe("");

		rmSync(dir, { recursive: true, force: true });
		rmSync(fakePluginRoot, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// Combined: T4 + T5 + T6 can fire together
// ---------------------------------------------------------------------------

describe("runSessionStartResume — combined output", () => {
	it("joins multiple concerns into one additionalContext", () => {
		const dir = mkdtempSync(join(tmpdir(), "combined-"));
		// No AGENTS.md → T5 fires.
		writeBoulder(dir, {
			w1: {
				work_id: "w1",
				active_plan: ".omo/plans/rate-limit.md",
				plan_name: "rate-limit",
				session_ids: ["codex:s1"],
				status: "active",
			},
		});
		writePlan(dir, "rate-limit", PLAN_WITH_CHECKBOXES); // T4 fires.
		const fakePluginRoot = mkdtempSync(join(tmpdir(), "plugin-root-combined-")); // T6 fires.

		const out = runSessionStartResume(sessionStartInput(dir), {
			now: new Date(0),
			pluginRoot: fakePluginRoot,
		});
		expect(out).toContain("rate-limit"); // T4
		expect(out).toContain("init-deep"); // T5
		expect(out).toContain("빌드되지 않았습니다"); // T6

		const parsed = JSON.parse(out);
		expect(parsed.hookSpecificOutput.additionalContext).toContain("rate-limit");
		expect(parsed.hookSpecificOutput.additionalContext).toContain("init-deep");

		rmSync(dir, { recursive: true, force: true });
		rmSync(fakePluginRoot, { recursive: true, force: true });
	});
});

// ---------------------------------------------------------------------------
// Sanity: the test fixture helper itself works
// ---------------------------------------------------------------------------

describe("fixtures", () => {
	it("tmpRoot is a real directory", () => {
		expect(existsSync(tmpRoot)).toBe(true);
	});
});
