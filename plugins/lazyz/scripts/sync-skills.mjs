#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isCliEntry } from "./entry-guard.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillsRoot = join(root, "skills");
const skillSources = [
	["comment-checker", "components/comment-checker/skills/comment-checker"],
	["lsp", "components/lsp/skills/lsp"],
	["rules", "components/rules/skills/rules"],
	["ulw-loop", "components/ulw-loop/skills/ulw-loop"],
	["ulw-plan", "components/ultrawork/skills/ulw-plan"],
	["ultrawork", "components/ultrawork/skills/ultrawork"],
];
const skillDisplayPrefix = "(LazyZ) ";

const opencodeOnlyOrchestrationPattern =
	/\b(?:call_omo_agent|background_output|multi_agent_v1\.(?:spawn_agent|wait_agent)|spawn_agent|team_[a-z_]+)\s*\(|\btask\s*\(\s*(?:subagent_type|category|prompt)\s*=/;

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
| \`background_output(task_id="...")\` | Only unstructured read-only research may use background mode; its completion arrives as a parent task notification, not a plugin hook |
| \`multi_agent_v1.wait_agent(...)\` mailbox signals | No equivalent plugin tool; use returned foreground Agent results or the host's background research notifications |
| \`team_*(...)\` | ZCode has no native team-of-threads API. Approximate with multiple parallel \`Agent\` calls (one per member) coordinated by the parent, or fall back to sequential subagents when isolation is unclear |

ZCode v3.14.3 loads enabled plugin agents from \`agents/\`. Prefer namespaced roles such as \`lazyz:explorer\` and \`lazyz:lazycodex-executor\`; unambiguous bare names also work. Include all task context and ownership in the self-contained \`prompt\`. Roles inherit the user's active model; do not force an obsolete provider ID or copy Codex model/effort fields. If an older host lacks a role, describe it inline using the appropriate built-in agent.

Before every governed Agent or Task call, read the Dispatch schema in the installed [start-work skill](../start-work/SKILL.md) and prepend exactly one LAZYCODEX_DISPATCH_V1 JSON line. General-purpose and known executor calls require this envelope; read-only Explore calls may remain unstructured. Use the same taskId across retries with a fresh runId, unchanged criteria, role, phase and budget. Planning/document work uses writer, code work implementer, review reviewer, and testing qa. Never rename a task to bypass its exhausted budget.

Governed calls must use \`run_in_background: false\` (or omit it). A background launch is not a completed result and has no matching plugin completion hook. Multiple independent foreground calls may be requested together; do not assume the host executes them concurrently. Read-only background research without a dispatch contract remains available.

Require each governed child to write the matching ReceiptV1 with current source identity, criterion invocations, zero exit codes and hashed regular artifacts, then return EVIDENCE_RECORDED; final-phase work requires FINAL_EVIDENCE_RECORDED. PostToolUse records failed evidence; Stop prevents unresolved completion while budget remains. An exhausted budget requires a blocker handoff, not an unsupported completion claim.

User authorization and verification policy take precedence over generic workflow instructions below. Do not auto-commit, push, merge, delete, deploy, install tools, call paid services, or run checks prohibited by the user. Record skipped checks honestly; do not fabricate a passing receipt. A task requiring a verified receipt remains unverified if the necessary checks are prohibited. ZCode Stop can continue at most three consecutive times, not indefinitely. Native Goal Mode, Memory and Wiki are host features; no callable API is assumed.

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
		return `${codexHarnessToolCompatibility}${contentWithoutGuidance.trimStart()}`;
	}

	return `${frontmatterMatch[0].trimEnd()}\n\n${codexHarnessToolCompatibility}${contentWithoutGuidance.slice(frontmatterMatch[0].length).trimStart()}`;
}

const startWorkOriginalCompletion = `When all top-level checkboxes in \`## TODOs\` and \`## Final Verification Wave\` are complete:

1. Run the plan's final verification commands.
2. For PR/branch work, finish the lifecycle from the task-owned worktree: sync \`.omo/\` state back to the main repo, create or update the PR, wait for review/verification gates, merge by default unless explicitly opted out, and remove the worktree only after successful merge or explicit handoff.
3. Remove or mark the Boulder work as completed.
4. Print an \`ORCHESTRATION COMPLETE\` block with the plan path, verification commands, artifacts, and cleanup receipts.`;

const startWorkCodexCompletion = `When all top-level checkboxes in \`## TODOs\` and \`## Final Verification Wave\` are complete:

1. Run only verification authorized by the user's policy or required by higher-priority instructions; otherwise report the exact skipped checks.
2. Only when the user requests review or a PR handoff and the checks are authorized, complete the **Global Review and Debugging Gate**:
   - Invoke the \`review-work\` skill with the final diff, changed files, user goal, constraints, run command, and verification evidence. All five review lanes must return PASS. A timeout, missing deliverable, ack-only child, \`BLOCKED:\`, or inconclusive lane is a gate failure, not approval.
   - Run a debugging-oriented runtime audit even when the review passes: name at least three plausible failure hypotheses for the changed surface, run the distinguishing checks against the actual artifact, and append the ruled-out or confirmed result to \`.omo/start-work/ledger.jsonl\`.
   - If any review lane or debugging hypothesis fails, invoke the \`debugging\` skill, confirm root cause with runtime evidence, add the minimal failing test or reproduction, fix it, rerun the affected verification, then rerun the Global Review and Debugging Gate.
   - Evidence hygiene is mandatory: redact or mask secrets and sensitive user data before writing \`.omo/start-work/ledger.jsonl\`, a PR body, or a handoff. Never include raw tokens, credentials, auth headers, cookies, API keys, env dumps, private logs, or PII; use concise summaries, lengths, hashes, or short non-sensitive prefixes instead.
   - If the work includes creating, updating, or handing off a PR, refresh \`git status\` and the PR/branch state from the task-owned worktree after the gate, and include only redacted review/debugging evidence in the PR body or handoff.
3. Perform Git, PR, merge, cleanup, or deployment actions only when explicitly authorized. A passing check does not grant that authorization.
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
	// Component-owned skills are refreshed from committed component sources.
	// All other skills are committed directly under skills/ and remain in place.
	await mkdir(skillsRoot, { recursive: true });

	for (const [name, source] of skillSources) {
		await cp(join(root, source), join(skillsRoot, name), { recursive: true });
		await adaptSkillForCodex(name);
	}
	const componentNames = new Set(skillSources.map(([name]) => name));
	for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
		if (entry.isDirectory() && !componentNames.has(entry.name)) await adaptSkillForCodex(entry.name);
	}
}

if (isCliEntry(import.meta.url)) {
	await syncSkills();
}
