# Implementation Status

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |
| Source | GitHub `younghai/lazyz` commit history (10 commits) |

## 1. Sprint History

### Sprint 1 (2026-07-05 to 07-12): Codex→ZCode Port

| Phase | Work | Commit |
| --- | --- | --- |
| 1 | Manifest cleanup (plugin.json hooks/agents fields, marketplace.json) | `0f2abbc` |
| 2 | 10 TOML agents → ZCode .md subagent conversion | `0f2abbc` |
| 3 | SubagentStop workaround (PostToolUse+Agent matcher) | `0f2abbc` |
| 4 | Skill residue cleanup (description "Codex"→"ZCode" 3 items) | `0f2abbc` |
| 5 | Identifier rebrand (package.json @lazyz/*, telemetry lazyz) | `0f2abbc` |
| 6 | ZCode registration pre-verification | `0f2abbc` |

### Sprint 2 (2026-07-12): D·E·L Features

| Task | Work |
| --- | --- |
| L-1 | boulder.json schema extension (blocked + fail_count, both parsers) |
| E-1/E-2 | start-work cycle caps (5/3) + debugging budget prose |
| E-3 | directive.md cap rules expansion |
| L-2 | SKILL.md boulder.json example extension |
| L-3 | hook.ts blocked status surface |
| D-1 | hook.ts maybeManualQaNotice added |
| D-2 | SKILL.md pre-Phase 1 Manual-QA block |

### Data Governance Hardening (2026-07-17)

| Item | Work | Commit |
| --- | --- | --- |
| F1 (P0) | bootstrap `.zcode-plugin` + `ZCODE_PLUGIN_ROOT` recognition | `e3593a8` |
| G2 (P1) | `.omo/` mode 0o700 enforced (13 sites) | `e3593a8`, `b30877a` |
| G1+G3 (P1) | `redact-secrets.mjs` PII scrubber | `b30877a` |
| C1 (P3) | `prune-evidence.mjs` retention | `b30877a` |
| M3 (P2) | CI `Verify boulder parser sync` | `b30877a` |
| C5 (P3) | telemetry full opt-in (OFF by default) | `96380fb` |
| C3/C4 (P3) | codegraph timeout 15s alignment | `96380fb` |

### UX Design Review (2026-07-19)

| Item | Work | Commit |
| --- | --- | --- |
| D1-D5 | Count unification, version unification, Codex residue removal, message tiers, brand unification | `6399ae4` |
| N1-N7 | coding-agent-sessions, lcx-*, lsp-setup, start-work, init-deep, telemetry alignment, author.url | `893c2ec` |

## 2. File Map (Key Modified Files)

### Manifest/Config
- `plugins/lazyz/.zcode-plugin/plugin.json` — hooks/agents fields, author.url fix
- `plugins/lazyz/marketplace.json` — root official pattern (source: "./plugins/lazyz")
- `plugins/lazyz/hooks/hooks.json` — 16 hooks, codegraph timeout 15s
- `plugins/lazyz/.mcp.json` — 5 MCP servers

### Components (modified)
- `components/bootstrap/src/hook.ts` — ZCODE_PLUGIN_ROOT recognition
- `components/bootstrap/src/worker.ts` — .zcode-plugin reading, doctor hint fix
- `components/bootstrap/src/setup.ts` — mode 0o700
- `components/work-status/src/hook.ts` — T7 Manual-QA, blocked surface, atomic write, message tiers
- `components/work-status/src/work-status.ts` — BoulderWorkStatus blocked + failCount
- `components/start-work-continuation/src/boulder-reader.ts` — sync
- `components/start-work-continuation/src/continuation-counter.ts` — mode 0o700
- `components/start-work-continuation/directive.md` — cap rules expansion
- `components/telemetry/src/codex-hook.ts` — opt-in gate, notice improvement
- `components/telemetry/src/product-identity.ts` — lazyz identifiers
- `components/lazycodex-executor-verify/src/codex-hook.ts` — PostToolUse handler
- `components/lazycodex-executor-verify/src/types.ts` — PostToolUseInput/DenyOutput
- `components/lazycodex-executor-verify/src/state.ts` — mode 0o700
- `components/ulw-loop/src/plan-io.ts` — mode 0o700
- `components/git-bash/src/codex-hook.ts` — mode 0o700
- `components/lsp/src/lsp-session-state.ts` — mode 0o700
- `components/codegraph/src/session-start-worker.ts` — mode 0o700

### Skills/Commands
- `skills/start-work/SKILL.md` — Manual-QA block, caps, budget, boulder.json example
- `skills/comment-checker/SKILL.md`, `lsp/`, `rules/`, `ultrawork/` — Codex→ZCode
- `skills/init-deep/SKILL.md` — description triggers added
- `skills/coding-agent-sessions/SKILL.md` — ZCode added
- `skills/lcx-*/SKILL.md` (3) — LazyZ branding
- `skills/lsp-setup/SKILL.md` — Korean phrase removed
- `commands/start-work.md` — Boulder/Codex removed

### New Scripts
- `scripts/redact-secrets.mjs` — PII/secret scrubber
- `scripts/prune-evidence.mjs` — retention pruner
- `scripts/install-agents.sh` — subagent deployment

### New Agents (10)
- `agents/explorer.md`, `librarian.md`, `plan.md`, `metis.md`, `momus.md`
- `agents/lazycodex-executor.md`, `lazycodex-qa-executor.md`
- `agents/lazycodex-code-reviewer.md`, `lazycodex-gate-reviewer.md`, `lazycodex-clone-fidelity-reviewer.md`

### CI
- `.github/workflows/ci.yml` — `Verify boulder parser sync` step added

### Documentation
- `README.md` — workflow diagram, Changelog, opt-in
- `AGENTS.md` — Downgrade compatibility, subagent wiring
- `docs/known-limitations.md` — schema_version cosmetic, SessionStart latency
