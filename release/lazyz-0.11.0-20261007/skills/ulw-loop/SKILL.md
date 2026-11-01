---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
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

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. Read **Stop Rules** and register the run's goal first with `lazyz ulw-loop create-goals`; do not begin implementation or evidence recording before the aggregate goal and criteria exist.
4. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- Goal registration is mandatory: use the CLI `create-goals`/`status` surfaces and start a fresh session when the aggregate is complete.
- ZCode Stop hooks allow at most three continuation attempts; after the third, surface the blocker and stop. Background agents cannot grant stdout permissions; permission-gated work belongs in the parent session.
- After any compaction or context loss, re-read brief + goals + ledger FIRST plus `lazyz ulw-loop status --json`, then resume; never re-plan from scratch.
- If `lazyz ulw-loop create-goals` says the existing aggregate is already complete, start unrelated new work with a fresh `--session-id <new-id>` instead of steering or forcing the completed default state. Use `--force` only to intentionally overwrite completed evidence.
- Every success criterion needs observable evidence from a real surface: a channel (tmux, HTTP, browser, computer-use) or, for CLI- or data-shaped criteria, an auxiliary surface (CLI stdout, DB diff, parsed config dump).
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized Codex subagents when the workflow requires it.
- Every `multi_agent_v1.spawn_agent` message starts with `TASK:`, then names `DELIVERABLE`, `SCOPE`, and `VERIFY`; put role and specialty instructions inside `message`; use `fork_context: false` unless full history is truly required.
- Plan and reviewer agents may run for a long time; spawn them in the background, keep doing independent root work, and poll with short `multi_agent_v1.wait_agent` cycles. Never use a single long blocking wait for them.
- For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long reading, testing, or review passes, and `BLOCKED: <reason>` only when it cannot progress.
- Track spawned agent names locally. Use `multi_agent_v1.wait_agent` for mailbox signals, not proof of completion. A timeout only means no new mailbox update arrived. Treat a running child as alive.
- While children run, surface the active subagent count, agent names, and latest `WORKING:` phase.
- Fallback only when the child is completed without the deliverable, ack-only after followup, explicitly `BLOCKED:`, or no longer running. Then record inconclusive and respawn a smaller `fork_context: false` task with the missing deliverable.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically in the repository's observed language, scope, and message style with only that unit's files staged.

## Codex Tool Mapping

The full workflow may mention OpenCode-style orchestration examples. In Codex, translate them to native tools:

| Workflow intent | Codex tool |
| --- | --- |
| Plan agent | `multi_agent_v1.spawn_agent({"message":"TASK: act as a planning agent. ...","fork_context":false})` |
| Search/read-only worker | `multi_agent_v1.spawn_agent({"message":"TASK: act as an explorer. ...","fork_context":false})` |
| Implementation or QA worker | `multi_agent_v1.spawn_agent({"message":"TASK: act as an implementation or QA worker. ...","fork_context":false})` |
| Final verification reviewer | `multi_agent_v1.spawn_agent({"message":"TASK: act as a rigorous reviewer. ...","fork_context":false})` |
| Wait for background result | `multi_agent_v1.wait_agent(...)` |
| Clean up finished worker | `multi_agent_v1.close_agent(...)` |

When translating `load_skills=[...]`, include the requested skill names in the spawned agent's `message`.
