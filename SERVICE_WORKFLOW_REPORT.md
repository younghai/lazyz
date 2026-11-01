# LazyZ Service Workflow Report

> Repository: `/Users/young2026/Downloads/personal_project/lazyz`  
> Plugin root: `plugins/lazyz/`  
> Version examined: `0.10.2`  
> Generated: `2026-07-14`

---

## Executive Summary

LazyZ is the ZCode distribution of the OmO / LazyCodex agent harness. It packages project-memory creation, decision-complete planning, durable execution, and verified completion as an installable ZCode plugin. The repository splits into:

- **The plugin itself** (`plugins/lazyz/`) — commands, skills, hooks, local MCP servers, and bundled runtime components.
- **Upstream shared packages** (`shared-skills/`, `lsp-tools-mcp/`, `prompts-core/`, `model-core/`, `rules-engine/`, `comment-checker-core/`, `utils/`) — vendored into the plugin so the distribution is self-contained.

A typical user journey is intentionally simple:

```text
/init-deep → /ulw-plan "feature" → approve plan → /start-work → review → done
```

The heavy lifting is performed by a skills layer, a lifecycle-hooks layer, and a small set of local/remote MCP tools.

---

## 1. Repository Architecture

```
lazyz/
├── plugins/lazyz/              # The ZCode plugin (installable artifact)
│   ├── .zcode-plugin/plugin.json
│   ├── .mcp.json               # MCP server declarations
│   ├── commands/               # 4 slash-command wrappers
│   ├── skills/                 # 23+ skill instruction bundles
│   ├── hooks/hooks.json        # Lifecycle hook registry
│   ├── components/             # TypeScript hook & MCP implementations
│   ├── vendor/                 # Vendored upstream packages
│   └── scripts/                # Build, sync, and diagnostic scripts
├── shared-skills/              # Cross-harness skill source bundle
├── lsp-tools-mcp/              # LSP tools as an MCP server
├── prompts-core/               # Prompt loading & model-variant routing
├── model-core/                 # Model resolution & capability detection
├── rules-engine/               # Rule discovery & AGENTS.md utilities
├── comment-checker-core/       # Comment-checker parser/runner
└── utils/                      # Shared TypeScript utilities
```

### Architectural roles

| Layer / Package | Role | Key paths |
|---|---|---|
| `plugins/lazyz/` | ZCode plugin artifact. Exposes commands, skills, hooks, MCP servers. | `.zcode-plugin/plugin.json`, `commands/`, `skills/`, `hooks/hooks.json`, `.mcp.json`, `components/`, `vendor/` |
| `shared-skills/` | Cross-harness `SKILL.md` bundle shared with OpenCode/Codex editions. | `shared-skills/skills/<name>/SKILL.md` |
| `lsp-tools-mcp/` | LSP tools packaged as a stdio MCP server. | `lsp-tools-mcp/src/tools.ts`, `src/mcp.ts` |
| `prompts-core/` | Harness-agnostic prompt loading and model-variant routing. | `plugins/lazyz/vendor/prompts-core/src/` |
| `model-core/` | Model resolution, capability detection, fallback chains. | `plugins/lazyz/vendor/model-core/src/` |
| `rules-engine/` | Rule discovery, matching, `AGENTS.md` context utilities. | `plugins/lazyz/vendor/rules-engine/src/` |
| `comment-checker-core/` | Comment-checker parsing and runner core. | `plugins/lazyz/vendor/comment-checker-core/src/` |
| `utils/` | Shared utilities: config loading, codegraph helpers, env expansion, git worktree, etc. | `utils/src/`, `plugins/lazyz/vendor/utils/src/` |

---

## 2. User-Facing Commands

All commands are thin markdown wrappers in `plugins/lazyz/commands/`. Each instructs ZCode to load a named skill.

