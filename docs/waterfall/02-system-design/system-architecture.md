# System Architecture

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Overall Structure

```
lazyz/
├── marketplace.json                   → ZCode marketplace manifest (root)
└── plugins/lazyz/                     → the plugin itself
    ├── .zcode-plugin/plugin.json      → ZCode plugin manifest
    ├── .mcp.json                      → 5 MCP servers
    ├── hooks/hooks.json               → 16 hooks across 5 ZCode events
    ├── skills/                        → 25 skills
    ├── commands/                      → 4 commands
    ├── agents/                        → 10 ZCode subagent definitions
    ├── components/                    → 13 TypeScript components (prebuilt dist)
    ├── vendor/                        → 13 vendored packages
    ├── scripts/                       → build/sync/redact/prune/install scripts
    └── shared/                        → shared config-loader
```

## 2. Component Layers

### 2.1 Skill Layer (25)
Triggered by natural language from the user/model. 4 core (init-deep, ulw-plan, start-work, ulw-loop) + 21 specialist skills.

### 2.2 Hook Layer (16)
TypeScript components registered on 5 ZCode events (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop).

| Event | Hook count | Key components |
| --- | --- | --- |
| SessionStart | 6 | bootstrap, codegraph, rules, telemetry, work-status, migrate-codex-config |
| UserPromptSubmit | 3 | ultrawork, ulw-loop, rules |
| PreToolUse | 1 | git-bash |
| PostToolUse | 5 | comment-checker, lsp, rules, codegraph, lazycodex-executor-verify |
| Stop | 1 | start-work-continuation |

### 2.3 MCP Layer (5)
| Server | Type | Purpose |
| --- | --- | --- |
| grep_app | Remote | GitHub code search |
| context7 | Remote | Library docs |
| codegraph | Local | Code graph exploration |
| git_bash | Local | Windows Git Bash |
| lsp | Local | Language server diagnostics |

### 2.4 Agent Layer (10)
Subagents invoked via the ZCode Agent tool. Installed to `~/.zcode/agents/`.

| Agent | Role | Permissions |
| --- | --- | --- |
| explorer | Codebase search | read-only |
| librarian | External OSS/docs research | read-only |
| plan | Strategic planning | plan file write only |
| metis | Pre-planning analysis | read-only |
| momus | Plan review | read-only |
| lazycodex-executor | Implementation | Edit/Write/Bash |
| lazycodex-qa-executor | QA execution | Write/Bash |
| lazycodex-code-reviewer | Code quality review | read-only |
| lazycodex-gate-reviewer | Final gate review | read-only |
| lazycodex-clone-fidelity-reviewer | Clone fidelity review | read-only |

## 3. Vendor Boundary

| Package | Imported by components | Modifiable |
| --- | --- | --- |
| rules-engine | Yes (rules) | No (upstream snapshot) |
| comment-checker-core | Yes (comment-checker) | No |
| telemetry-core | Yes (telemetry) | No |
| lsp-daemon | Yes (lsp) | No |
| utils | Indirect (shared) | No |
| omo-codex | Yes (bootstrap relative path) | No (original snapshot) |

`components/*/src/`, `shared/src/`, `scripts/` — modifiable (LazyZ-owned).
`vendor/*/src/` — not modifiable (external snapshot).
