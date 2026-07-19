# Deployment Plan

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |
| Repository | https://github.com/younghai/lazyz |
| Version | 0.10.2 |

## 1. Deployment Architecture

```
GitHub (younghai/lazyz)
  │
  ├── marketplace.json (root)
  └── plugins/lazyz/ (plugin body)
       ├── .zcode-plugin/plugin.json
       ├── hooks/hooks.json
       ├── skills/, commands/, agents/
       ├── components/*/dist/ (prebuilt)
       └── vendor/*/dist/ (prebuilt)
  │
  ▼ (zcode plugin marketplace add)
  │
ZCode client
  ├── ~/.zcode/cli/plugins/marketplaces/lazyz/
  ├── ~/.zcode/cli/plugins/data/lazyz@lazyz/
  └── ~/.zcode/agents/ (via install-agents.sh)
```

## 2. Installation Procedure

### Automatic install (user)
```bash
zcode plugin marketplace add https://github.com/younghai/lazyz
zcode plugin add lazyz@lazyz
```

### Manual install (developer)
1. ZCode → Settings → Plugin Management → Discover → `+`
2. Local directory: `/path/to/lazyz/plugins/lazyz`
3. Register marketplace `lazyz`
4. Enable `lazyz@lazyz`

### Agent deployment (separate)
```bash
sh plugins/lazyz/scripts/install-agents.sh
# or --symlink mode
```
Copies 10 .md subagents to `~/.zcode/agents/`.

## 3. Prebuilt Dist Policy

- All `components/*/dist/` and `vendor/*/dist/` are committed to git
- Users need only Node.js 20+ — no build required
- `.gitignore` manages dist via `!plugins/lazyz/components/*/dist/` exception
- CI hard-checks dist presence (`Verify hook outputs exist`)

## 4. Go/No-Go Gate

| Condition | Status |
| --- | --- |
| All component builds succeed | ✅ GO |
| JSON manifests valid | ✅ GO |
| CI boulder parser sync passes | ✅ GO |
| ZCode registration verified (skills/MCP exposed) | ✅ GO |
| Security scan (CRITICAL/HIGH 0) | ✅ GO |
| GitHub push complete | ✅ GO |

**Verdict: GO**

## 5. Rollback Procedure

1. ZCode → Plugin Management → `lazyz@lazyz` → Uninstall
2. Restart ZCode
3. Reinstall previous version (or re-add local directory)
4. `~/.zcode/agents/` agents are managed manually (re-run install-agents.sh)

### Caveats
- A previous version reading `status: "blocked"` in boulder.json will treat it as undefined → work invisible in UI (silent-stall). See AGENTS.md.
- `.omo/` state is unaffected by plugin update/rollback (persists in project local).
