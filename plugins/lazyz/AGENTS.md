# LazyZ — Agent Notes

This is the **LazyZ** ZCode plugin, a port of the OmO/Codex LazyCodex harness.

## Tooling map (Codex → ZCode)

LazyZ skills were written for Codex/OpenCode and ported. When a skill body
references a Codex-only tool, translate it to the ZCode equivalent:

| Codex / OpenCode | ZCode |
| --- | --- |
| `multi_agent_v1.spawn_agent(...)` / `spawn_agent(...)` | `Agent` tool with `subagent_type` and a self-contained `prompt` |
| `call_omo_agent(subagent_type="explore", ...)` | `Agent` with `subagent_type="Explore"` |
| `task(subagent_type="plan"/"oracle", ...)` | `Agent` with `subagent_type="general-purpose"` and a role-specific `prompt` |
| `background_output(task_id=...)` | `run_in_background: true` on the `Agent` call |
| `team_*(...)` | the `teammode` skill — leader defines 2+ members, dispatches each as a parallel `Agent` call (`run_in_background: true`), collects final-message deliverables, integrates. See the `teammode` skill and `components/teammode/scripts/team.mjs` |
| `$<skill>` (e.g. `$start-work`) | invoke the skill by name from the `/` menu, or describe the task and let the skill auto-trigger |

## Subagent wiring (ZCode limitation — read carefully)

ZCode records but does **not** execute the plugin `agents/` manifest field.
The 13 role definitions in `agents/` (`explorer`, `librarian`, `plan`, `metis`,
`momus`, `lazycodex-executor`, `lazycodex-worker-high`, `lazycodex-worker-medium`,
`lazycodex-worker-low`, `lazycodex-qa-executor`, `lazycodex-code-reviewer`,
`lazycodex-gate-reviewer`, `lazycodex-clone-fidelity-reviewer`) are therefore
**not** loaded automatically from the plugin.

Two ways to make them available as `subagent_type` values in the `Agent` tool:

1. **User-level install (recommended, works today):** copy or symlink the
   `agents/*.md` files into `~/.zcode/agents/`. ZCode discovers `.md` subagent
   definitions at that path (currently Beta). The `scripts/install-agents.sh`
   helper performs this copy.
2. **Describe the role inline:** if a role file is not installed, embed the role
   instructions directly in the `Agent` prompt instead of relying on
   `subagent_type`.

Model mapping limitation: the original Codex agents used `gpt-5.4-mini` and
`gpt-5.5` with per-agent `model_reasoning_effort` (low/medium/high/xhigh) and
`service_tier` (fast). ZCode has no reasoning-effort control and the active
provider is GLM-5.2, so all 10 agents are mapped to a single
`custom:builtin%3Azai-coding-plan:GLM-5.2` model. Expect less depth than the
Codex original on highly ambiguous briefs.

## Unsupported in ZCode (intentionally dropped)

- `PostCompact` / `SubagentStop` hooks → use `SessionStart` / `Stop` instead.
  - `PostCompact` drove cache resets in `rules`, `lsp`, `git-bash`. ZCode has no
    compaction event, so those caches are reset on `SessionStart` instead —
    slightly more overhead, no functional loss.
  - `SubagentStop` drove `lazycodex-executor-verify` (the evidence gate) and
    subagent-scoped continuation in `start-work-continuation`. ZCode has no
    subagent-stop event, so a `PostToolUse` matcher on `^(Agent|Task)$` is
    registered as a best-effort proxy. The verify component recognizes all
    four executor subagent types (`lazycodex-executor` plus the
    `lazycodex-worker-high`/`-medium`/`-low` tiers) by inspecting
    `tool_input.subagent_type`. **Limitation:** ZCode's PostToolUse input
    carries no `agent_type` / `agent_id`, so the verify component keys its
    3-attempt cap on `tool_use_id` instead, and its block semantics are
    weakened to a `deny` permissionDecision. Treat the executor-verify gate
    as advisory, not enforced.
    `start-work-continuation` continues to work via the `Stop` hook and is
    now capped at `DEFAULT_MAX_CONTINUATIONS` (10) consecutive continuations
    per session to prevent unbounded loops; override or disable with
    `LAZYZ_START_WORK_MAX_CONTINUATIONS` (0 or negative = unlimited). The
    counter resets when the plan checklist completes. It cannot resume
    mid-subagent.
- `create_goal`, `create_thread`, `codex_app.*` tools → no ZCode equivalent.
- Model routing via `model-catalog.json` → configure models in ZCode settings.
- `teammode` skill → lightweight ZCode Agent-tool-based port (see `skills/teammode/SKILL.md`
  and `components/teammode/scripts/`). Upstream Codex thread APIs (`create_thread`,
  `send_message_to_thread`) have no ZCode equivalent, so members are one-shot `Agent`
  calls whose final message is the deliverable; there is no live member messaging. The
  state model, locking, worktree isolation, and merge integration are harness-agnostic
  and ported from upstream; the thread/bind/live-messaging layer is dropped.

## Downgrade compatibility (boulder.json)

`.omo/boulder.json` is a **soft, LLM-written schema** (see `docs/known-limitations.md`).
If you downgrade the plugin to a version that predates a status value (e.g. `"blocked"`
was added in the cycle/failure caps work), the older parser treats the unknown value
as `undefined`, which means `isContinuableStatus` returns `false`. The practical effect:
a `"blocked"` work becomes invisible to the resume prompt and the Stop hook will not
continue it. This is actually safe (the work stays paused), but the work will not
appear in the SessionStart "in-progress" list until you either upgrade again or
manually change the `status` in `.omo/boulder.json` back to `"active"` or `"paused"`.
The same applies to any future status addition. We do not provide a migration script
because the schema is soft; the defensive parser intentionally degrades rather than
throwing.

## Build

Local MCP servers (`codegraph`, `git_bash`, `lsp`) need `npm install && npm run build`
from this directory (Node 20+ and Bun). Remote MCP servers and all skills/hooks
work without a build.

### Runtime requirements

- **macOS / Linux**: hooks run via `sh scripts/run-hook.sh`, which resolves
  `node` and the built `dist/cli.js`. Requires Node.js 20+ on `PATH`.
- **Windows**: the root `hooks.json` currently uses the same `sh`-based wrapper.
  If `sh` is unavailable (e.g. stock cmd.exe), set up Git Bash or WSL. The
  upstream `bootstrap` component ships a PowerShell fallback
  (`components/bootstrap/scripts/bootstrap.ps1`) but the root manifest does not
  yet wire `commandWindows` — tracked for a follow-up release.
