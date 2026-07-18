# LazyZ — Known Limitations

What LazyZ does not yet do, why, and where it is tracked.

---

## Mid-session compaction does not auto-resume work (Sprint 1 scope)

**Symptom.** When the model context is compacted **mid-session**, an
in-progress `start-work` plan is NOT automatically re-injected.

**Why.**

1. ZCode has no `PostCompact` hook event (only `SessionStart`,
   `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`,
   `PostToolUseFailure`, `Stop`).
2. The `start-work-continuation` `Stop` hook **suppresses itself** on
   compaction/context-pressure markers (by design — do not fight an
   exhausted context).
3. The `work-status` SessionStart hook only fires on a **new session**.

**What DOES work.**

- Close + reopen session → `work-status` shows resume prompt. ✅
- "Next day, reopen" → same path. ✅
- Explicit `$start-work` → resumes from `.omo/boulder.json`. ✅

**Workaround for mid-session compaction.** Run `$start-work <plan-name>`
explicitly.

**Tracked for Sprint 2.** A `UserPromptSubmit`-based compaction detector
was deferred (would push `work-status` from 🟢 to 🟡, breaking the Sprint 1
timeline invariant).

---

## Tier display and per-skill hiding (platform-dependent)

**Symptom.** The `/` menu shows all 25 skills; no built-in hide for `lcx-*`.

**Why.** ZCode executes only `commands`/`skills`/`hooks`/`mcpServers`/
`agents`. SKILL.md frontmatter has no standard `tier`/`visible`/`hidden`
field ZCode consumes for display.

**What we did (Sprint 1).**

- `metadata.tier`/`metadata.advanced` recorded in all 23 SKILL.md
  frontmatters (platform-readiness).
- `lcx-*` descriptions had "MUST USE" triggers removed → no auto-load noise.
- README "first 9 skills" curation + `work-status` init-deep auto-suggestion
  route new users to the Tier 0/1 core.
- Honest roadmap note in README.

**Tracked for:** ZCode platform update.

---

## `ulw-loop` hard-depends on the `omo` CLI

**Symptom.** Without `omo` on PATH, `ulw-loop` falls back to
`bootstrap-notepad.md` (degraded).

**Workaround.** Prefer `start-work` for single-plan work; use `ulw-loop`
only when `omo` is installed.

**Tracked for:** future lightweight mode (deferred — PM dropped J).

---

## Soft state schema (start-work family)

**Symptom.** `.omo/boulder.json`, plan markdown, ledger.jsonl are LLM-written
→ fields drift.

**What we do.** All readers are defensive; `work-status` returns `degraded`
snapshots instead of throwing on parse failure.

**`schema_version` is a documentation field, not a migration gate.** The
`schema_version` key in `boulder.json` is **not read by any parser** — no
version branch or automatic migration runs on bump. It exists only so humans
and tooling can tell which shape a file is expected to have. Do not assume
that incrementing it triggers a migration; there is no v1→v2 migration code.
Compare with `ulw-loop`'s `goals.json`, which *does* enforce `version: 1`
and auto-migrates legacy aggregate objectives (`plan-io.ts`). Bringing
`boulder.json` to the same standard is tracked below.

**Tracked for:** optional TS writer for boulder.json (future sprint).

---

## Local MCP servers silently degrade if unbuilt

**Symptom.** `codegraph`/`git_bash`/`lsp` are `required: false` → silent
skip if unbuilt.

**Fix (Sprint 1).** `work-status` SessionStart hook warns 1×/day when a
`required: false` server's `dist/` is missing.

---

## Telemetry is DAU-only

**Symptom.** One event/machine/day. No product analytics.

**Why.** Privacy stance (inherited OmO).

**Tracked for Sprint 2:** opt-in (default OFF) product events — plan_start,
work_complete, resume_prompted, build_missing, approval_bypassed. Deferred
from Sprint 1 (T7).

---

## SessionStart hook latency

**Symptom.** Six SessionStart hooks run before the first prompt: bootstrap
(60s budget), codegraph (60s budget), rules (10s), telemetry (5s),
work-status (10s), migrate-codex-config (10s). On large monorepos,
codegraph provisioning and rule loading can take several seconds each.

**Why.** ZCode executes SessionStart hooks in the order declared in
`hooks/hooks.json`. We have no documented confirmation that ZCode
parallelizes hooks within an event — so we assume sequential execution.

**What we do.** Each hook has an independent timeout and degrades to
`exit 0` (no-op) on failure, so one slow hook does not block the others
indefinitely. `run-hook.sh` wraps every hook with a diagnostic on stderr.

**Tracked for:** investigate ZCode's hook concurrency model. If parallel
execution is supported, split the six hooks into independent groups.
If not, consider lazy-loading codegraph (defer to first use rather than
SessionStart) and caching rule injection more aggressively.
