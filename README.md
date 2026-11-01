# LazyZ

> **Last updated: 2026-11-01** — LazyZ 0.12.2: how·why ported; 0.12.1 poteto-mode;
> upstream omo 5.1.54 (ulw-loop spawn guards, stop-resume, ulw-execute).
> See [ZCode-native 0.11](plugins/lazyz/docs/zcode-native-0.11.md) for the
> pinned host-source basis and known limits.

**The OmO agent harness, packaged as a ZCode plugin.**
Project memory, planning, execution, and verified completion — inside ZCode.

LazyZ is a community port of [LazyCodex](https://github.com/code-yeongyu/lazycodex)
(the Codex distribution of [OmO — oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent))
to the ZCode client. Think [LazyVim](https://github.com/LazyVim/LazyVim) for
ZCode: a thin distribution layer that packages OmO's discipline agents,
parallel orchestration, skills, hooks, and verified completion as one
installable ZCode plugin.

> Not affiliated with Sisyphus Labs. All credit for the underlying harness
> belongs to the OmO maintainers.

<!-- lazyz-resource-counts:start -->
> Generated inventory: **32 skills · 13 agents · 23 hooks across 6 events · 6 MCP servers · 7 command documents**
<!-- lazyz-resource-counts:end -->

## Why LazyZ exists

LazyCodex proved that a disciplined agent harness — memory, planning,
evidence-bound execution, verified completion — turns a coding agent from a
"write some code" assistant into a "ship a complete, reviewed change" teammate.
That discipline lived only inside the Codex client.

**LazyZ brings that same discipline to ZCode.** The goal is not to clone
LazyCodex feature-for-feature — it is to give ZCode users the same
end-to-end workflow (understand → plan → execute → prove) so that ZCode
becomes a first-class home for serious agent-driven development, not just a
chat-based code editor.

The broader intent: **grow the ZCode ecosystem.** Today ZCode's plugin
marketplace is thin compared to its potential. LazyZ is a reference for what
a full-workflow plugin looks like — not a single skill or MCP server, but a
layered system of memory, planning, execution, and verification that
composes with ZCode's own capabilities. The more users install it and the
more plugin authors study it, the richer the ecosystem becomes.

## What changed from LazyCodex (and what stayed)

LazyZ is a **port**, not a rewrite. The core workflow, directives, and
evidence contracts are the same. What changed is everything that touched
Codex-specific internals:

| Area | LazyCodex (Codex) | LazyZ (ZCode) |
| --- | --- | --- |
| **Plugin manifest** | `.codex-plugin/plugin.json` | `.zcode-plugin/plugin.json` |
| **Hook events** | 7 events incl. `SubagentStop`, `PostCompact` | 6 declared ZCode events; `PostCompact` and `SubagentStop` are absent |
| **Agent runtime** | Codex `multi_agent_v1.spawn_agent` + TOML role files | ZCode `Agent` tool + enabled-plugin `.md` definitions; use `lazyz:<role>` for an unambiguous role |
| **Models** | GPT-5.5 / GPT-5.4-mini with per-agent reasoning effort | All LazyZ profiles use `model: inherit`; `thoughtLevel` applies only with an explicit selected model |
| **Hook launcher** | Direct `node` call | Direct ZCode `process` hooks: `command: "node"`, `args`, and `timeoutMs` |
| **Config** | `~/.codex/config.toml` rewriting + marketplace cache | None — ZCode manages its own plugin lifecycle |
| **Identifier** | `omo-codex` / `omo_codex_daily_active` | `lazyz` / `lazyz_daily_active` (legacy env aliases retained) |

**What is intentionally NOT ported** (ZCode has no equivalent):

- `SubagentStop` hook → unavailable. `PostToolUse` can observe an Agent tool
  result but is not a background-agent completion callback; governed
  structured execution is therefore foreground-only.
- `PostCompact` hook → unavailable. `SessionStart` `compact|clear` matchers
  perform limited cache-reset work, without promising mid-session resumption.
- Codex thread/worktree APIs → not recreated by LazyZ. The retained
  `teammode` skill uses Agent calls and local artifacts; this is distinct from
  ZCode's separately implemented `SendMessage` continuation surface.
- `create_goal` / `create_thread` / `codex_app.*` → LazyZ keeps its own
  documented file state. Native goal/memory/wiki source surfaces do not, by
  themselves, establish a plugin-call API.

## The workflow — how a task flows through LazyZ

LazyZ gives ZCode the same four-stage discipline loop that made LazyCodex
effective. Each stage is a skill + (optionally) a command, and each records
the workflow state it owns under `.omo/`. Host compaction and session recovery
remain separate behaviors with documented limits.

```
 ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Memory  │ ──▶ │  2. Plan     │ ──▶ │  3. Execute  │ ──▶ │  4. Verify   │
 │  init-deep  │     │  ulw-plan    │     │ ulw-execute  │     │  ulw-loop    │
 └─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
        │                   │                    │                     │
        ▼                   ▼                    ▼                     ▼
   AGENTS.md          .omo/plans/          .omo/boulder.json      evidence ledger
   hierarchy          decision-complete     checkbox progress      (artifacts,
   (read every        plan + approval       + Stop-hook            not claims)
   session)           gate before code      continuation
```

### Stage 1 — Project memory (`init-deep`)

Before any work, `init-deep` walks the repository, scores directories by
complexity, and generates a hierarchical `AGENTS.md` knowledge base. Every
subsequent session reads this memory, so the agent starts grounded in *your*
codebase, not a blank slate. `ulw-plan` quality drops measurably without it.

### Stage 2 — Planning (`ulw-plan`)

`ulw-plan` (the "Prometheus" consultant) is an **explore-first planner**:
it spawns parallel read-only subagents (explorer, librarian, metis, momus)
to ground the plan in the actual codebase, surfaces only the forks it
cannot resolve itself, waits for explicit approval, and only then writes a
single decision-complete plan to `.omo/plans/<slug>.md`. Each task in the
plan carries acceptance criteria, QA scenarios, and a commit instruction —
so the executor never needs to ask a follow-up question.

### Stage 3 — Execution (`ulw-execute`)

`ulw-execute` (formerly `start-work`, kept as a compatibility alias) reads the
plan, tracks progress in `.omo/boulder.json`, and executes checkboxes one by
one. The ZCode `Stop` hook can re-inject a continuation directive (with the
next checkbox and remaining count), subject to the host's three-consecutive-block
limit. It is not a general compaction or background-agent completion mechanism.
Each checkbox runs the **PIN → RED → GREEN → SURFACE → CLEAN** loop
(characterize current behavior, fail-first, smallest fix, real manual-QA
evidence, cleanup receipt). Sprint 2 added cycle/failure caps (5 cycles, 3
same-failure type) and a debugging budget so a stuck checkbox escalates
instead of looping forever.

Since 0.12.0, `ulw-loop` also polices subagent spawns itself: a Pre/PostToolUse
pair on the Agent tool (matcher `^(Agent|Task)$`) guards and records spawn
admission while a loop is running, and a Stop hook resumes a paused loop.

### Stage 4 — Verified completion (`ulw-loop`)

For open-ended, multi-goal work, `ulw-loop` runs the full loop: decompose
into goals with success criteria, execute each through start-work, capture
real evidence (HTTP transcripts, tmux captures, browser screenshots — not
"dry-run" claims), and gate completion on artifact-backed proof. The
quality gate (code review + manual QA + gate review + scope fidelity) must
all APPROVE before a goal is marked complete.

### The agent team

The four stages are powered by specialist subagents — planner,
pre-planning analyst, plan reviewer, codebase explorer, external librarian,
implementation executor, QA executor, code reviewer, gate reviewer, and
clone-fidelity reviewer — each with scoped tools (read-only reviewers vs.
write-enabled executors). Governed structured roles run foreground so the
verifier can process an actual returned result; a background launch
acknowledgement remains unresolved rather than becoming a completion receipt.

## Install and run your first workflow

### Before you install

- Node.js 20+ is required. Root hooks call Node directly and do not require a
  POSIX shell; Windows runtime behavior has not been QAed, so this is not a
  full Windows-support claim.
- Make sure Node.js 20 or later is available: `node --version`.
- LazyZ telemetry is **OFF by default** (privacy-by-default). To opt in,
  run `export LAZYZ_ENABLE_TELEMETRY=1` before starting ZCode; see the
  [privacy details](plugins/lazyz/README.md#telemetry).

### 1. Install LazyZ

Add this repository as a ZCode marketplace, then install the plugin:

```bash
zcode plugin marketplace add https://github.com/younghai/lazyz
zcode plugin add lazyz@lazyz
```

Or in ZCode, open **Settings → Plugin Management → Discover → +**, add this
repository, and install `lazyz`. Approve the requested hooks when ZCode shows
the first-launch review.

### 2. Start with one project

Open the project you want to work in, then use this sequence from the `/` menu:

1. `/init-deep` — create the project memory once.
2. `/ulw-plan` — turn the task into a reviewable plan.
3. Approve the plan, then run `/ulw-execute` (or compatibility alias
   `/start-work`) — execute it with tracked progress.

If the commands appear and no `[LazyZ]` runtime diagnostic is shown, the core
workflow is ready. Use `/ulw-loop` only for long, multi-goal work.

Full install and build instructions live in [`plugins/lazyz/README.md`](plugins/lazyz/README.md).

## Layout

```
lazyz/
├── marketplace.json                   → ZCode marketplace manifest (root)
└── plugins/lazyz/                     → the plugin itself
    ├── .zcode-plugin/plugin.json      → ZCode plugin manifest
    ├── .mcp.json                      → remote and local MCP server declarations
    ├── hooks/hooks.json               → ZCode hook declarations
    ├── skills/                        → installed workflow and specialist skills
    ├── commands/                      → explicit workflow commands
    ├── agents/                        → ZCode subagent definitions
    ├── components/                    → TypeScript sources for hooks/MCP (Bun is rebuild-only)
    ├── vendor/                        → vendored shared packages (utils, lsp-daemon, telemetry-core, ...)
    ├── scripts/                       → build & sync scripts
    └── shared/                        → shared config-loader
```

## Build

**No build required to install.** The plugin ships prebuilt `dist/` for its
declared hooks and local MCP servers. After
`zcode plugin add lazyz@lazyz`, everything works out of the box — you only
need Node.js 20+ on your `PATH` (the hooks call `node` at runtime).

To rebuild from source (only if you modify the TypeScript):

```bash
cd plugins/lazyz
npm install
npm run build
```

That rebuild requires **Bun** in addition to Node.js 20+. The installed runtime
uses prebuilt Node entrypoints; `lazyz doctor` statically checks the declared
process/args shape and payload files, but does not probe the host runtime.

## What it does

The **command layer** stays simple — canonical commands plus a compatibility
alias you invoke from
the `/` menu. The **skill layer** adds specialist judgment for the actual work.

### Commands (invoke with `/`)

| Command | Use it for |
| --- | --- |
| `/init-deep` | Hierarchical project memory through `AGENTS.md` |
| `/ulw-plan` | Decision-complete planning before code changes |
| `/ulw-execute` | Canonical approved-plan execution with Boulder progress |
| `/start-work` | Compatibility alias for `/ulw-execute` (deprecated) |
| `/ulw-loop` | Verified completion for open-ended tasks |
| `/doctor` | Installation health check (hooks, MCP, manifests) |
| `/status` | Current work status (plans, boulder progress, evidence) |

### Skills (auto-triggered by the model, or referenced inside a command)

| Skill | Use it for |
| --- | --- |
| `review-work` | Multi-angle post-implementation review |
| `remove-ai-slops` | Behavior-preserving cleanup of AI-looking code |
| `frontend` | Polished UI surfaces |
| `programming` | Strict TypeScript, Rust, Python, or Go discipline |
| `lsp` | Diagnostics, definitions, references, symbols, and renames |
| `ast-grep` | Structural search and rewrite across code |
| `rules` | Project instructions from AGENTS, rules, and instruction files |
| `benchmark-checklist` | Vet a performance number before reporting or acting on it *(LazyZ-only, from pstack)* |
| `blast-radius` | Find what a change could break and prove safety by running code *(LazyZ-only, from pstack)* |
| `poteto-mode` | pstack playbook-routing entrypoint (explicit `/poteto-mode` invocation) *(from pstack)* |
| `how` | Dissect actual runtime behavior: paths, state, failure routes *(from pstack)* |
| `why` | Investigate design intent with confidence-graded citations *(from pstack)* |

Plus: `debugging`, `visual-qa`, `git-master`, `comment-checker`, `refactor`,
`coding-agent-sessions`, `ultimate-browsing`, `ulw-research`, `lsp-setup`,
and `lcx-*` diagnostics skills.

### Product events (opt-in, local-only)

LazyZ additionally records a small set of **product events** to help
understand which features are used. Unlike the separate daily-active ping,
these are:

- **Opt-in default OFF.** Set `LAZYZ_PRODUCT_EVENTS=1` (or
  `OMO_PRODUCT_EVENTS=1`) to enable. Without this flag, nothing is recorded.
- **Local-only.** Events are written to `~/.lazyz/product-events.jsonl` on
  your machine. They are **never sent over the network**. Read them yourself
  with `cat ~/.lazyz/product-events.jsonl`, or run
  `omo-telemetry product-events --summary`.
- **Respect existing opt-out.** If you set any of the `OMO_*_DISABLE_POSTHOG`
  / `OMO_*_SEND_ANONYMOUS_TELEMETRY=0` flags (above), product events stay off
  too — even if `LAZYZ_PRODUCT_EVENTS=1`.

Recorded events: `plan_start`, `work_complete`, `resume_prompted`,
`init_deep_suggested`, `build_missing`. Each carries only the event name, a
timestamp, and a couple of coarse properties (e.g. which plan, which missing
server). No file paths, prompts, source, or identifiers beyond a daily
hashed machine id.

See the [privacy details](plugins/lazyz/README.md#telemetry) for the
daily-active event and opt-in controls.

## Changelog

### 2026-11-01 — 0.12.1 poteto-mode ported

- New skill `poteto-mode` (30 skills total): the pstack/poteto playbook
  routing entrypoint (pstack v0.15.36, MIT, poteto), explicit invocation
  only. Discipline ownership re-pointed from vibe-mode to the lazyz
  hephaestus rules; every playbook now routes to a skill/agent lazyz ships;
  the 14 upstream playbooks are bundled in `references/playbooks.md`.

### 2026-11-01 — 0.12.0 selective sync from upstream omo 5.1.54

**ulw-loop execution quality (ported from upstream 5.1.51–5.1.54):**
- `components/ulw-loop/dist` upgraded to the upstream 5.1.51+ build
  (self-contained, no new dependencies; runtime-verified — the old dist
  rejected the new hook subcommands, the new dist accepts them).
- Three new hooks with ZCode-native matchers, taking the plugin from 20 to
  **23 hooks across 6 events**:
  - `PreToolUse` on `^(Agent|Task)$` — ulw-loop spawn guard: polices subagent
    spawns while a loop is running (`pre-tool-use-spawn`).
  - `PostToolUse` on `^(Agent|Task)$` — spawn admission recording
    (`post-tool-use-spawn`).
  - `Stop` — ulw-loop resume: a paused loop continues on the next turn within
    the host's Stop continuation limit.

**start-work → ulw-execute unification:**
- The `start-work` skill and `/start-work` command are deprecated and now
  redirect to **ulw-execute** (same runtime, Boulder state, and evidence
  ledger — nothing to migrate). `/start-work` remains as a compatibility alias.

**Skill updates from upstream 5.1.54:**
- `programming` — new four-question **test authoring gate**
  (`references/testing/`: README gate + junk-classes table); per-language
  project scaffolding scripts migrated from Python to TypeScript
  (`scripts/{go,python,rust}/new-project.ts`, shared `run-tool.ts`).
- `visual-qa` — new **machine pre-check** section (frontend detect SDK run
  before human reviewers: contrast, type scale, overflow stress test),
  checklist additions **A13** (spacing rhythm), **B8** (type scale floor),
  and a refined A3 measure rule.

**Deliberate divergence from upstream:**
- `codegraph` MCP/component/hooks **kept** (upstream removed it): local
  sessions show real `mcp__codegraph__` tool usage.
- `benchmark-checklist` and `blast-radius` skills (ported 2026-10-18 from
  pstack, MIT — recorded in the 0.11.0 publication-repairs changelog entry)
  remain LazyZ-only additions.
- `poteto-mode` was intentionally not ported at 0.12.0 (vibe-mode discipline
  dependency); ported in 0.12.1 with discipline re-pointed to hephaestus —
  see the 0.12.1 entry below.
- `ultimate-browsing` now points interactive browser work at ZCode's built-in
  **browser-use plugin** skills (`control-browser`, `web-gui-tester`) first.

**Operational fixes during this release:**
- Restored the `lazyz@lazyz` plugin registration in `~/.zcode/cli/config.json`
  after a cache-directory move caused ZCode to unregister the plugin.
- Previous 0.11.0 cache preserved at `~/.zcode-backup/lazyz-0.11.0` for rollback.

### 2026-10-07 — 0.11.0 ZCode-native contract update

- Plugin-agent discovery is documented against the public ZCode 3.14.3 source:
  enabled plugin profiles load with collision-safe `lazyz:<role>` names, while
  `~/.zcode/agents/` remains an older-host compatibility option.
- Root hooks use direct Node `process` declarations. The documented contract is
  20 hooks across six events, with `compact|clear` SessionStart reset entries.
- Governed structured Agent work stays foreground because `async_launched` is a
  launch acknowledgement, not an observable plugin completion receipt.
- Local MCP declarations use documented stdio fields only. Node is runtime
  required; Bun remains rebuild-only. Windows shell removal is not Windows QA.
- Added [ZCode-native 0.11](plugins/lazyz/docs/zcode-native-0.11.md), including
  pinned official docs/source links, adoption boundaries, and explicit unknowns.

### 2026-07-19 — UX design review & waterfall documentation

**UX & brand consistency:**
- **Count unification** across all surfaces (25 skills, 16 hooks, 5 MCP, 4
  commands, 10 agents). `known-limitations.md` corrected.
- **Version unified** to 0.10.2 (README changelog was v0.1.1).
- **Skill descriptions** — Codex residue removed from 9 skills
  (comment-checker, lsp, rules, ultrawork, coding-agent-sessions, lcx-* x3,
  lsp-setup). init-deep description gained natural-language triggers.
- **Session hook messages** redesigned — "feel free to dismiss" removed
  (5 instances, cry-wolf pattern), internal terms abstracted, tier hierarchy
  clarified (💡 info / ⏳ action / ⛔ blocked).
- **Brand unification** — `[omo-bootstrap]` → `[LazyZ]` (7 stderr sites),
  doctor hint updated, `author.url` fixed.
- **Telemetry policy alignment** — `plugins/lazyz/README.md` rewritten to
  opt-in (was opt-out, contradicting root README).

**Documentation:**
- **Waterfall documentation** added — 11 phases, 20 markdown files under
  `docs/waterfall/`. Covers planning → requirements → design → implementation
  → QA → deployment → maintenance → review → ops runbook → monitoring.
  See [docs/waterfall/README.md](docs/waterfall/README.md).

### 2026-07-17 — Data governance & operations hardening

**Security & privacy (P0–P1):**
- **Telemetry is now opt-in** (OFF by default). Set `LAZYZ_ENABLE_TELEMETRY=1`
  to enable. Aligns with GDPR privacy-by-default.
- **`.omo/` directory permissions** hardened to `0o700` across all 13 state
  creation sites (evidence, ledger, counters, telemetry). Shared hosts and CI
  runners can no longer read another user's evidence files.
- **Secret redaction scrubber** (`scripts/redact-secrets.mjs`): scans
  `.omo/evidence/` and `ledger.jsonl` for API keys, tokens, JWTs, connection
  strings. Run with `--fix` to mask in place; without `--fix` acts as a CI
  gate (exit 1 on findings).

**Reliability (P0–P2):**
- **Bootstrap ZCode manifest fix**: `readPluginVersion` now reads
  `.zcode-plugin/plugin.json` (was `.codex-plugin/` only) and accepts
  `ZCODE_PLUGIN_ROOT` (was `PLUGIN_ROOT` only). Bootstrap was permanently
  no-op before this fix.
- **Boulder parser sync CI gate**: CI step `Verify boulder parser sync`
  diffs `BoulderWorkStatus` between the two independent parsers and fails
  on divergence.
- **Vendor boulder-reader sync**: vendor copy aligned with main (Sprint 2
  `blocked` status + `fail_count`).
- **Atomic write for `.lazyz-prompts.json`**: switched from direct
  `writeFileSync` to temp+rename to prevent lost-update races.

**Operations (P3):**
- **Evidence retention pruner** (`scripts/prune-evidence.mjs`): removes
  evidence files older than 30 days or over 100 MB total; tail-truncates
  ledger files to 10,000 lines.
- **Codegraph timeout tuning**: SessionStart timeout set to 15s (detached
  worker returns immediately; only the 2s status probe is synchronous).
- **`schema_version` documented as cosmetic**: no migration runs on bump;
  inline warning added to SKILL.md.
- **Downgrade compatibility**: AGENTS.md documents that a plugin downgrade
  may make `"blocked"` status works invisible (safe but silent).
- **SessionStart latency**: documented in known-limitations.md (6 hooks,
  sequential; tracked for ZCode concurrency investigation).

### 2026-07-12 — Initial public release (v0.10.2)

- ZCode plugin port of the OmO/LazyCodex harness.
- 25 skills, 10 agents, 16 hooks, 5 MCP servers.
- Project memory (`init-deep`), planning (`ulw-plan`), execution
  (`start-work`), verified completion (`ulw-loop`).
- Prebuilt `dist/` for install-and-go (no Node/Bun build required).
- Sprint 2: boulder.json `blocked` status + `fail_count`, cycle/failure
  caps, debugging budget, Manual-QA pre-notification gate.

## License

MIT, inherited from the upstream LazyCodex/OmO sources.
