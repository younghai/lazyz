# LazyZ

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

## Install and run your first workflow

### Before you install

- Use ZCode on macOS or Linux. Windows is not supported in this release.
- Make sure Node.js 20 or later is available: `node --version`.
- LazyZ sends one anonymous daily-active event by default. To opt out before
  first launch, run `touch ~/.omo/telemetry-disabled`; see the
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
├── .agents/plugins/marketplace.json   → ZCode marketplace manifest
└── plugins/lazyz/                     → the plugin itself
    ├── .zcode-plugin/plugin.json      → ZCode plugin manifest
    ├── .mcp.json                      → MCP servers (grep_app, context7 remote + codegraph, git_bash, lsp local)
    ├── hooks/hooks.json               → 13 hooks across 5 ZCode events
    ├── skills/                        → 25 skills (init-deep, ulw-plan, start-work, ulw-loop, ...)
    ├── commands/                      → 4 commands (/init-deep, /ulw-plan, /start-work, /ulw-loop)
    ├── components/                    → TypeScript sources for hooks/MCP (built with bun)
    ├── vendor/                        → vendored shared packages (utils, lsp-daemon, telemetry-core, ...)
    ├── scripts/                       → build & sync scripts + run-hook.sh (hook diagnostics wrapper)
    └── shared/                        → shared config-loader
```

## Build

**No build required to install.** The plugin ships prebuilt `dist/` for all 13
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
daily-active event and opt-out controls.

## License

MIT, inherited from the upstream LazyCodex/OmO sources.