| Command | Skill invoked | Purpose | Inputs | Outputs |
|---|---|---|---|---|
| `/init-deep` | `init-deep` | Hierarchical project memory through `AGENTS.md`. | `[--create-new] [--max-depth=N]` | `AGENTS.md` files across the repository |
| `/ulw-plan` | `ulw-plan` | Explore-first, decision-complete planning. | `"what to build"` | `.omo/plans/<slug>.md`, `.omo/drafts/<slug>.md` |
| `/start-work` | `start-work` | Durable plan execution with tracked progress. | `[plan-name] [--worktree <path>]` | `.omo/boulder.json`, `.omo/start-work/ledger.jsonl`, `ORCHESTRATION COMPLETE` |
| `/ulw-loop` | `ulw-loop` | Verified completion loop for open-ended, multi-goal work. | `"task" [--completion-promise=TEXT] [--strategy=reset\|continue]` | `.omo/ulw-loop/goals.json`, ledger |

### Typical workflow

```text
/init-deep
/ulw-plan "Add OAuth2 login"
    → model explores, writes plan, asks for approval
/start-work
    → executes checkboxes, runs reviews, marks complete
```

`/ulw-loop` is reserved for long-running, exploratory, or multi-goal tasks.

---

## 3. Skills Layer

Skills are markdown instruction bundles under `plugins/lazyz/skills/<name>/SKILL.md`. Many originate in `shared-skills/` or component-specific directories and are normalized by `scripts/sync-skills.mjs`.

### Core skills

| Skill | Location | Purpose | Trigger |
|---|---|---|---|
| `init-deep` | `skills/init-deep/SKILL.md` | Hierarchical `AGENTS.md` generation. | `/init-deep` command |
| `ulw-plan` | `skills/ulw-plan/SKILL.md` | Decision-complete planning (Prometheus). | `/ulw-plan` command; phrases like “plan this” |
| `start-work` | `skills/start-work/SKILL.md` | Boulder-based plan execution. | `/start-work` command |
| `ulw-loop` | `skills/ulw-loop/SKILL.md` | Durable multi-goal loop. | `/ulw-loop` command |
| `review-work` | `skills/review-work/SKILL.md` | 5-lane parallel review. | Final gate of `start-work`; explicit command |
| `remove-ai-slops` | `skills/remove-ai-slops/SKILL.md` | Behavior-preserving cleanup of AI-looking code. | “remove slop”, “clean AI code” |
| `frontend` | `skills/frontend/SKILL.md` | UI/UX/design-system discipline. | Frontend/UI/design requests |
| `programming` | `skills/programming/SKILL.md` | Strict TS/Rust/Python/Go discipline, TDD, 250 LOC ceiling. | Code edits in supported languages |
| `lsp` | `skills/lsp/SKILL.md` | LSP diagnostics, definitions, references, rename. | Auto-loaded; symbol/diagnostic questions |
| `ast-grep` | `skills/ast-grep/SKILL.md` | Structural search and rewrite. | Structural code matching requests |
| `rules` | `skills/rules/SKILL.md` | Project rule injection behavior. | User asks about rules |
| `comment-checker` | `skills/comment-checker/SKILL.md` | Responding to comment-checker hook feedback. | Auto-loaded after edit hooks |
| `git-master` | `skills/git-master/SKILL.md` | Atomic commits and git history. | Git operations |
| `debugging` | `skills/debugging/SKILL.md` | Hypothesis-driven debugging. | Debug requests |
| `teammode` | `skills/teammode/SKILL.md` | Lightweight multi-agent collaboration. | “team”, “parallel members” |

### Skill triggering mechanisms

1. **Command wrappers** explicitly name a skill (e.g., `/ulw-plan` → `ulw-plan`).
2. **ZCode auto-loads** skills whose `description` frontmatter matches the prompt.
3. **Hooks inject skill directives**:
   - `ultrawork` UserPromptSubmit hook injects the ultrawork directive when the prompt contains “ultrawork” / “ulw”.
   - `ulw-loop` UserPromptSubmit hook steers loop goals.
   - `rules` SessionStart/UserPromptSubmit hooks inject project rules.
