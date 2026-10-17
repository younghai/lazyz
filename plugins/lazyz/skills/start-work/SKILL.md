---
name: start-work
description: "Compatibility alias for executing an approved Prometheus plan through the ZCode ulw-execute contract, with registered goals, evidence ledger updates, worktree discipline, foreground agents, and bounded Stop continuation."
---

## ZCode Harness Tool Compatibility

This skill was ported from the Codex/OpenCode OmO harness. ZCode does not provide `call_omo_agent`, `task`, `background_output`, `team_*`, `multi_agent_v1.spawn_agent`, or any Codex-only multi-agent tools. Translate every such example to ZCode's native tools:

| Codex/OpenCode example | ZCode tool to use |
| --- | --- |
| `call_omo_agent(subagent_type="explore", ...)` | `Agent` tool with `subagent_type="Explore"` and a self-contained `prompt` |
| `call_omo_agent(subagent_type="librarian", ...)` | `Agent` tool with `subagent_type="Explore"` (research-focused prompt) |
| `task(subagent_type="plan", ...)` | `Agent` tool with `subagent_type="general-purpose"` (planning-focused prompt) |
| `task(subagent_type="oracle", ...)` for final verification | `Agent` tool with `subagent_type="general-purpose"` (rigorous-review prompt) |
| `task(category="...", ...)` for implementation or QA | `Agent` tool with `subagent_type="general-purpose"` |
| `multi_agent_v1.spawn_agent(...)` / `spawn_agent(...)` | `Agent` tool with `subagent_type` and a self-contained `prompt` |
| `background_output(task_id="...")` | Only unstructured read-only research may use background mode; its completion arrives as a parent task notification, not a plugin hook |
| `multi_agent_v1.wait_agent(...)` mailbox signals | No equivalent plugin tool; use returned foreground Agent results or the host's background research notifications |
| `team_*(...)` | ZCode has no native team-of-threads API. Approximate with multiple parallel `Agent` calls (one per member) coordinated by the parent, or fall back to sequential subagents when isolation is unclear |

ZCode v3.14.3 loads enabled plugin agents from `agents/`. Prefer namespaced roles such as `lazyz:explorer` and `lazyz:lazycodex-executor`; unambiguous bare names also work. Include all task context and ownership in the self-contained `prompt`. Roles inherit the user's active model; do not force an obsolete provider ID or copy Codex model/effort fields. If an older host lacks a role, describe it inline using the appropriate built-in agent.

Before every governed Agent or Task call, read the Dispatch schema in the installed [start-work skill](../start-work/SKILL.md) and prepend exactly one LAZYCODEX_DISPATCH_V1 JSON line. General-purpose and known executor calls require this envelope; read-only Explore calls may remain unstructured. Use the same taskId across retries with a fresh runId, unchanged criteria, role, phase and budget. Planning/document work uses writer, code work implementer, review reviewer, and testing qa. Never rename a task to bypass its exhausted budget.

Governed calls must use `run_in_background: false` (or omit it). A background launch is not a completed result and has no matching plugin completion hook. Multiple independent foreground calls may be requested together; do not assume the host executes them concurrently. Read-only background research without a dispatch contract remains available.

Require each governed child to write the matching ReceiptV1 with current source identity, criterion invocations, zero exit codes and hashed regular artifacts, then return EVIDENCE_RECORDED; final-phase work requires FINAL_EVIDENCE_RECORDED. PostToolUse records failed evidence; Stop prevents unresolved completion while budget remains. An exhausted budget requires a blocker handoff, not an unsupported completion claim.

User authorization and verification policy take precedence over generic workflow instructions below. Do not auto-commit, push, merge, delete, deploy, install tools, call paid services, or run checks prohibited by the user. Record skipped checks honestly; do not fabricate a passing receipt. A task requiring a verified receipt remains unverified if the necessary checks are prohibited. ZCode Stop can continue at most three consecutive times, not indefinitely. Native Goal Mode, Memory and Wiki are host features; no callable API is assumed.

