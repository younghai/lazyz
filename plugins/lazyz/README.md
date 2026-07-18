# LazyZ

**The OmO agent harness, packaged as a ZCode plugin.**
Project memory, planning, execution, and verified completion — inside ZCode.

LazyZ is a community port of [LazyCodex](https://github.com/code-yeongyu/lazycodex)
(the Codex distribution of [OmO](https://github.com/code-yeongyu/oh-my-openagent))
to the [ZCode](https://docs.zcode.ai) client. It is not affiliated with Sisyphus
Labs; all credit for the underlying harness belongs to the OmO maintainers.

---

## What you get

| Resource | What it does |
| --- | --- |
| **Commands** (4) | `/init-deep` (hierarchical AGENTS.md), `/ulw-plan` (decision-complete planning), `/start-work` (plan execution), `/ulw-loop` (verified completion) |
| **Skills** (23) | `init-deep`, `ulw-plan`, `start-work`, `ulw-loop`, `review-work`, `debugging`, `programming`, `frontend`, `visual-qa`, `remove-ai-slops`, `ast-grep`, `lsp`/`lsp-setup`, `git-master`, `rules`, `comment-checker`, `refactor`, `coding-agent-sessions`, `ultimate-browsing`, `ulw-research`, plus `lcx-doctor` / `lcx-report-bug` / `lcx-contribute-bug-fix` |
| **Hooks** (13) | SessionStart bootstrap/codegraph/rules/telemetry, UserPromptSubmit rules/ultrawork/ulw-loop steering, PreToolUse git-bash recommendation, PostToolUse comment-checker/lsp-diagnostics/rules/codegraph guidance, Stop start-work continuation |
| **MCP servers** | `grep_app`, `context7` (remote, zero-config) + `codegraph`, `git_bash`, `lsp` (local, require build) |

## Install and start your first workflow

### Before you install

- **Supported environments:** macOS and Linux. Windows is not supported in this release.
- **Runtime:** Node.js 20 or later must be on your `PATH`. Confirm with `node --version`.
- **Privacy:** LazyZ telemetry is **OFF by default** (privacy-by-default). To opt in, run `export LAZYZ_ENABLE_TELEMETRY=1` before starting ZCode. See the [privacy section](#telemetry) for details.

### 1. Install LazyZ

1. In ZCode, open **Settings → Plugin Management → Discover**.
2. Add this repository as a marketplace (Git URL or local root).
3. Install the **lazyz** plugin from the **lazyz** marketplace.
4. Approve the hooks in the first-launch review.

```bash
zcode plugin marketplace add https://github.com/code-yeongyu/lazyz
zcode plugin add lazyz@lazyz
```

No build is needed for installation: prebuilt hooks and local MCP servers ship
with the plugin.

### 2. Run the core loop

In the project you want to work on, use the `/` menu in this order:

1. `/init-deep` — create project memory once.
2. `/ulw-plan` — turn a task into a decision-complete plan.
3. Review and approve the plan, then `/start-work` — execute it with tracked progress.

The plugin is ready when these commands appear and ZCode does not show a
`[LazyZ]` runtime diagnostic. Reserve `/ulw-loop` for long, multi-goal work.

## Start here: the first 9 skills

LazyZ ships 25 skills, but you only need 9 for the full core loop. These are
**Tier 0 + Tier 1** — the rest are specialist / research / contributor tools
that you can ignore until you need them.

| Tier | Skill | When you reach for it |
| --- | --- | --- |
| **0** | `init-deep` | Once per project, to generate the hierarchical `AGENTS.md` memory. |
| **0** | `ulw-plan` | Before any non-trivial work — turns a vague request into one decision-complete plan. |
| **0** | `start-work` | After a plan exists — executes it checkbox-by-checkbox with verified completion. |
| **0** | `ulw-loop` | For long, multi-goal work (a sprint's worth of work in one durable loop). |
| **1** | `rules` | Auto-loaded — injects your project rules into every turn. |
| **1** | `comment-checker` | Auto-loaded — flags comment slop after every edit. |
| **1** | `lsp` | Auto-loaded — diagnostics, references, symbols via language servers. |
| **1** | `review-work` | The 5-lane review gate that `start-work` runs before declaring complete. |
| **1** | `git-master` | Atomic per-unit commits during execution (a hard dependency of the loop). |

**Typical first session:** `init-deep` → `ulw-plan` → approve → `start-work`.
That is the whole core workflow. The other 16 skills (`debugging`,
`programming`, `frontend`, `refactor`, `remove-ai-slops`, `ast-grep`,
`lsp-setup`, `ulw-research`, `ultimate-browsing`, `coding-agent-sessions`,
`visual-qa`, `teammode`, `ultrawork`, and the `lcx-*` contributor tools) are
opt-in power tools.

If you skip `init-deep`, the SessionStart `work-status` hook will gently
remind you once per day per project. `ulw-plan` quality drops without the
`AGENTS.md` project memory.

### Tier system and display (platform note)

Skills *may* carry `metadata.tier` (0–4) and `metadata.advanced` in their
frontmatter. **Today, ZCode does not consume these fields for display
control**, so all 25 skills remain visible in the `/` menu regardless. The
metadata is **platform-readiness**: the moment ZCode adds tier-aware display,
LazyZ activates it with no further change.

Until then, "tiering" happens through **auto-trigger tuning**:
- Tier 0/1 skills auto-load on relevant prompts.
- Tier 2/3 skills auto-load only on specialist prompts.
- Tier 4 (`lcx-*`) had their aggressive "MUST USE" triggers removed — they
  load only on explicit request, so they no longer generate noise on
  ordinary coding work.

Tracked for: ZCode platform update. See `docs/known-limitations.md`.

## Build (not required — prebuilt dist ships with the plugin)

The plugin ships prebuilt `dist/` for all 13 hooks and the three local MCP
servers (`codegraph`, `git_bash`, `lsp`). After install, everything works with
just Node.js 20+ on your `PATH` — no Bun, no `npm install`, no build step.

To rebuild from source (if you modify the TypeScript):

```bash
cd plugins/lazyz
npm install
npm run build
```

That rebuild requires **Node.js 20+** and **Bun**. After rebuilding, restart
ZCode so the local MCP servers reconnect.

### What gets vendored

Shared packages from the upstream OmO/LazyCodex monorepo are vendored under
`vendor/` (utils, comment-checker-core, rules-engine, telemetry-core,
lsp-daemon, lsp-core, mcp-stdio-core, lsp-tools-mcp, git-bash-mcp, model-core,
prompts-core, omo-codex) so the plugin is self-contained and builds from a
single repository checkout with no external `file:` dependencies.

### If Node.js is missing

When a hook fires and either Node.js is absent or the component was not built,
the hook prints a diagnostic message to stderr instead of failing silently,
telling you exactly what to install or run. The hook then exits 0 so it does
not block the session.

## What changed from Codex LazyCodex

LazyZ is a port, not a fork-and-rename. These adaptations were necessary because
ZCode's extension model differs from Codex's:

- **Plugin manifest**: `.codex-plugin/plugin.json` → `.zcode-plugin/plugin.json`.
- **Hooks**: 21 per-file hook definitions → a single `hooks/hooks.json` (ZCode
  convention). Unsupported Codex events were dropped:
  - `PostCompact` (3 hooks) — not a ZCode event; their cache-reset work runs on
    the next `SessionStart` instead.
  - `SubagentStop` (2 hooks) — not a ZCode event. The `start-work` continuation
    now relies on the `Stop` hook alone (ZCode allows up to 3 continuations).
  - `PreToolUse` matcher `^create_goal$` and `PostToolUse` matcher
    `create_thread` — these match Codex-only tools that ZCode does not expose.
- **Hook variable**: `${PLUGIN_ROOT}` → `${ZCODE_PLUGIN_ROOT}`.
- **Agent roles** (`explorer`, `librarian`, `plan`, `momus`, `metis`, …): ZCode
  records the `agents` manifest field but does not execute it, so LazyZ does not
  rely on role names. Each skill's "ZCode Harness Tool Compatibility" block maps
  the old `call_omo_agent` / `task` / `spawn_agent` examples to the ZCode
  `Agent` tool with a self-contained `prompt` that describes the role.
- **`teammode` skill/component**: removed — it depends on Codex's
  `codex_app.create_thread` thread API, which ZCode has no equivalent for.
- **Model routing** (`model-catalog.json`): removed — ZCode manages model
  selection in its own settings. Skills still name models in prose; map them to
  your ZCode model configuration manually.
- **Auto-update** (`lazycodex-ai` npm version check): removed — manage updates
  through the ZCode marketplace (`zcode plugin marketplace upgrade lazyz`).

## Telemetry

LazyZ telemetry is **OFF by default** (privacy-by-default, GDPR-aligned).
No event is sent unless you explicitly opt in.

To **enable** anonymous daily-active tracking:

```bash
export LAZYZ_ENABLE_TELEMETRY=1
# or the legacy alias:
export OMO_ENABLE_TELEMETRY=1
```

When enabled, the telemetry component emits one anonymous `lazyz_daily_active`
event per UTC day per machine when the SessionStart hook runs. It uses
`sha256("lazyz:" + hostname)` as the distinct ID, disables person profiles,
and stores daily dedup state under `$XDG_DATA_HOME/lazyz/` or
`~/.local/share/lazyz/`.

Captured properties are limited to product/runtime metadata, OS metadata,
coarse machine shape, locale/timezone, shell/terminal hints, `source`,
`reason`, and `day_utc`. It does **not** send prompts, transcripts, source
files, repository contents, file paths, tokens, API keys, hostnames, Git
remotes, usernames, emails, or error diagnostics.

To **disable** (if you previously enabled it), pick whichever is easiest:

```bash
# Option A: marker file (persists across shells and restarts)
touch ~/.omo/telemetry-disabled

# Option B: environment variables
export LAZYZ_DISABLE_POSTHOG=1
# or the legacy aliases:
export OMO_CODEX_DISABLE_POSTHOG=1
export OMO_DISABLE_POSTHOG=1
```

## License

MIT, inherited from the upstream LazyCodex/OmO sources.
