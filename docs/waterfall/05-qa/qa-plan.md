# QA Plan

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Verification Strategy

### Automated Verification (CI)

| Verification | Method | Gate |
| --- | --- | --- |
| Component build | `npm run build` (13 components) | dist/cli.js exists |
| Manifest consistency | hooks.json/.mcp.json paths → dist files exist | Broken reference exit 1 |
| Boulder parser sync | BoulderWorkStatus enum diff (work-status vs boulder-reader) | Mismatch exit 1 |
| Prebuilt dist presence | components/*/dist/ + vendor/*/dist/ | Missing exit 1 |

### Manual Verification (ZCode session)

| Scenario | Method | Expected result |
| --- | --- | --- |
| Skill exposure | ZCode `/` menu or Settings → Skills | lazyz:* 25 visible |
| MCP connection | `/mcp` menu | 5 servers shown |
| SessionStart hook | Session start | `(LazyZ)` status message |
| Skill invocation | `/init-deep` execution | AGENTS.md created |
| Agent exposure | After `install-agents.sh`, Agent tool | 10 subagent_type values shown |

### Security Verification

| Scenario | Method | Expected result |
| --- | --- | --- |
| File permissions | After `.omo/` creation, `ls -la` | drwx------ (0700) |
| PII scrubber | `node scripts/redact-secrets.mjs` (with secret in evidence) | exit 1 on secret found |
| Telemetry opt-in | Session start without `LAZYZ_ENABLE_TELEMETRY` | No event sent |

## 2. Test Matrix

| Area | Test scope | Status |
| --- | --- | --- |
| Component build | All 13 tsc/bun builds | ✅ PASS |
| JSON validity | plugin.json, marketplace.json, hooks.json, .mcp.json | ✅ PASS |
| CI boulder sync | BoulderWorkStatus both sides 5 values match | ✅ PASS |
| ZCode registration | plugin install → skills/MCP exposed | ✅ PASS (24 skills, 2 MCP confirmed) |
| F1 bootstrap | `.zcode-plugin` + ZCODE_PLUGIN_ROOT recognition | ✅ Build confirmed |
| File permissions | 13 sites mode 0o700 | ✅ Code reflected |
| Telemetry opt-in | OFF by default | ✅ Build confirmed |

## 3. Residual Risks

| Risk | Severity | Status |
| --- | --- | --- |
| boulder.json soft-schema (LLM-written) | MEDIUM | Relies on prose guide (code enforcement is Sprint 3) |
| SubagentStop unsupported | MEDIUM | PostToolUse advisory (weakened enforcement) |
| SessionStart sequential latency | LOW | Worst case 65s (each hook has independent timeout) |
| Model single-mapping (GLM-5.2) | LOW | No reasoning_effort (permanent limitation) |
| teammode not ported | LOW | Kept in vendor (Sprint 3) |