For work likely to take long, prefer multiple concurrent `Agent` calls in a single message over one giant blocking call. Treat each child's final message as the deliverable: if it lacks the required output, ack-only, or stops without producing evidence, fall back to a smaller re-scoped `Agent` call with the missing deliverable made explicit in the `prompt`.

# start-work

`start-work` is the compatibility alias for `ulw-execute`. Execute only an approved, decision-complete Prometheus plan after the user explicitly requests execution. Register its aggregate goal before implementation, then use the existing LazyZ Stop continuation behavior. ZCode permits at most three Stop continuations; it does not provide a `SubagentStop` event.

Names such as `Task`, `spawn_agent`, and `wait_agent` in the compatibility table are foreign-example labels only. The operative ZCode execution path uses foreground `Agent` calls and supported ZCode hooks.

## Usage

```text
$start-work <plan-name> [--worktree <absolute-path>]
```

- `plan-name` identifies an approved `.omo/plans/<plan-name>.md` file.
- `--worktree` is optional. Use it only when the user explicitly asks to work in a separate git worktree.

## Manual-QA requirement (read before starting)

Every user-visible checkbox in the plan requires **real Manual-QA evidence captured against a running surface** — a dry-run claim is never sufficient. Before starting, ensure the relevant channel is available:

| Channel | When to use | Artifact |
| --- | --- | --- |
| **HTTP** (`curl -i`) | HTTP API checkbox | status line + headers + body |
| **tmux** (`send-keys` + `capture-pane`) | terminal/CLI checkbox | tmux transcript |
| **Browser** (Chrome or agent-browser) | web UI checkbox | action log + screenshot path |
| **Computer use** (OS automation) | desktop GUI checkbox | action log + screenshot |

CLI stdout, DB diffs, and parsed config dumps are accepted as **auxiliary evidence** for CLI-shaped or data-shaped behavior, but do not replace the channel table for user-visible surfaces. `--dry-run` output is never accepted as evidence.

If the surface cannot be started (server won't boot, browser unavailable), flag it up front rather than discovering it at the first checkbox.

## Phase 1: Select the plan

1. Resolve the named plan under `.omo/plans/` and read it in full.
2. Confirm the plan exists, is decision-complete, and has explicit user approval. Plan approval alone is not an execution request; this invocation must also request execution.
3. If the plan is missing, incomplete, or unapproved, stop before implementation and surface the exact prerequisite. Do not create, approve, or execute a replacement plan from this skill.
4. For a resume request, confirm the registered run corresponds to the same approved plan with `lazyz ulw-loop status --json`; do not infer resumability from a hand-written state file.

## Phase 2: Register the goal

Before implementation or evidence recording, register the approved plan through the supported CLI:

```sh
lazyz ulw-loop create-goals --brief-file ".omo/plans/<plan-name>.md" --json
lazyz ulw-loop status --json
```

Use the CLI-managed state under `.omo/ulw-loop`; do not create or hand-edit `.omo/boulder.json`, goal state, or session-id prefixes. If `create-goals` reports that the current aggregate is already complete, start unrelated work with a fresh `--session-id <new-id>` rather than forcing or steering the completed state. Use `--force` only when the user explicitly requests overwriting completed evidence.

If `--worktree` is set, verify the path with `git worktree list --porcelain` or create it with `git worktree add <path> <branch-or-HEAD>`. All edits, commands, tests, and evidence capture must run inside that worktree.

## Phase 3: Execute the next checkbox

1. Read the full selected plan.
2. Find the first unchecked column-0 checkbox in `## TODOs` or `## Final Verification Wave`.
3. Ignore nested checkboxes under acceptance criteria, evidence, and definition-of-done sections.
4. Decompose that checkbox into atomic sub-tasks.
5. Dispatch independent sub-tasks with foreground ZCode `Agent` calls; request independent calls together when parallelism is safe, and serialize when one sub-task has a named dependency on another.

Each sub-task message must include:

1. The dispatch schema below, including the goal and exact files or directories in scope.
2. When the task touches existing behavior: a baseline characterization test, written first, that asserts current observable behavior and passes on the unchanged code. Then the red test or failing reproduction for the new behavior before production changes. Pin the baseline as rigorously as the new test: exact inputs, exact observable, exact assertion.
3. Implementation constraints from the plan and project rules.
4. Automated verification commands to run.
5. One Manual-QA channel, named with the exact tool and exact invocation (the literal `curl`, `send-keys`, `page.click`, payload, selectors, and the binary observable that decides PASS/FAIL), not "verify it works":
   - HTTP call: `curl -i` against the live endpoint.
   - tmux: a `tmux` session driven with `send-keys`, dumped via `capture-pane`.
   - Browser use: use Chrome to drive the real page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser).
   - Computer use: OS-level GUI automation against the running desktop app when the surface is not a page.
