# Operations Guide

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Environment Requirements

| Requirement | Minimum | Recommended |
| --- | --- | --- |
| ZCode | Latest stable | Latest |
| Node.js | 20+ | 22+ |
| OS | macOS, Linux | macOS (Windows unsupported) |
| Bun (build only) | latest | latest |

## 2. Runtime Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAZYZ_ENABLE_TELEMETRY` | (unset=OFF) | Telemetry opt-in |
| `LAZYZ_DISABLE_POSTHOG` | (unset) | Force-disable telemetry |
| `LAZYZ_RULES_*` | (unset) | Rules engine config (alias for CODEX_RULES_*) |
| `LAZYZ_START_WORK_MAX_CONTINUATIONS` | 10 | Stop hook resume limit (0=unlimited) |
| `ZCODE_PLUGIN_ROOT` | (injected by ZCode) | Plugin root path |

## 3. Regular Operations

### Evidence cleanup (recommended monthly)
```bash
node plugins/lazyz/scripts/prune-evidence.mjs --days 30 --max-bytes 104857600
```

### PII scrubbing (before sharing/committing)
```bash
node plugins/lazyz/scripts/redact-secrets.mjs          # check only
node plugins/lazyz/scripts/redact-secrets.mjs --fix    # mask in place
```

### Agent update (after plugin update)
```bash
sh plugins/lazyz/scripts/install-agents.sh
```

## 4. Troubleshooting

### "Skills not showing"
1. ZCode → Settings → Plugin Management → `lazyz@lazyz` enabled
2. Restart ZCode
3. Check `/mcp` for MCP server connection status
4. Check stderr for `[LazyZ]` diagnostic messages

### "Hooks not working"
1. `node --version` (confirm Node.js 20+)
2. `ls plugins/lazyz/components/*/dist/cli.js` (confirm dist exists)
3. Check `~/.local/share/lazycodex/bootstrap/bootstrap.log`

### "Bootstrap not provisioning"
1. Confirm F1 fix: reading `.zcode-plugin/plugin.json`
2. Confirm `ZCODE_PLUGIN_ROOT` env is injected
3. Check bootstrap state: `~/.local/share/lazycodex/bootstrap/state.json`

## 5. Version Management

- Single version source: `plugin.json`, `package.json`, all `components/*/package.json` share the same version (sync-version.mjs)
- Version sync: runs automatically during `npm run build`
- Changelog: README.md bottom Changelog section