4. **Post-tool hooks** surface feedback that loads `comment-checker`, `lsp`, or `rules` guidance after edits.

At build time, `sync-skills.mjs` injects a ZCode-specific “Harness Tool Compatibility” block that maps upstream `call_omo_agent` / `task` / `spawn_agent` examples to ZCode’s native `Agent` tool.

---

## 4. Lifecycle Hooks

Hooks are declared in `plugins/lazyz/hooks/hooks.json`. Each hook command is wrapped by `scripts/run-hook.sh`, which verifies Node.js 20+ and the presence of the component’s prebuilt `dist/cli.js`.

### Hook inventory

| ZCode Event | Component | Matcher | Purpose |
|---|---|---|---|
| **SessionStart** | `bootstrap` | — | Provisions LazyZ runtime dependencies if not already done for this version. |
| **SessionStart** | `codegraph` | — | Checks CodeGraph initialization; spawns background worker if needed. |
| **SessionStart** | `rules` | — | Loads project rules into context. |
| **SessionStart** | `telemetry` | — | Emits the daily-active telemetry event (at most once per UTC day). |
| **SessionStart** | `work-status` | — | Resume prompts, init-deep suggestion, local MCP build-missing warning, manual-QA notice. |
| **SessionStart** | `migrate-codex-config.mjs` | — | Migrates legacy Codex config. |
| **UserPromptSubmit** | `ultrawork` | — | Injects the ultrawork directive when prompt mentions ultrawork/ulw. |
| **UserPromptSubmit** | `ulw-loop` | — | Steers ulw-loop goals; optionally includes ultrawork directive. |
| **UserPromptSubmit** | `rules` | — | Re-injects project rules for the current prompt. |
| **PreToolUse** | `git-bash` | `^Bash$` | Recommends the `git_bash` MCP for git shell commands. |
| **PostToolUse** | `comment-checker` | `Edit\|Write\|ApplyPatch` | Runs comment-checker on edited files; blocks if warnings found. |
| **PostToolUse** | `lsp` | `Edit\|Write\|ApplyPatch` | Runs LSP diagnostics on mutated files; blocks on errors. |
| **PostToolUse** | `rules` | `Edit\|Write\|ApplyPatch` | Matches file-specific project rules after edits. |
| **PostToolUse** | `codegraph` | `mcp__codegraph__.*` | Provides CodeGraph guidance after codegraph tool use. |
| **PostToolUse** | `lazycodex-executor-verify` | `Agent\|Task` | Verifies executor evidence after subagent stops. |
| **Stop** | `start-work-continuation` | — | If `.omo/boulder.json` has remaining work, blocks stop and injects continuation directive. |

The aggregate registry mounts **13 logical hook entries** across **5 ZCode events**.

---

## 5. MCP Servers

MCP servers are declared in `plugins/lazyz/.mcp.json`.

| Server | Type | Purpose |
|---|---|---|
| `grep_app` | Remote | Zero-config web search. |
| `context7` | Remote | Zero-config documentation context. |
| `codegraph` | Local (`components/codegraph/dist/serve.js`) | Code-graph queries. `required: false`. |
| `git_bash` | Local (`vendor/git-bash-mcp/dist/cli.js`) | Git-aware bash execution. `required: false`. |
| `lsp` | Local (`vendor/lsp-daemon/dist/cli.js`) | Language-server tools. `required: false`. |

Local servers ship prebuilt `dist/` files. If they are missing, the `work-status` SessionStart hook warns once per day.

---

## 6. Service Data Flow