6. The adversarial classes that apply to this sub-task (from the 9 ultraqa classes) and how each is probed.
7. Required artifact path and cleanup receipt.

### Dispatch schema

Every governed ZCode `Agent` prompt is a complete executable assignment, not a context handoff. Put exactly one compact JSON marker line near the top of the prompt and fill every field:

```text
LAZYCODEX_DISPATCH_V1: {"schemaVersion":1,"workId":"<registered work id>","taskId":"<stable task id>","runId":"<new id for this attempt>","role":"implementer|reviewer|qa|writer","phase":"execute|verify|final","criterionRefs":["G001-first/C001"],"budget":{"maxCalls":5,"maxSameFailure":3}}
```

`taskId` is stable across retries. `runId` is unique for each dispatch attempt. The first accepted marker freezes the work, task, role, phase, criteria, and budget for that task. Caller budgets may lower the hard caps of 5 total calls and 3 identical failures, but may never raise them. Use a distinct task id when a task legitimately changes role or phase. `criterionRefs` uses canonical goal/criterion ids such as `G001-first/C001`; bare `G001` or `C001` remains valid for standalone tasks.

The assignment JSON validated below contains that envelope plus the scheduling fields `execution_shape`, `parallel_safe`, `owned_paths`, and `completion_condition` and the operational fields listed next.

After the envelope, include these labeled sections in this order:

- `DELIVERABLE:` exact files, result shape, and behavior the child must return.
- `VERIFY:` exact commands or scenario and the expected observable.
- `STOP WHEN:` the same binary completion boundary expressed operationally.
- `ARTIFACT:` exact evidence path or returned structured payload.
- `PARENT VALIDATION:` what the orchestrator will independently inspect or rerun before accepting the return.

`parallel_safe: true` is valid only when `owned_paths` do not overlap any active lane and the task has no unmet dependency on another lane. An empty or broad ownership entry is not parallel-safe. The orchestrator validates the envelope before dispatch and serializes invalid or overlapping lanes.

A child response that only acknowledges the task, reports progress without the `DELIVERABLE`, omits the required artifact, or stops before every `completion_condition` entry is satisfied is an execution failure. Do not count it as evidence or completion. Send one focused follow-up naming the missing field; if the second response is still ack-only or incomplete, record the lane as failed and respawn a smaller assignment with the same `taskId` and a fresh `runId`.

Validate the JSON form of every envelope before dispatch:

```bash
uv run "<start-work-skill-root>/scripts/validate_dispatch.py" <assignment.json>
```

Require the child final to be JSON with non-empty `deliverable`, `verify`, and `artifact` fields plus `completion_condition_met: true`, then validate it before parent inspection:

```bash
uv run "<start-work-skill-root>/scripts/validate_dispatch.py" <assignment.json> --final <worker-final.json>
```

The validator is the dispatch gate. Its first output line is the exact `LAZYCODEX_DISPATCH_V1` marker to paste into the prompt. It uses JSON plus strict Pydantic parsing, never `eval`, rejects missing schema fields, invalid criterion ids, budgets above the hard caps, empty or blank completion-condition lists, and broad parallel ownership, and rejects plain-string acknowledgement finals. A validator failure blocks dispatch or acceptance respectively.

