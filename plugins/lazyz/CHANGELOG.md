# Changelog

## 0.12.1 — 2026-11-01

### poteto-mode ported (reverses the 0.12.0 not-ported note)

- New skill `poteto-mode` (30th skill): the pstack/poteto playbook-routing
  entrypoint, adapted from cursor/plugins pstack v0.15.36 (MIT, poteto).
  Explicit invocation only (`/poteto-mode`, "pstack 방식") so it never fights
  the hephaestus rules for ordinary turns.
- Discipline ownership re-pointed from vibe-mode to the lazyz hephaestus
  rules; the routing table now maps every playbook to a skill/agent lazyz
  actually ships (debugging, ulw-plan/ulw-execute, refactor, ulw-loop,
  benchmark-checklist, visual-qa, git-master, coding-agent-sessions,
  lazyz:lazycodex-code-reviewer, ...).
- The 14 upstream playbooks ship inside the skill
  (`references/playbooks.md`) with a lazyz adaptation header, so the router
  is self-contained without the global vibe-mode stack.
- Sibling-skill delegation lists only lazyz-provided skills; pstack-only
  siblings (how/why, arena, interrogate, ...) are used opportunistically from
  the global stack when present.

## 0.12.0 — 2026-11-01

Selective sync from upstream omo 5.1.54 (previous baseline: 5.1.22 in 0.11.0).

### ulw-loop execution quality (from upstream 5.1.51–5.1.54)

- `components/ulw-loop/dist` upgraded to the upstream build (self-contained,
  no new dependencies; runtime-verified — the 0.11.0 dist rejected the new
  hook subcommands, the new dist accepts all three).
- Three new hooks with ZCode-native matchers (plugin total: 20 → 23 hooks
  across 6 events):
  - `PreToolUse` on `^(Agent|Task)$` — spawn guard (`pre-tool-use-spawn`):
    polices subagent spawns while a ulw-loop is running.
  - `PostToolUse` on `^(Agent|Task)$` — spawn admission recording
    (`post-tool-use-spawn`).
  - `Stop` — ulw-loop resume (`hook stop`): a paused loop continues on the
    next turn within ZCode's Stop continuation limit.

### start-work → ulw-execute unification

- The `start-work` skill and `/start-work` command are deprecated and now
  redirect to **ulw-execute** (same runtime, Boulder state, and evidence
  ledger — nothing to migrate). `/start-work` stays as a compatibility alias.

### Skill updates from upstream 5.1.54

- `programming` — new four-question test authoring gate
  (`references/testing/`: authoring gate + junk-classes table wired into the
  language routing table); per-language scaffolding scripts migrated from
  Python to TypeScript (`scripts/{go,python,rust}/new-project.ts`, shared
  `run-tool.ts`).
- `visual-qa` — new machine pre-check section (frontend detect SDK run before
  human reviewers: contrast, type scale, overflow stress test), checklist
  additions A13 (spacing rhythm) and B8 (type scale floor), refined A3
  measure rule (65-75 chars desktop, ≥45 phone).

### Deliberate divergence from upstream

- `codegraph` MCP/component/hooks KEPT (upstream removed it): local sessions
  show real `mcp__codegraph__` tool usage.
- `benchmark-checklist` and `blast-radius` skills (ported 2026-10-18 from
  pstack, MIT — see the 0.11.0 publication-repairs entry) remain LazyZ-only.
- `poteto-mode` (pstack playbook-routing entrypoint, global v0.15.36) is
  intentionally NOT ported: it routes through vibe-mode-owned discipline, which
  conflicts with the hephaestus rules and the ultrawork/ulw-* loop LazyZ already
  runs. It keeps working as a global skill in `~/.agents/skills/`.
- `ultimate-browsing`: added a ZCode note pointing interactive browser work
  at the built-in browser-use plugin skills (control-browser /
  web-gui-tester) first.

### Operational notes

- Restored the `lazyz@lazyz` registration in `~/.zcode/cli/config.json` after
  a cache-directory move caused the host to unregister the plugin mid-session.
- Re-applied the 0.11 publication repair (process.exit -> process.exitCode,
  stdout drains before exit) onto the new upstream ulw-loop dist, where the
  fix had not yet landed upstream.
- The 0.11.0 cache snapshot is preserved at `~/.zcode-backup/lazyz-0.11.0`
  for rollback.


## 0.11.0 publication repairs — 2026-10-18

- Remove implicit installs from LSP builders and regenerate MCP source bundles.
- Declare esbuild directly and lock patched js-yaml/source-map-js/Vitest versions.
- Align `/start-work` with approved-plan execution and test native hook argv.
- Isolate LSP test contexts, preserve fail-closed core context rules, and handle
  standalone resource probes without affecting daemon workspace confinement.
- Load bundled Markdown prompts as text; preserve raw prompt content under Bun.
- Make vendored tests portable and reconcile frozen capability metadata spelling
  without changing provider routing or inherited ZCode model selection.
- Port two discipline skills from pstack (cursor/plugins, MIT, poteto) as
  LazyZ-only additions: `benchmark-checklist` (vet a performance number before
  reporting or acting on it) and `blast-radius` (find what a change could break
  and prove the safety fact by running code). Both adapted for ZCode — no
  Cursor-only tools or model routing — with upstream attribution preserved in
  each SKILL.md. The overlapping pstack skills (arena, interrogate, unslop,
  show-me-your-work) and the routing-layer skills (vibe-mode, poteto-mode) stay
  global-only (`~/.agents/skills/`) to avoid routing conflicts with the
  hephaestus rules and ultrawork/ulw-* execution loop.
- Local product check: 1,385 passing tests, component typechecks and compatibility.
  This does not certify live ZCode, paid providers or the upstream Codex installer.