A user request moves through the following stages:

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  User prompt    │────▶│  Command wrapper │────▶│  Skill loaded       │
│  (/ulw-plan …)  │     │  (commands/*.md) │     │  (skills/*/SKILL.md)│
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                          │
┌─────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Context injection (SessionStart / UserPromptSubmit hooks)               │
│  • rules: project rules from AGENTS.md / instruction files               │
│  • ultrawork / ulw-loop: directive injection                             │
│  • work-status: resume / suggestion / build-missing notices              │
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Exploration / planning / execution                                      │
│  • Native tools: Read, Grep, Glob, Bash, Agent, Edit, Write             │
│  • MCP tools: codegraph_explore, lsp_*, grep_app, git_bash              │
│  • Helpers: ast_grep_helper.py, scripts/scaffold-plan.mjs               │
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Approval gate (ulw-plan)                                                │
│  Writes draft + plan, presents brief, waits for explicit approval.       │
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Execution (start-work)                                                  │
│  Reads .omo/boulder.json + selected plan.                                │
│  For each checkbox: dispatch parallel Agent subagents, verify with tests │
│  + manual QA, append evidence to .omo/start-work/ledger.jsonl.          │
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Continuation (Stop hook)                                                │
│  start-work-continuation checks .omo/boulder.json.                       │
│  If work remains, blocks stop and re-injects continuation directive.     │
│  Default cap: 10 continuations/session (LAZYZ_START_WORK_MAX_CONTINUATIONS).│
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Verification loops                                                      │
│  • review-work: 5-lane parallel review                                   │
│  • debugging audit                                                       │
│  • remove-ai-slops / programming quality gates                           │
└────────────────────────────────────────────────────────────────────────┘
│
▼
┌────────────────────────────────────────────────────────────────────────┐
│  Completion                                                              │
│  Prints ORCHESTRATION COMPLETE when all checkboxes and review gates pass.│
└────────────────────────────────────────────────────────────────────────┘
```

### Continuation mechanism

When a model turn ends, the `start-work-continuation` Stop hook inspects `.omo/boulder.json`. If unchecked work remains, it returns `decision: block` and a continuation directive. This allows multi-hour plans to proceed across multiple ZCode turns without manual restarts, up to the configurable per-session cap.

---

## 7. Build & Deployment Workflow

### End-user installation

No build is required. The plugin ships with prebuilt `dist/` for all hooks and local MCP servers.

```bash
zcode plugin marketplace add https://github.com/code-yeongyu/lazyz
zcode plugin add lazyz@lazyz
```

Requirements:

- ZCode on macOS or Linux (Windows not supported in this release).
- Node.js 20+ on `PATH`.

### Build from source

```bash
cd plugins/lazyz
npm install
npm run build
```

Requires **Bun** in addition to Node.js 20+.

### Build pipeline

The `build` script runs the following steps:

| Step | Script | Purpose |
|---|---|---|
| 1. Sync version | `scripts/sync-version.mjs` | Stamps `0.10.2` into plugin and component manifests. |
| 2. Sync hook messages | `scripts/sync-hook-status-messages.mjs` | Updates `(LazyZ 0.10.2) …` status messages in all `hooks.json` files. |
| 3. Build bundled MCP runtimes | `scripts/build-bundled-mcp-runtimes.mjs` | Builds `lsp-tools-mcp`, `lsp-daemon`, `git-bash-mcp`. |
| 4. Materialize upstreams | `scripts/materialize-shared-upstreams.mjs` | No-op in LazyZ (frontend refs are pre-committed). |
| 5. Sync skills | `scripts/sync-skills.mjs` | Copies component + shared skills into `plugins/lazyz/skills/`, injects ZCode compatibility guidance and `agents/openai.yaml` display metadata. |
| 6. Build components | `scripts/build-components.mjs` | Uses `bun build` to bundle every component’s `src/cli.ts` into `dist/cli.js`. |

### Hook launcher diagnostics

`scripts/run-hook.sh` verifies Node.js and the presence of `dist/cli.js` before running a hook. If anything is missing, it prints a diagnostic to stderr instead of failing the session.

---

## 8. Telemetry & Privacy Workflow

### Daily-active telemetry

| Attribute | Value |
|---|---|
| Event | `omo_codex_daily_active` |
| Trigger | `SessionStart` hook (`components/telemetry/`) |
| Frequency | At most once per UTC day per machine |
| Distinct ID | `sha256("omo-codex:" + hostname)` — raw hostname is not sent |
| Captured | Product/runtime metadata, OS metadata, coarse machine shape, locale, timezone, shell/terminal hints, `source`, `reason`, `day_utc` |
| **Not captured** | Prompts, transcripts, source files, file paths, tokens, API keys, hostnames, git remotes, usernames, emails, error diagnostics |
| Endpoint | PostHog (`https://us.i.posthog.com` by default) |
| State file | `$XDG_DATA_HOME/omo-codex/posthog-activity.json` or `~/.local/share/omo-codex/posthog-activity.json` |

