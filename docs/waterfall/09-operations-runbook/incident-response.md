# Incident Response Runbook

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Failure Mode Catalog

### F1: Bootstrap permanently no-op (resolved)
- **Cause**: Only read `.codex-plugin/plugin.json` (lazyz has `.zcode-plugin/`)
- **Fix**: `.zcode-plugin` first + `.codex-plugin` fallback + `ZCODE_PLUGIN_ROOT` env (commit `e3593a8`)
- **Status**: ✅ Resolved

### F2: Node.js not found
- **Symptom**: All hooks exit 0, stderr 3-line diagnostic
- **Response**: Check `node --version` → install 20+ → restart ZCode
- **User awareness**: Depends on stderr visibility

### F3: dist missing
- **Symptom**: Hook exit 0, stderr "Run the build..."
- **Response**: Only occurs if git clone without `npm install`
- **Response**: `cd plugins/lazyz && npm install && npm run build`

### F4: vendor/omo-codex deleted
- **Symptom**: Bootstrap setup fails → degraded entry logged, exit 0
- **Response**: Restore via `git checkout`

### F5: Multi-session `.lazyz-prompts.json` race (resolved)
- **Cause**: Direct writeFileSync (read-modify-write)
- **Fix**: temp+rename atomic write (commit `e3593a8`)
- **Status**: ✅ Resolved

### F6: Stop continuation infinite loop
- **Symptom**: Counter reaches MAX(10) → silently aborts (return "")
- **Response**: Adjust via `LAZYZ_START_WORK_MAX_CONTINUATIONS`

### F7: boulder.json parser drift
- **Symptom**: Two parsers interpret different statuses → work invisible in UI
- **Response**: CI `Verify boulder parser sync` prevents this
- **Manual response**: Diff both files, sync manually

## 2. Incident Response Procedure

### "Skills not triggering"
1. ZCode Settings → Plugin Management → lazyz enabled
2. Check `/` menu for lazyz:* skills
3. Check `/mcp` for MCP connection status
4. Check stderr for `[LazyZ]` diagnostic messages
5. `node --version` (confirm 20+)

### "start-work not auto-resuming"
1. Check `.omo/boulder.json` exists + `status: "active"`
2. Confirm current session ID is in `session_ids`
3. Check `.omo/start-work-continuation/<session>.json` counter < MAX(10)
4. Check transcript for context pressure markers

### "Agents not showing in Agent tool"
1. Run `sh plugins/lazyz/scripts/install-agents.sh`
2. Confirm `~/.zcode/agents/*.md` (10 files exist)
3. Restart ZCode

## 3. Postmortem Procedure

1. Check `.omo/*/ledger.jsonl` for events around the incident time
2. Check `~/.local/share/lazycodex/bootstrap/bootstrap.log`
3. Collect stderr diagnostic messages
4. Identify root cause → update known-limitations.md
5. Implement preventive measures → reflect in code/docs/CI
