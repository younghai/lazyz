# Changelog

## 0.11.0 publication snapshot — 2026-10-18

October 18 publication repairs and local checks:

- Follow-up source `8f875db`: [all four Linux/macOS × Node 20/22 CI jobs passed](https://github.com/younghai/lazyz/actions/runs/39125322408),
  with 1,391 product tests per job. Enumerated explicit LSP test files for Node 20
  and allowed ulw-loop CLI output to drain before exit; six regressions added.
- The following 1,385-test result is the earlier local baseline, before those
  six regression tests were added.
- Full LazyZ check: 1,385 tests passed (49 root, 203 component, 1,133 vendor/helper),
  all component typechecks and ZCode compatibility check passed.
- Removed build-time dependency installation; source builds regenerate MCP
  bundles. Pinned Bun 1.4.2 and declared the CLI's esbuild dependency explicitly.
- Patched js-yaml, source-map-js and Vitest/mocker advisories; locked dependency
  audit reports zero findings at verification time, not an all-security guarantee.
- Corrected native hook argv tests, standalone LSP request-context isolation,
  Markdown-as-text prompt imports and frozen model metadata alias lookup.
- Aligned `/start-work` with the approved-plan `/ulw-execute` contract.
- Added standalone vendored-runtime tests to the product/CI gate. The separate
  upstream Codex installer suite needs omitted OpenCode assets and is not claimed
  to pass; see [verification scope](docs/maintenance/publishing.md).
- Detailed dated evidence: [October 18 verification report](reports/ai-review/2026-10-18-build-test-publication.html).

October 17 preparation preserved below:

- Imported the current development plugin, including source, tests and prebuilts.
- Current inventory: 29 skills, 13 agent profiles, five command documents,
  20 direct-process hooks across six events and six MCP declarations.
- Added canonical ulw-execute, inherited-model agent discovery, task/run-bound
  receipts, dispatch budgets and failure lifecycle handling.
- Included CodeGraph 1.5.0 provisioning, namespaced plugin data, bounded prompt
  transcript reading, root CLI and source-free release tooling already present
  in the development source.
- Reorganized current architecture, analysis, maintenance and historical docs
  without changing the marketplace installation path.
- Added a non-deleting local source import with per-file hashes and backups.
- Updated the existing CI definition with lock-based install, component checks,
  CLI artifact drift and runtime-payload checks. Remote CI status is separate
  from the dated local evidence above.
- Full comparison and limitations: [October 17 report](docs/reports/2026-10-17-feature-evolution.md).

Historical correction: the earliest July 5 Git trees contain 23 skills, no
plugin agent profiles or command documents, 13 hook invocations and five MCP
declarations. The older 0.1.0 counts below were editorially inaccurate.
July 20 HEAD contains 13 agent profiles, even though its release prose said 10.
Historical text is retained rather than rewritten as fresh validation.

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