## 0.11.0 — 2026-10-07

ZCode-native adaptation reviewed against ZCode v3.14.3 and LazyCodex/omo-ai 5.1.22.
This is a selective update, not a full replacement of the vendored upstream baseline.

- Run all root hooks as native process/argv executors, without shell parsing or a
  separate Node-version probe on every hook; validate process entrypoints in doctor.
- Accept documented hook payloads without Codex-only `model` or `turn_id` fields and
  prefer `ZCODE_PLUGIN_DATA` for persistent plugin state. Namespace rules and LSP
  caches separately so shared session identifiers cannot overwrite another component.
- Reset LSP/Git context markers on SessionStart compact/clear. Respect the host's
  three-block Stop limit and hook-local transcript lifetime.
- Discover 13 namespaced plugin agents with `model: inherit`. Keep structured work
  foreground so task receipts can be checked; reject background dispatches before
  reserving a task. Unstructured read-only research remains background-capable.
- Separate plan approval from execution, add `/ulw-execute`, register durable goals,
  and make testing/delegation honor the user's authorization and verification policy.
- Read at most 512,000 transcript bytes once per ultrawork trigger, and skip that
  read for ordinary prompts. This bounds I/O; no end-to-end speedup is claimed.
- Replace unsupported MCP `required` fields with documented enabled/timeout settings.
  Preserve release allowlists, manifest integrity, receipts, budgets and privacy defaults.

Local check evidence and remaining real-host limits are recorded in the 2026-10-07
AI review report. No host installation, deployment or provider/model call is implied.

## 0.1.1 — 2026-07-05

Install-and-go release. The prebuilt `dist/` for all 13 hooks and the three
local MCP servers now ships with the plugin, so `zcode plugin add lazyz@lazyz`
works without a build step — only Node.js 20+ is needed on `PATH`.

- Ship prebuilt `dist/` (158 files, ~2.4 MB) under `components/*/dist/` and
  `vendor/*/dist/`.
- Update `.gitignore` so the plugin's own `dist/` is tracked while
  `node_modules/` and other build artifacts stay ignored.
- Rewrite install/build docs: README and CHANGELOG now say "no build required
  to install"; rebuilding from source is optional.
- Add GitHub remote (`code-yeongyu/lazyz`) and replace the `<your-org>`
  placeholder in install instructions.

## 0.1.0 — 2026-07-05

First community release of LazyZ, the OmO agent harness packaged as a ZCode
plugin.

### ⚠️ Read before installing

LazyZ targets **early adopters on macOS / Linux**. The plugin ships prebuilt
`dist/` for all hooks and local MCP servers, so install-and-go works with just
Node.js 20+ on `PATH`.

1. **No build required to install.** All 13 hooks and the three local MCP
   servers (`codegraph`, `git_bash`, `lsp`) ship prebuilt. You only need
   **Node.js 20+** on your `PATH` (the hooks call `node` at runtime). Rebuilding
   from source is optional and additionally requires Bun.

2. **Windows is not supported in this release.** Hooks run through
   `sh scripts/run-hook.sh`. WSL may work but is not officially supported.

3. **Anonymous telemetry is ON by default** (opt-out policy). On the first
   SessionStart, a one-time notice is printed to stderr. To opt out:

   ```bash
   touch ~/.omo/telemetry-disabled
   # or: export OMO_CODEX_DISABLE_POSTHOG=1
   ```

   Collected data is limited to a hashed hostname, OS/runtime metadata, and a
   per-day UTC flag. It does **not** include prompts, files, tokens, or source
   contents. See the README for the full list.

4. **No silent failures.** If Node.js or Bun is missing, or the build has not
   been run, each hook prints a `[LazyZ]` diagnostic to stderr telling you
   exactly what to install or run, then exits 0 so it never blocks the session.

### What's included

- **23 skills** — `init-deep`, `ulw-plan`, `start-work`, `ulw-loop`,
  `review-work`, `debugging`, `programming`, `frontend`, `visual-qa`,
  `remove-ai-slops`, `ast-grep`, `lsp`/`lsp-setup`, `git-master`, `rules`,
  `comment-checker`, `refactor`, and more.
- **13 hooks** across 5 ZCode events (SessionStart, UserPromptSubmit,
  PreToolUse, PostToolUse, Stop).
- **5 MCP servers** — `grep_app` + `context7` (remote, zero-config) and
  `codegraph` + `git_bash` + `lsp` (local, require the build step above).
- **Vendored shared packages** — 12 packages from the upstream OmO/LazyCodex
  monorepo (`utils`, `lsp-daemon`, `telemetry-core`, `mcp-stdio-core`,
  `lsp-core`, `model-core`, `lsp-tools-mcp`, `git-bash-mcp`, `omo-codex`,
  `comment-checker-core`, `prompts-core`, `rules-engine`) live under
  `plugins/lazyz/vendor/`, so the plugin builds from a single repository
  checkout with no external `file:` dependencies.

### Notable changes from the upstream Codex LazyCodex

- Plugin manifest, hooks, and hook variables ported to the ZCode convention
  (`.zcode-plugin/plugin.json`, `hooks/hooks.json`, `${ZCODE_PLUGIN_ROOT}`).
- Unsupported Codex events (`PostCompact`, `SubagentStop`) and Codex-only tool
  matchers dropped; their work is folded into `SessionStart` / `Stop`.
- `teammode` skill and model routing removed (depend on Codex-only APIs).
- Hooks wrapped in a diagnostics launcher (`scripts/run-hook.sh`) so missing
  runtimes produce actionable messages instead of silent failures.
- Telemetry gained a file-based opt-out and a one-time first-run notice.
