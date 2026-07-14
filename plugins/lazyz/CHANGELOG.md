# Changelog

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
