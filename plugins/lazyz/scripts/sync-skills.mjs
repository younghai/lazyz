#!/usr/bin/env node
import { existsSync as existsSyncSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isCliEntry } from "./entry-guard.mjs";
import { sharedSkillsRootPath } from "@oh-my-opencode/shared-skills";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sharedSkillsRoot = sharedSkillsRootPath();
const skillsRoot = join(root, "skills");
const sourceTestFilePattern = /\.test\.ts$/;
const ignoredSkillSourceDirNames = new Set([".mypy_cache", ".omo", ".pytest_cache", ".ruff_cache", "__pycache__"]);
const ignoredSkillSourceFileNames = new Set([".gitignore", ".npmignore", "pyrightconfig.json"]);
const skillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
	["ultrawork", "components/ultrawork/skills/ultrawork"],
];
const componentSkillNames = new Set(skillSources.map(([name]) => name));
const codexHiddenSharedSkillNames = new Set(["ultraresearch"]);
const skillDisplayPrefix = "(LazyZ) ";

function shouldCopySkillSource(source) {
	const normalized = source.replaceAll("\\", "/");
	const segments = normalized.split("/");
	const name = segments.at(-1) ?? "";
	if (segments.some((segment) => ignoredSkillSourceDirNames.has(segment))) return false;
	if (ignoredSkillSourceFileNames.has(name)) return false;
	if (sourceTestFilePattern.test(name) || name.endsWith(".pyc")) return false;
	const scriptsIndex = segments.lastIndexOf("scripts");
	return scriptsIndex === -1 || segments[scriptsIndex + 1] !== "tests";
}

