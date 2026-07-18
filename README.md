# LazyZ

> **Last updated: 2026-07-17** — telemetry switched to opt-in (OFF by default);
> bootstrap ZCode manifest fix; data governance hardening (13 items).
> See [Changelog](#changelog) below.

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
| **Hook events** | 7 events incl. `SubagentStop`, `PostCompact` | 5 ZCode events; the two missing ones are best-effort proxied (see below) |
| **Agent runtime** | Codex `multi_agent_v1.spawn_agent` + TOML role files | ZCode `Agent` tool + `.md` subagent definitions installed to `~/.zcode/agents/` |
| **Models** | GPT-5.5 / GPT-5.4-mini with per-agent reasoning effort | Mapped to the ZCode provider (GLM-5.2 today); reasoning-effort control is unavailable |
| **Hook launcher** | Direct `node` call | `scripts/run-hook.sh` wrapper that gates on Node + dist presence, degrades to `exit 0` so a missing build never blocks your session |
| **Config** | `~/.codex/config.toml` rewriting + marketplace cache | None — ZCode manages its own plugin lifecycle |
| **Identifier** | `omo-codex` / `omo_codex_daily_active` | `lazyz` / `lazyz_daily_active` (legacy env aliases retained) |

**What is intentionally NOT ported** (ZCode has no equivalent):

- `SubagentStop` hook → the executor-verify evidence gate is wired to
  `PostToolUse` on `Agent`/`Task` as a best-effort proxy. It is advisory, not
  session-blocking.
- `PostCompact` hook → cache resets that fired on compaction now fire on
  `SessionStart` instead (slightly more overhead, no functional loss).
- `teammode` skill → depends on Codex's thread API; left in vendor for a
  future ZCode equivalent.
- `create_goal` / `create_thread` / `codex_app.*` tools → no ZCode analog;
  `ulw-loop` uses its own file-based state (`.omo/ulw-loop/`) instead.

## The workflow — how a task flows through LazyZ

LazyZ gives ZCode the same four-stage discipline loop that made LazyCodex
effective. Each stage is a skill + (optionally) a command, and each hands
off durable state through `.omo/` so nothing is lost across sessions or
context compaction.

```
 ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Memory  │ ──▶ │  2. Plan     │ ──▶ │  3. Execute  │ ──▶ │  4. Verify   │
 │  init-deep  │     │  ulw-plan    │     │  start-work  │     │  ulw-loop    │
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

### Stage 3 — Execution (`start-work`)

`start-work` reads the plan, tracks progress in `.omo/boulder.json`, and
executes checkboxes one by one. The ZCode `Stop` hook re-injects the
continuation directive (with the next checkbox and remaining count) so the
agent resumes automatically after each turn — durable across compaction.
Each checkbox runs the **PIN → RED → GREEN → SURFACE → CLEAN** loop
(characterize current behavior, fail-first, smallest fix, real manual-QA
evidence, cleanup receipt). Sprint 2 added cycle/failure caps (5 cycles, 3
same-failure type) and a debugging budget so a stuck checkbox escalates
instead of looping forever.

### Stage 4 — Verified completion (`ulw-loop`)

For open-ended, multi-goal work, `ulw-loop` runs the full loop: decompose
into goals with success criteria, execute each through start-work, capture
real evidence (HTTP transcripts, tmux captures, browser screenshots — not
"dry-run" claims), and gate completion on artifact-backed proof. The
quality gate (code review + manual QA + gate review + scope fidelity) must
all APPROVE before a goal is marked complete.

### The agent team

The four stages are powered by 10 specialist subagents — planner,
pre-planning analyst, plan reviewer, codebase explorer, external librarian,
implementation executor, QA executor, code reviewer, gate reviewer, and
clone-fidelity reviewer — each with scoped tools (read-only reviewers vs.
write-enabled executors). They run as parallel ZCode `Agent` calls, and a
`lazycodex-executor-verify` hook checks that every executor claim carries
real evidence before it is accepted.

## Install and run your first workflow

### Before you install

- Use ZCode on macOS or Linux. Windows is not supported in this release.
- Make sure Node.js 20 or later is available: `node --version`.
- LazyZ telemetry is **OFF by default** (privacy-by-default). To opt in,
  run `export LAZYZ_ENABLE_TELEMETRY=1` before starting ZCode; see the
  [privacy details](plugins/lazyz/README.md#telemetry).

### 1. Install LazyZ

Add this repository as a ZCode marketplace, then install the plugin:

```bash
zcode plugin marketplace add https://github.com/code-yeongyu/lazyz
zcode plugin add lazyz@lazyz
```

Or in ZCode, open **Settings → Plugin Management → Discover → +**, add this
repository, and install `lazyz`. Approve the requested hooks when ZCode shows
the first-launch review.

### 2. Start with one project

Open the project you want to work in, then use this sequence from the `/` menu:

1. `/init-deep` — create the project memory once.
2. `/ulw-plan` — turn the task into a reviewable plan.
3. Approve the plan, then run `/start-work` — execute it with tracked progress.

If the commands appear and no `[LazyZ]` runtime diagnostic is shown, the core
workflow is ready. Use `/ulw-loop` only for long, multi-goal work.

Full install and build instructions live in [`plugins/lazyz/README.md`](plugins/lazyz/README.md).

## Layout

```
lazyz/
├── marketplace.json                   → ZCode marketplace manifest (root)
└── plugins/lazyz/                     → the plugin itself
    ├── .zcode-plugin/plugin.json      → ZCode plugin manifest
    ├── .mcp.json                      → MCP servers (grep_app, context7 remote + codegraph, git_bash, lsp local)
    ├── hooks/hooks.json               → 16 hooks across 5 ZCode events
    ├── skills/                        → 25 skills (init-deep, ulw-plan, start-work, ulw-loop, ...)
    ├── commands/                      → 4 commands (/init-deep, /ulw-plan, /start-work, /ulw-loop)
    ├── agents/                        → 10 ZCode subagent definitions (explorer, planner, reviewers, ...)
    ├── components/                    → TypeScript sources for hooks/MCP (built with bun)
    ├── vendor/                        → vendored shared packages (utils, lsp-daemon, telemetry-core, ...)
    ├── scripts/                       → build & sync scripts + run-hook.sh (hook diagnostics wrapper)
    └── shared/                        → shared config-loader
```

## Build

**No build required to install.** The plugin ships prebuilt `dist/` for all 16
hooks and the three local MCP servers (`codegraph`, `git_bash`, `lsp`). After
`zcode plugin add lazyz@lazyz`, everything works out of the box — you only
need Node.js 20+ on your `PATH` (the hooks call `node` at runtime).

To rebuild from source (only if you modify the TypeScript):

```bash
cd plugins/lazyz
npm install
npm run build
```

That rebuild requires **Bun** in addition to Node.js 20+. If the prebuilt
`dist/` is ever missing or stale, the hook launcher (`scripts/run-hook.sh`)
prints a diagnostic to stderr telling you exactly what to run.

## What it does

The **command layer** stays simple — four explicit commands you invoke from
the `/` menu. The **skill layer** adds specialist judgment for the actual work.

### Commands (invoke with `/`)

| Command | Use it for |
| --- | --- |
| `/init-deep` | Hierarchical project memory through `AGENTS.md` |
| `/ulw-plan` | Decision-complete planning before code changes |
| `/start-work` | Durable plan execution with Boulder progress |
| `/ulw-loop` | Verified completion for open-ended tasks |

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

### 2026-07-12 — Initial public release (v0.1.1)

- ZCode plugin port of the OmO/LazyCodex harness.
- 25 skills, 10 agents, 16 hooks, 5 MCP servers.
- Project memory (`init-deep`), planning (`ulw-plan`), execution
  (`start-work`), verified completion (`ulw-loop`).
- Prebuilt `dist/` for install-and-go (no Node/Bun build required).
- Sprint 2: boulder.json `blocked` status + `fail_count`, cycle/failure
  caps, debugging budget, Manual-QA pre-notification gate.

## License

MIT, inherited from the upstream LazyCodex/OmO sources.
