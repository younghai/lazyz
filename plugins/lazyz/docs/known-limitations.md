# LazyZ — Known Limitations

What LazyZ does not yet do, why, and where it is tracked.

---

## Compaction reset is not guaranteed work resumption

**Symptom.** When the model context is compacted **mid-session**, an
in-progress `start-work` plan is NOT automatically re-injected.

**Why.**

1. ZCode has no `PostCompact` hook event (only `SessionStart`,
   `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`,
   `PostToolUseFailure`, `Stop`).
2. LazyZ has `SessionStart` `compact|clear` matchers for selected cache-reset
   work, but those matchers are not a `PostCompact` event and do not provide a
   subagent-completion or plan-resumption receipt.
3. The `Stop` event can continue at most three consecutive times. It is a
   bounded host loop, not a persistent completion/security boundary.

**What DOES work.**

- Close + reopen session → `work-status` shows resume prompt. ✅
- "Next day, reopen" → same path. ✅
- Explicit `/ulw-execute` (or `/start-work`) → reads the tracked plan state. ✅

**Workaround for mid-session compaction.** Run `/ulw-execute <plan-name>`
explicitly.

**Limit.** A stronger recovery claim needs an official host event or documented
completion API; LazyZ does not infer one from unrelated host source surfaces.

---

## Tier display and per-skill hiding (platform-dependent)

**Symptom.** The `/` menu can show every installed skill; no built-in hide for
`lcx-*` is documented here.

**Why.** ZCode executes only `commands`/`skills`/`hooks`/`mcpServers`/
`agents`. SKILL.md frontmatter has no standard `tier`/`visible`/`hidden`
field ZCode consumes for display.

**What we did (Sprint 1).**

- `metadata.tier`/`metadata.advanced` are platform-readiness metadata.
- `lcx-*` descriptions had "MUST USE" triggers removed → no auto-load noise.
- README "first 9 skills" curation + `work-status` init-deep auto-suggestion
  route new users to the Tier 0/1 core.
- Honest roadmap note in README.

**Tracked for:** ZCode platform update.

---

## `ulw-loop` final completion requires current, bound evidence

Use the bundled `lazyz ulw-loop` surface; a separate `omo` executable is not
required. Run `quality-context --goal-id <id> --json` to obtain the actual plan,
criteria and current source binding before constructing final quality evidence.

Final checkpoints reject historical unbound quality JSON, stale source identities,
unknown/duplicate criteria, unsuccessful executions and unsafe artifact paths.
The JSON binds claims to files; it does not authenticate reviewer identities or
prove a submitted command was executed by a trusted external runner.

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

## Local MCP startup is host-controlled

**Scope.** LazyZ declares `codegraph`, `git_bash`, `lsp`, and `ast_grep` as
enabled Node stdio servers with `timeoutMs: 30000`. It does not use
undocumented `required`, `defer`, or lazy-load fields.

**Limit.** A declared local process can still fail to start when Node or a
prebuilt entrypoint is unavailable. `lazyz doctor` can statically inspect the
manifest and payload; it is not a live host/MCP connection probe.

---

## Telemetry is DAU-only

**Symptom.** One event/machine/day. No product analytics.

**Why.** Privacy stance (inherited OmO).

**Tracked for Sprint 2:** opt-in (default OFF) product events — plan_start,
work_complete, resume_prompted, build_missing, approval_bypassed. Deferred
from Sprint 1 (T7).

---

## SessionStart hook latency

**Symptom.** Five unfiltered SessionStart hooks run before the first prompt:
bootstrap (30s budget), codegraph (15s), rules (10s), telemetry (5s), and
work-status (10s). Two additional `compact|clear` entries perform selected
cache resets when those sources occur. On large monorepos,
codegraph provisioning and rule loading can take several seconds each.

**Why.** ZCode executes SessionStart hooks in the order declared in
`hooks/hooks.json`. We have no documented confirmation that ZCode
parallelizes hooks within an event — so we assume sequential execution.

**What we do.** Each declared process hook has an independent host timeout.
There is no documented hook-concurrency guarantee in the reviewed source.
Initialized/cooldown/locked CodeGraph projects can skip process sweeping.
Transcript lookup is bounded to the latest 1 MiB, so very old injection markers
can fall outside the lookup window. A launcher structure count such as
"two Node processes to one" is not a measured end-to-end service-time claim.

**Tracked for:** investigate ZCode's hook concurrency model. If parallel
execution is supported, assess whether the five hooks can run concurrently.
If not, assess only documented lifecycle/configuration options; LazyZ does not
declare an unsupported `defer` or lazy-load field.