### Opt-out controls

Before first launch:

```bash
touch ~/.omo/telemetry-disabled
```

Or via environment variables:

```bash
export OMO_CODEX_DISABLE_POSTHOG=1
export OMO_CODEX_SEND_ANONYMOUS_TELEMETRY=0
# Global variants also accepted:
export OMO_DISABLE_POSTHOG=1
export OMO_SEND_ANONYMOUS_TELEMETRY=0
```

When opted out, the telemetry component creates a no-op PostHog client and makes no network call.

### Product events

The top-level `README.md` documents an opt-in, local-only product-events mode (`LAZYZ_PRODUCT_EVENTS=1` / `OMO_PRODUCT_EVENTS=1`) that would record events such as `plan_start`, `work_complete`, `resume_prompted`, `init_deep_suggested`, and `build_missing` to `~/.lazyz/product-events.jsonl`.

**Status:** The implementation is not yet present in the codebase. `plugins/lazyz/docs/known-limitations.md` explicitly states: “Telemetry is DAU-only … Tracked for Sprint 2: opt-in (default OFF) product events.”

---

## 9. Key Operational Considerations

| Concern | Detail |
|---|---|
| Platform support | macOS and Linux only for this release. |
| Runtime dependency | Node.js 20+ must be on `PATH`; Bun is only required for source builds. |
| Self-contained install | Prebuilt `dist/` ships for all hooks and local MCP servers. |
| Continuation cap | `DEFAULT_MAX_CONTINUATIONS = 10`, overridable via `LAZYZ_START_WORK_MAX_CONTINUATIONS`. |
| Quality gates | comment-checker (post-edit warnings), lsp (post-edit errors), rules (post-edit file rules), review-work (pre-completion). |
| Manual QA channel | `start-work` expects a manual QA confirmation step for changes that cannot be verified automatically. |
| Config migration | `migrate-codex-config.mjs` SessionStart hook handles legacy Codex configs. |

---

## 10. Summary Diagram

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         ZCode Client                                  │
│  /init-deep  /ulw-plan  /start-work  /ulw-loop                       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     LazyZ Plugin (plugins/lazyz/)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Commands   │  │   Skills    │  │    Hooks    │  │ MCP servers │  │
│  │  (4 wrappers)│  │  (23+ bundles)│ │ (13 entries)│ │ (5 servers) │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Local tools   │      │  Vendored cores │      │  Remote tools   │
│ (Read, Grep,  │      │ (lsp-tools-mcp, │      │ (grep_app,      │
│  Bash, Agent) │      │  codegraph,     │      │  context7)      │
│               │      │  git-bash-mcp)  │      │                 │
└───────────────┘      └─────────────────┘      └─────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Project workspace                             │
│  AGENTS.md  .omo/plans/  .omo/boulder.json  .omo/start-work/ledger   │
└──────────────────────────────────────────────────────────────────────┘
```

---

*End of report.*