const opencodeOnlyOrchestrationPattern = /\b(?:call_omo_agent|background_output|team_[a-z_]+|task)\s*\(/;

export const codexHarnessToolCompatibility = `## ZCode Harness Tool Compatibility

This skill was ported from the Codex/OpenCode OmO harness. ZCode does not provide \`call_omo_agent\`, \`task\`, \`background_output\`, \`team_*\`, \`multi_agent_v1.spawn_agent\`, or any Codex-only multi-agent tools. Translate every such example to ZCode's native tools:

| Codex/OpenCode example | ZCode tool to use |
| --- | --- |
| \`call_omo_agent(subagent_type="explore", ...)\` | \`Agent\` tool with \`subagent_type="Explore"\` and a self-contained \`prompt\` |
| \`call_omo_agent(subagent_type="librarian", ...)\` | \`Agent\` tool with \`subagent_type="Explore"\` (research-focused prompt) |
| \`task(subagent_type="plan", ...)\` | \`Agent\` tool with \`subagent_type="general-purpose"\` (planning-focused prompt) |
| \`task(subagent_type="oracle", ...)\` for final verification | \`Agent\` tool with \`subagent_type="general-purpose"\` (rigorous-review prompt) |
| \`task(category="...", ...)\` for implementation or QA | \`Agent\` tool with \`subagent_type="general-purpose"\` |
| \`multi_agent_v1.spawn_agent(...)\` / \`spawn_agent(...)\` | \`Agent\` tool with \`subagent_type\` and a self-contained \`prompt\` |
| \`background_output(task_id="...")\` | Pass \`run_in_background: true\` to the \`Agent\` tool; the parent turn waits for completion and returns the agent's final message |
| \`multi_agent_v1.wait_agent(...)\` mailbox signals | Not needed in ZCode — background agents re-invoke the parent on completion. For long work, spawn multiple \`Agent\` calls in one message so they run concurrently |
| \`team_*(...)\` | ZCode has no native team-of-threads API. Approximate with multiple parallel \`Agent\` calls (one per member) coordinated by the parent, or fall back to sequential subagents when isolation is unclear |

Role-specific behavior must be described in a self-contained \`prompt\`. The \`Agent\` tool starts the child with only the prompt you give it (no parent history) — include any required conversation context, files, diffs, constraints, and requested skill names directly in the \`prompt\`. LazyZ does NOT install ZCode-recognized agent roles (ZCode's \`agents\` manifest field is recorded but not executed), so always describe the role (explorer, librarian, plan, reviewer, QA worker) inside the \`prompt\` text rather than relying on a role name. If a code block below conflicts with this section, this section wins.

For work likely to take long, prefer multiple concurrent \`Agent\` calls in a single message over one giant blocking call. Treat each child's final message as the deliverable: if it lacks the required output, ack-only, or stops without producing evidence, fall back to a smaller re-scoped \`Agent\` call with the missing deliverable made explicit in the \`prompt\`.

`;

const codexCompatibilityEndMarkers = [
	"For work likely to take long, prefer multiple concurrent `Agent` calls in a single message over one giant blocking call. Treat each child's final message as the deliverable: if it lacks the required output, ack-only, or stops without producing evidence, fall back to a smaller re-scoped `Agent` call with the missing deliverable made explicit in the `prompt`.\n\n",
	"Role-specific behavior must be described in a self-contained `prompt`. The `Agent` tool starts the child with only the prompt you give it (no parent history) — include any required conversation context, files, diffs, constraints, and requested skill names directly in the `prompt`. LazyZ does NOT install ZCode-recognized agent roles (ZCode's `agents` manifest field is recorded but not executed), so always describe the role (explorer, librarian, plan, reviewer, QA worker) inside the `prompt` text rather than relying on a role name. If a code block below conflicts with this section, this section wins.\n\n",
	"Role-specific behavior must be described in a self-contained `message`. Use `fork_context: false` to start the child with only the initial prompt (no parent history); use `fork_context: true` only when full parent history is truly required. Include any required conversation context, files, diffs, constraints, and requested skill names directly in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, include the requested skill names in the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
	"When translating `load_skills=[...]`, name the skills inside the spawned agent's `message`. If a code block below conflicts with this section, this section wins.\n\n",
];

function findCodexCompatibilitySectionEnd(content, searchStart) {
	const structuralEndPattern = /\n(?:---|export\s+const\s+|#{1,6}\s)/g;
	structuralEndPattern.lastIndex = searchStart;
	const structuralEnd = structuralEndPattern.exec(content);
	if (structuralEnd) return structuralEnd.index + 1;

	const knownEndMarker = codexCompatibilityEndMarkers.find((marker) => content.indexOf(marker, searchStart) !== -1);
	if (knownEndMarker === undefined) return content.length;

	return content.indexOf(knownEndMarker, searchStart) + knownEndMarker.length;
}

function removeCodexCompatibilityGuidance(content) {
	const heading = "## Codex Harness Tool Compatibility";
	let withoutGuidance = content;

	while (true) {
		const start = withoutGuidance.indexOf(heading);
		if (start === -1) return withoutGuidance;

		const end = findCodexCompatibilitySectionEnd(withoutGuidance, start + heading.length);

		withoutGuidance = `${withoutGuidance.slice(0, start)}${withoutGuidance.slice(end)}`;
	}
}

function hasKnownGeneratedCodexCompatibilityGuidance(content, compatibilityIndex) {
	return codexCompatibilityEndMarkers.some((marker) => content.indexOf(marker, compatibilityIndex) !== -1);
}

export function insertCodexCompatibilityGuidance(content) {
	// LazyZ: always strip any existing Codex/OpenCode compatibility block and
	// inject the ZCode version. Upstream only injected when an OpenCode
	// orchestration call (call_omo_agent, task, …) was present and skipped when
	// a block already existed. LazyZ wants every skill to carry the ZCode
	// mapping unconditionally, so we normalize first, then insert.
	const compatibilityIndex = content.indexOf("## Codex Harness Tool Compatibility");
	const zcodeIndex = content.indexOf("## ZCode Harness Tool Compatibility");
	if (compatibilityIndex === -1 && zcodeIndex === -1 && !opencodeOnlyOrchestrationPattern.test(content)) {
		return content;
	}

	const contentWithoutGuidance = removeCodexCompatibilityGuidance(content)
		.replace(/^## ZCode Harness Tool Compatibility[\s\S]*?(?=\n^#{1,3} |\n---|\nexport const |\n```)/m, "");

	const frontmatterMatch = contentWithoutGuidance.match(/^---\n[\s\S]*?\n---\n+/);
	if (!frontmatterMatch) {
		return `${codexHarnessToolCompatibility}${contentWithoutGuidance}`;
	}

	return `${frontmatterMatch[0]}${codexHarnessToolCompatibility}${contentWithoutGuidance.slice(frontmatterMatch[0].length)}`;
}

const startWorkOriginalCompletion = `When all top-level checkboxes in \`## TODOs\` and \`## Final Verification Wave\` are complete:

1. Run the plan's final verification commands.
2. For PR/branch work, finish the lifecycle from the task-owned worktree: sync \`.omo/\` state back to the main repo, create or update the PR, wait for review/verification gates, merge by default unless explicitly opted out, and remove the worktree only after successful merge or explicit handoff.
3. Remove or mark the Boulder work as completed.
4. Print an \`ORCHESTRATION COMPLETE\` block with the plan path, verification commands, artifacts, and cleanup receipts.`;

const startWorkCodexCompletion = `When all top-level checkboxes in \`## TODOs\` and \`## Final Verification Wave\` are complete:

1. Run the plan's final verification commands.
2. Complete the **Global Review and Debugging Gate** before any completion claim, PR creation, PR handoff, branch handoff, or merge:
   - Invoke the \`review-work\` skill with the final diff, changed files, user goal, constraints, run command, and verification evidence. All five review lanes must return PASS. A timeout, missing deliverable, ack-only child, \`BLOCKED:\`, or inconclusive lane is a gate failure, not approval.
   - Run a debugging-oriented runtime audit even when the review passes: name at least three plausible failure hypotheses for the changed surface, run the distinguishing checks against the actual artifact, and append the ruled-out or confirmed result to \`.omo/start-work/ledger.jsonl\`.
   - If any review lane or debugging hypothesis fails, invoke the \`debugging\` skill, confirm root cause with runtime evidence, add the minimal failing test or reproduction, fix it, rerun the affected verification, then rerun the Global Review and Debugging Gate.
   - Evidence hygiene is mandatory: redact or mask secrets and sensitive user data before writing \`.omo/start-work/ledger.jsonl\`, a PR body, or a handoff. Never include raw tokens, credentials, auth headers, cookies, API keys, env dumps, private logs, or PII; use concise summaries, lengths, hashes, or short non-sensitive prefixes instead.
   - If the work includes creating, updating, or handing off a PR, refresh \`git status\` and the PR/branch state from the task-owned worktree after the gate, and include only redacted review/debugging evidence in the PR body or handoff.
3. Finish the PR/branch lifecycle from its task-owned worktree: sync \`.omo/\` state back to the main repo, create or update the PR when requested, wait for CI/review/Cubic gates, merge by default unless explicitly opted out, and remove the worktree only after successful merge or explicit handoff.
4. Remove or mark the Boulder work as completed.
5. Print an \`ORCHESTRATION COMPLETE\` block with the plan path, verification commands, Global Review and Debugging Gate verdict, artifacts, and cleanup receipts.`;

const startWorkOriginalHardRule = "- No completion claim while an applicable ultraqa adversarial class was never probed. Each applicable class needs a captured observable result; each skipped class needs a one-line not-applicable reason in the ledger.\n- No PR/branch implementation, review, or merge in the main worktree; use the task-owned git worktree.\n- No unprefixed session ids in Boulder state. Codex sessions are always `codex:<session_id>`.";

const startWorkCodexHardRule = "- No completion claim while an applicable ultraqa adversarial class was never probed. Each applicable class needs a captured observable result; each skipped class needs a one-line not-applicable reason in the ledger.\n- No `ORCHESTRATION COMPLETE`, final response, PR creation, PR handoff, or merge before the Global Review and Debugging Gate passes with recorded evidence.\n- No PR/branch implementation or review in the main worktree; create or use a task-owned git worktree first.\n- No unprefixed session ids in Boulder state. Codex sessions are always `codex:<session_id>`.";

const reviewWorkAnchor = "Launch 5 specialized sub-agents in parallel to review completed implementation work from every angle. All 5 must pass for the review to pass. If even ONE fails, the review fails.\n";

const reviewWorkCodexGate = `
When \`review-work\` is used as a final implementation, PR, or \`$start-work\`
gate, it is blocking. A timeout, missing deliverable, ack-only response,
explicit \`BLOCKED:\`, or inconclusive lane is not a pass. Treat that lane as
failed, investigate the underlying uncertainty with the \`debugging\` skill when
runtime behavior may be wrong, fix with evidence, and rerun the affected lane
before claiming completion, creating or handing off a PR, or merging.

A rejecting lane must name its blockers inline in its final message — each
blocker cites the violated goal criterion or requirement plus an evidence
pointer. A bare REJECT/FAIL token without findings is not a verdict; treat it
as an inconclusive lane (one bounded respawn, then record it inconclusive with
that reason).

When reviewing a PR or branch, collect diff, file contents, and verification
results from a dedicated review worktree attached to that branch. Never
checkout, test, or edit the review branch in the main worktree.

Review evidence must be safe to share. Redact or mask secrets and sensitive
user data before including evidence in logs, PR bodies, or handoffs. Never
include raw tokens, credentials, auth headers, cookies, API keys, env dumps,
private logs, or PII; summarize with lengths, hashes, and short non-sensitive
prefixes when identity is needed.
`;

function applyCodexSkillOverlays(skillName, content) {
	if (skillName === "ulw-research") {
		return content
			.replace(
				", the legacy alias 'ultraresearch', any 'ulw' research wording,",
				", any 'ulw' research wording,",
			)
			.replace(
				'the legacy alias "ultraresearch" (also `/ultraresearch`, `$ultraresearch`), ',
				"",
			)
			.replace(
				"answer those normally, and mention that `ulw-research` is available (legacy alias: `ultraresearch`) when a question would clearly benefit from it.",
				"answer those normally, and mention that `ulw-research` is available when a question would clearly benefit from it.",
			)
			.replace("# Ultraresearch Synthesis: <query>", "# ULW-Research Synthesis: <query>");
	}
	if (skillName === "start-work") {
		return content
			.replace(startWorkOriginalCompletion, startWorkCodexCompletion)
			.replace(startWorkOriginalHardRule, startWorkCodexHardRule);
	}
	if (skillName === "review-work" && !content.includes("When `review-work` is used as a final implementation")) {
		return content.replace(reviewWorkAnchor, `${reviewWorkAnchor}${reviewWorkCodexGate}`);
	}
	return content;
}

function readSkillFrontmatterName(content, fallbackName) {
	const frontmatter = content.match(/^---\n(?<body>[\s\S]*?)\n---\n+/);
	const rawName = frontmatter?.groups?.body.match(/^name:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim();
	return rawName && rawName.length > 0 ? rawName : fallbackName;
}

function upsertDisplayName(metadata, displayName) {
	const content = metadata.endsWith("\n") ? metadata : `${metadata}\n`;
	if (/^\s*display_name:/m.test(metadata)) {
		return content.replace(/^(\s*display_name:\s*).+$/m, `$1"${displayName}"`);
	}
	if (/^interface:\s*$/m.test(metadata)) {
		return content.replace(/^interface:\s*$/m, `interface:\n  display_name: "${displayName}"`);
	}
	return `interface:\n  display_name: "${displayName}"\n${content}`;
}

async function writeCodexSkillDisplayMetadata(skillName) {
	const skillRoot = join(skillsRoot, skillName);
	const skillPath = join(skillRoot, "SKILL.md");
	const content = await readFile(skillPath, "utf8");
	const frontmatterName = readSkillFrontmatterName(content, skillName);
	const metadataDir = join(skillRoot, "agents");
	const metadataPath = join(metadataDir, "openai.yaml");
	await mkdir(metadataDir, { recursive: true });
	let metadata = "interface:\n";
	try {
		metadata = await readFile(metadataPath, "utf8");
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	await writeFile(metadataPath, upsertDisplayName(metadata, `${skillDisplayPrefix}${frontmatterName}`), "utf8");
}

async function adaptSkillForCodex(skillName) {
	const skillPath = join(skillsRoot, skillName, "SKILL.md");
	const content = await readFile(skillPath, "utf8");
	const adapted = applyCodexSkillOverlays(skillName, insertCodexCompatibilityGuidance(content));
	if (adapted !== content) {
		await writeFile(skillPath, adapted, "utf8");
	}
	await writeCodexSkillDisplayMetadata(skillName);
}

async function syncSkills() {
	// LazyZ: do NOT wipe skillsRoot. Upstream removed the whole directory and
	// rebuilt it from component + shared-skills sources, but LazyZ also ships
	// top-level skills (ast-grep, coding-agent-sessions, frontend, lsp-setup,
	// lcx-*, ultimate-browsing, ulw-research) that have no component/shared-skills
	// source. Wiping would delete them. Instead, sync each sourced skill in
	// place and leave top-level skills untouched.
	await mkdir(skillsRoot, { recursive: true });

	for (const [name, source] of skillSources) {
		await rm(join(skillsRoot, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		await cp(join(root, source), join(skillsRoot, name), { recursive: true });
		await adaptSkillForCodex(name);
	}

	const sharedSkillEntries = await readdir(sharedSkillsRoot, { withFileTypes: true });
	const sharedSkillNames = sharedSkillEntries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();

	for (const skillName of sharedSkillNames) {
		if (componentSkillNames.has(skillName)) continue;
		if (codexHiddenSharedSkillNames.has(skillName)) continue;
		// LazyZ: skip shared skill if a richer top-level skill already exists
		// (e.g. "frontend" overrides the simpler "frontend-ui-ux").
		if (skillName === "frontend-ui-ux" && existsSyncSync(join(skillsRoot, "frontend"))) continue;
		await rm(join(skillsRoot, skillName), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		await cp(join(sharedSkillsRoot, skillName), join(skillsRoot, skillName), {
			filter: shouldCopySkillSource,
			recursive: true,
		});
		await adaptSkillForCodex(skillName);
	}
}

if (isCliEntry(import.meta.url)) {
	await syncSkills();
}
