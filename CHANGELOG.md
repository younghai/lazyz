# Changelog

## 0.10.2 — 2026-07-19

### UX design review & brand consistency

- **Count unification** across all surfaces (25 skills, 16 hooks, 5 MCP, 4
  commands, 10 agents).
- **Version unified** to 0.10.2 (README changelog was v0.1.1).
- **Skill descriptions** — Codex residue removed from 9 skills
  (comment-checker, lsp, rules, ultrawork, coding-agent-sessions, lcx-* x3,
  lsp-setup). init-deep description gained natural-language triggers.
- **Session hook messages** redesigned — "feel free to dismiss" removed
  (cry-wolf pattern), internal terms abstracted, tier hierarchy clarified.
- **Brand unification** — `[omo-bootstrap]` → `[LazyZ]`, doctor hint updated,
  `author.url` fixed to `younghai/lazyz`.
- **Telemetry policy alignment** — `plugins/lazyz/README.md` rewritten to
  opt-in (was opt-out, contradicting root README).

### Waterfall documentation

- 11-phase waterfall documentation added (20 markdown files under
  `docs/waterfall/`).

### Deployment/operations essentials

- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` added.
- `.github/CODEOWNERS`, issue templates, PR template added.
- `package.json` `engines.node >=20` declared.
- Script executable permissions enforced (`redact-secrets.mjs`,
  `prune-evidence.mjs`).

## 0.10.2 — 2026-07-17

### Data governance & operations hardening

- **Telemetry opt-in** (OFF by default, GDPR-aligned).
- **`.omo/` permissions** hardened to `0o700` (13 state creation sites).
- **Secret redaction scrubber** (`scripts/redact-secrets.mjs`).
- **Bootstrap ZCode manifest fix** (`.zcode-plugin` + `ZCODE_PLUGIN_ROOT`).
- **Boulder parser sync CI gate** (`Verify boulder parser sync`).
- **Atomic write** for `.lazyz-prompts.json` (temp+rename).
- **Evidence retention pruner** (`scripts/prune-evidence.mjs`).
- **Codegraph timeout** tuned to 15s (detached worker).
- **schema_version** documented as cosmetic (no migration gate).

## 0.10.2 — 2026-07-12

### Sprint 2: D·E·L features

- boulder.json `blocked` status + `fail_count` schema extension.
- Cycle caps (5 execution cycles, 3 same-failure type) + debugging budget.
- Manual-QA pre-notification gate (SessionStart).

### Sprint 1: Codex→ZCode port

- ZCode plugin manifest, 10 TOML agents → .md subagents.
- SubagentStop workaround (PostToolUse+Agent).
- Skill description Codex→ZCode, identifier rebrand (@lazyz/*).
- ZCode marketplace registration and verification.

## 0.1.1 — 2026-07-05

- Install-and-go release: prebuilt `dist/` ships with the plugin.
- No build step required — only Node.js 20+ on `PATH`.

## 0.1.0 — 2026-07-05

- First community release of LazyZ.
- 25 skills, 10 agents, 16 hooks, 5 MCP servers.
- Project memory (`init-deep`), planning (`ulw-plan`), execution
  (`start-work`), verified completion (`ulw-loop`).