Every structured worker writes a ReceiptV1 JSON file under `.omo/evidence/` and ends its assistant response with `EVIDENCE_RECORDED: <path>`. A `phase:"final"` worker must use `FINAL_EVIDENCE_RECORDED: <path>`; an ordinary marker cannot downgrade final evidence. The receipt must bind the exact `taskId`, `runId`, `role`, `phase`, current source commit/tree, criterion refs, invocations, zero exit codes, and confined regular evidence artifacts with SHA-256 hashes. The runtime enforces maximum receipt and artifact read sizes. Malformed marker-bearing prompts and general-purpose executor prompts without the dispatch marker fail closed. Read-only Explore dispatches may remain unstructured.

`PreToolUse` reserves the unique run before dispatch and requests denial when the contract or budget is invalid. `PostToolUse` validates the returned receipt, records a stable typed failure signature, and uses the documented `additionalContext` channel to report failure after the action; it does not claim to undo or block an already completed tool call. `PostToolUseFailure` records the stable `tool-execution-failed` signature without storing raw host errors and reports it through `additionalContext`. `Stop` is the completion gate: it blocks unresolved tasks while retry budget remains, but allows the orchestrator to report a task whose budget is exhausted. This is a local hook contract; do not describe PreToolUse denial as a paid-provider API guarantee.

Apply ultraqa's 9 adversarial classes where relevant to each checkbox: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions. A checkbox whose behavior is user-visible MUST probe every class that plausibly applies; record which classes were exercised and which were ruled not-applicable with a one-line reason.

### Cycle and failure caps

These caps bound runaway work on a single checkbox. They mirror the ulw-loop execution loop and are mandatory.

- **Cap at 5 execution cycles per checkbox.** An execution cycle is one dispatch → verify → verdict round. After 5 cycles on one checkbox without a `confirmed` verdict, record the failure through the `lazyz ulw-loop` evidence/checkpoint CLI, stop dispatching that checkbox, and surface the diagnosis.
- **Cap identical failure type at 3 per checkbox.** Track the verdict-failure signature (`needs-fix` on the same assertion, `false-positive` on the same artifact, etc.). After 3 failures of the same type on the same checkbox, record the blocked checkpoint through the CLI and escalate.
- A blocked run resumes only after the blocker is resolved and the supported CLI state permits continuation. Never unblock it by editing `.omo` files directly.

### Debugging budget

When the same checkbox fails 2 rounds in a row (regardless of failure type), load the `debugging` skill and run its hypothesis-driven loop before the next dispatch: form ≥3 hypotheses, pick the cheapest to validate, and only re-dispatch with the validated root cause in the failure context. This budget prevents re-dispatching the same failing executor context repeatedly. After 2 failed rounds the executor is assumed to be debugging-blind without this skill.

## Phase 4: Verify and record evidence

For each checkbox, complete all five gates before marking it done:

1. Plan reread: confirm the checkbox and acceptance criteria.
2. Automated verification: run tests, typecheck, lint, build, or the plan-specific equivalent.
3. Manual-QA channel: capture a real artifact, not a dry-run claim.
4. Adversarial QA: exercise every applicable ultraqa class (malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions) and capture the observable result for each. "Tests pass" and a clean happy-path artifact are NOT sufficient when an adversarial class applies and was not probed.
5. Cleanup: register every QA resource teardown as its own todo the moment it is spawned (QA scripts, tmux assets, browser / agent-browser sessions, PIDs, ports, containers, temp dirs), then execute each and capture the receipt. No QA asset is left running.

Record evidence through `lazyz ulw-loop record-evidence`; do not append goal-state ledgers directly. Preserve at least `event`, `plan`, `task`, `session_id`, `commands`, `artifact`, `adversarial_classes`, and `cleanup` in the evidence artifact or notes. `adversarial_classes` lists each probed class with its observable result and each ruled-out class with a one-line reason.

**Before recording evidence**, redact secrets from the `commands` field and evidence artifacts. The `commands` field captures shell invocations verbatim — `curl -H "Authorization: Bearer sk-..."`, `psql PGPASSWORD=...`, `aws --secret-key ...` — and these are as sensitive as shell history. Strip or mask credentials before writing. A post-hoc scrubber is available: `node scripts/redact-secrets.mjs` (reports) or `node scripts/redact-secrets.mjs --fix` (masks in place). Run it before sharing or committing `.omo/`.

