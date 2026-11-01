# codex-ulw-loop

[![ci](https://img.shields.io/badge/ci-pending-lightgrey.svg)](#) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Codex plugin component for durable repo-native multi-goal orchestration with embedded success criteria and observable evidence audit. State lives under `.omo/ulw-loop/` and is mutated through the `lazyz ulw-loop` CLI.

## CLI

Every subcommand below is implemented. Pass `--json` where supported for machine-readable output, and pass `--session-id <id>` or set `OMO_ULW_LOOP_SESSION_ID` to scope state to a parallel session.

| Subcommand | Purpose |
|------------|---------|
| `lazyz ulw-loop help` | Print CLI usage. |
| `lazyz ulw-loop create-goals` | Create repo-native goals and seed success criteria from a brief. |
| `lazyz ulw-loop status` | Report active goal, criteria, and evidence state. |
| `lazyz ulw-loop complete-goals` | Start or resume the next eligible goal, or report aggregate completion / blocked handoff. |
| `lazyz ulw-loop checkpoint` | Gate a goal transition with evidence; final completion requires a complete Codex goal snapshot and a passing quality gate. |
| `lazyz ulw-loop steer` | Apply a steering mutation proposal to the plan. |
| `lazyz ulw-loop add-goal` | Append a goal to the active plan. |
| `lazyz ulw-loop criteria` | Inspect one goal's success criteria. |
| `lazyz ulw-loop record-evidence` | Record observable evidence for one criterion. |
| `lazyz ulw-loop record-review-blockers` | Mark a goal as review-blocked and add follow-up work from final-review findings. |
| `lazyz ulw-loop quality-context` | Emit the strict plan, final-task, criterion, QA-root, and current-source binding for a final gate. |

Final `checkpoint` completion accepts only schema v2 quality gates. Start with `lazyz ulw-loop quality-context --goal-id <final-id> --json`, copy its `binding`, exact `criterionRefs`, `totalCriteria`, and `qaRoot`, then submit hash-bound reports, artifacts, and successful command execution records. Every criterion uses the unambiguous `Gxxx/Cxxx` form because criterion IDs repeat per goal. Submitted counts, task text, and source strings are compared with the actual plan and current Git provenance rather than trusted as assertions.

Reports and QA artifacts must be canonical regular files inside `.omo/ulw-loop[/<session>]/qa`; links, path escapes, missing files, and SHA-256 mismatches fail closed. Each successful criterion needs one surface-evidence row tied to an `exitCode: 0` execution whose command and artifact references match. See [strict-quality-gate.example.json](skills/ulw-loop/references/strict-quality-gate.example.json) for the complete schema.

Trust limit: these checks make evidence tampering and stale/arbitrary binding detectable at checkpoint time. They do not independently prove that a human or agent actually ran a command; an execution record is a durable claim bound to current source and artifact bytes, not a cryptographic attestation from an external runner.

## Codex Plugin

This directory is a component of the aggregate `@sisyphuslabs/omo-codex-plugin` root. Plugin discovery (`.codex-plugin/plugin.json`) is owned by that aggregate root, not by this component. The component ships:

- `hooks/hooks.json` registering two hooks:
  - `UserPromptSubmit` -> `node "${PLUGIN_ROOT}/dist/cli.js" hook user-prompt-submit --with-ultrawork`
  - `PreToolUse` matching `^create_goal$` -> `node "${PLUGIN_ROOT}/dist/cli.js" hook pre-tool-use`
- `skills/ulw-loop/` for the bundled `ulw-loop` skill.
- `bin.omo-ulw-loop` -> `dist/cli.js` for standalone CLI invocation.

This component ships a CLI, a skill, and hooks. It does not expose an MCP server.

## Local Development

```bash
npm install
npm test
npm run typecheck
npm run check
npm pack --dry-run
```

`npm test` runs Vitest, `npm run typecheck` runs `tsc --noEmit`, and `npm run check` runs typecheck, Biome, and the build.

## Local Codex Installation

```bash
npx lazycodex-ai install
```

The installer builds and copies the plugin into `~/.codex/plugins/cache/sisyphuslabs/omo/0.1.0`, registers the `sisyphuslabs` marketplace from the `lazycodex` Git repository, installs runtime dependencies there, and enables:

```toml
[features]
plugins = true
plugin_hooks = true

[plugins."omo@sisyphuslabs"]
enabled = true
```

## Privacy

This component runs locally and does not call a network service by itself.

## License

[MIT](LICENSE).

## Related

- [lazycodex](https://github.com/code-yeongyu/lazycodex) - Sisyphus Labs Codex marketplace repository.
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) - the monorepo this component is developed in.
