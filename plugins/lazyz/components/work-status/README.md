# @code-yeongyu/lazyz-work-status

Reports in-progress LazyZ work and surfaces onboarding/provisioning prompts on
every ZCode `SessionStart`. Combines four Sprint 1 concerns into a single
hook so users do not have to approve more hooks:

1. **Work-resume prompt (T4 / `I`)** — when there is in-progress `start-work`
   or `ulw-loop` state in `.omo/`, emit a one-line
   `⏳ ... (3/7 완료) ... 다음: ...` prompt at most once per UTC day per work
   identity. Survives session restart and "next day" reopen; the
   mid-session-compaction case is a known limitation (see
   `docs/known-limitations.md`).
2. **Progress query (T3 / `C`)** — `query [cwd]` prints a machine-readable
   JSON snapshot of the active work's progress, for downstream UIs and status
   lines.
3. **`init-deep` auto-suggestion (T5 / `#2`)** — when the project has no
   `AGENTS.md` memory file, suggest running `init-deep` once per UTC day per
   project. This is the chosen replacement for native tier-display (which
   ZCode does not yet support) — it routes the user at the first 9-skill
   core set.
4. **Local MCP build-missing warning (T6 / `#5`)** — when a `required: false`
   local MCP server (`codegraph` / `git_bash` / `lsp`) has no built `dist/`,
   warn once per UTC day so the user is not left wondering why the server is
   silent.

## Install (inside the plugin)

This component is built as part of the LazyZ plugin build:

```bash
cd plugins/lazyz
npm install
npm run build
```

Requires **Node.js 20+** and **Bun** (the build scripts use `bun build`).

## Commands

### `hook session-start`

Reads a ZCode `SessionStart` payload from stdin and emits a single
`hookSpecificOutput.additionalContext` JSON blob on stdout when there is
anything to surface. The plugin root is read from the `ZCODE_PLUGIN_ROOT`
(or `CLAUDE_PLUGIN_ROOT`) env var, expanded by ZCode from the hook's
`${ZCODE_PLUGIN_ROOT}` template variable; when absent, the build-missing
check (T6) is skipped.

Wired in `hooks/hooks.json` as the 5th SessionStart hook:

```json
{
  "type": "command",
  "command": "node \"${ZCODE_PLUGIN_ROOT}/components/work-status/dist/cli.js\" hook session-start",
  "timeout": 5,
  "statusMessage": "(LazyZ) Checking Resume Work"
}
```

### `query [cwd]`

Prints a JSON snapshot of the active work on stdout. Used by the progress
display. Always exits 0.

```bash
node dist/cli.js query .
# {"kind":"start-work","planName":"rate-limit","progress":{"completed":3,"remaining":4,"total":7,...},...}
# {"work":"none"}  # when nothing is in progress
```

**No `eta` field is ever emitted.** Counts do not predict wall-clock time;
an estimate would erode trust. See `docs/progress-semantics.md`.

## State files read

| File | Path | Writer | Stability |
| --- | --- | --- | --- |
| boulder pointer | `.omo/boulder.json` | `start-work` skill prose (LLM) | Soft — defensive reader |
| plan checkboxes | `.omo/plans/<slug>.md` | `ulw-plan` + `start-work` skill prose | Soft |
| ulw-loop plan | `.omo/ulw-loop/goals.json` | `omo ulw-loop` TS CLI | Stable (`version: 1`) |
| prompt dedup | `.omo/.lazyz-prompts.json` | this component | Internal |

The boulder + plan-checkbox parser is a self-contained re-implementation of
the one in `components/start-work-continuation/src/boulder-reader.ts`. The
two components are independent bundled packages and cannot share code; keep
them in sync if the boulder schema evolves.

## Degraded mode

If `.omo/boulder.json` exists but cannot be parsed (corruption, partial
write, schema drift), the hook does not silently fail — it emits a
`degraded` prompt asking the user to check manually. Same for `goals.json`.

## Known limitation

Mid-session compaction does **not** trigger this hook (no `PostCompact`
event in ZCode; the `Stop` continuation hook suppresses itself on compaction
markers). The hook fires only on a new `SessionStart`. See
`docs/known-limitations.md`.

## License

MIT, inherited from upstream LazyCodex/OmO.