### Sisyphus-style completion contract

A worker done claim is never final. Each implementation sub-task returns a `DoneClaim`, then a different context runs `AdversarialVerify`, then the verifier probes or reproduces the claim, then failures loop back to the executor, and only a confirmed verifier verdict becomes `FullyDone`.

```json
{
  "DoneClaim": {
    "task": "<task id/title>",
    "changed_files": ["path"],
    "tests": ["exact command + result"],
    "manual_qa": ["artifact path"],
    "cleanup": ["receipt"],
    "risks": ["known risk or none"]
  },
  "AdversarialVerify": {
    "verdict": "confirmed | false-positive | needs-fix | needs-human-review",
    "evidence": ["file path, command, log, artifact, or explicit not inspected"],
    "repro": "exact command or manual steps when available",
    "confidence": 0.0
  }
}
```

Rules:
- `confirmed` is the only pass verdict. `false-positive`, `needs-fix`, and `needs-human-review` all block checkbox completion.
- A `needs-human-review` verdict means the checkbox cannot be completed without a user decision. Record the blocked evidence/checkpoint through the `lazyz ulw-loop` CLI with the question that needs answering, and surface it to the user. Do not re-dispatch on `needs-human-review`; it is an explicit escalation, not a retry.
- The verifier must be independent from the executor: use a separate foreground ZCode `Agent` with a rigorous reviewer prompt, or root only when root did not implement or materially rewrite that task.
- A worker done claim must be independently verified before it can become checkbox completion.
- On any non-confirmed verdict, record the feedback through the CLI, leave the checkbox in progress, and re-dispatch the executor with the exact failure.
- The verifier must probe the applicable adversarial keys, including `stale_state`, `dirty_worktree`, and `misleading_success_output`, before allowing `FullyDone`.
- In prose evidence, name the same risks as stale state, dirty worktree, and misleading success output so reviewers can search for both key and human forms.
- Tests passing, green builds, or a worker DoneClaim without independent verification are not enough to mark a checkbox complete.
- Parent validation is mandatory: the orchestrator checks the returned artifact exists, verifies it belongs to `owned_paths`, and independently reruns or inspects the `PARENT VALIDATION` observable before sending the work to the independent verifier.

## Phase 5: Mark progress

Only after verification passes:

1. Edit the plan checkbox from `- [ ]` to `- [x]`.
2. Re-read the plan and confirm the remaining count decreased.
3. Record the passing criterion evidence and checkpoint through the `lazyz ulw-loop` CLI; the CLI-managed ledger is the durable goal-state record.
4. Continue with the next checkbox. Do not ask whether to continue.

## Completion

When all top-level checkboxes in `## TODOs` and `## Final Verification Wave` are complete:

1. Run the plan's final verification commands only when authorized by the user's verification policy; otherwise report the exact skipped checks and keep the affected criteria unverified.
2. If worktree mode was used, sync `.omo/` state back to the main repo, merge or hand off exactly as requested, and remove the worktree only after successful merge or explicit handoff.
3. Checkpoint each completed goal through the CLI, then run `lazyz ulw-loop complete-goals --json` until it reports aggregate completion; do not mark completion by editing `.omo` state.
4. Print an `ORCHESTRATION COMPLETE` block with the plan path, verification commands, artifacts, and cleanup receipts.

## Hard rules

- No production change before a failing test or reproduction exists, and no change to existing behavior before a baseline characterization test pins the current behavior and passes on the unchanged code.
- No `--dry-run` as completion evidence.
- No tests-only completion claim. A Manual-QA artifact is required.
- No completion claim while an applicable ultraqa adversarial class was never probed. Each applicable class needs a captured observable result; each skipped class needs a one-line not-applicable reason in the ledger.
- No hand-edited Boulder, goal, or session state. Use `lazyz ulw-loop create-goals`, `status`, evidence, checkpoint, and completion commands.
- No stale-memory execution. The plan and ledger are the durable source of truth.
