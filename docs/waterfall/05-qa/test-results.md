# Test Results

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |
| Test period | 2026-07-05 to 2026-07-19 |

## 1. Build Verification

| Component | Build tool | Result | dist size |
| --- | --- | --- | --- |
| bootstrap | tsc → bun bundle | ✅ PASS | 124.4 KB |
| codegraph | bun | ✅ PASS | 108.9 KB |
| comment-checker | bun | ✅ PASS | — |
| git-bash | tsc | ✅ PASS | — |
| lazycodex-executor-verify | tsc | ✅ PASS | — |
| lsp | tsc | ✅ PASS | — |
| rules | bun | ✅ PASS | 154.3 KB |
| start-work-continuation | bun | ✅ PASS | 14.5 KB |
| telemetry | bun | ✅ PASS | 212.4 KB |
| ultrawork | tsc | ✅ PASS | — |
| ulw-loop | tsc | ✅ PASS | — |
| work-status | bun | ✅ PASS | 20.0 KB |

## 2. CI Verification

| Verification item | Result |
| --- | --- |
| Verify hook outputs exist (13 components + 3 vendor) | ✅ PASS |
| Verify manifest consistency (hooks.json + .mcp.json) | ✅ PASS |
| Verify boulder parser sync (new CI step) | ✅ PASS |

## 3. ZCode Registration Verification

| Item | Result | Evidence |
| --- | --- | --- |
| Marketplace registration | ✅ | `known_marketplaces.json` lazyz pluginCount=1 |
| Plugin installation | ✅ | `data/lazyz@lazyz/` directory exists |
| Skill exposure | ✅ | 24 lazyz:* skills confirmed in session |
| MCP connection | ✅ | context7, grep_app connected under lazyz scope |

## 4. Security Verification

| Item | Result |
| --- | --- |
| API key config.json permissions 600 | ✅ PASS (P0-1) |
| `.omo/` mode 0o700 (13 sites) | ✅ Code reflected |
| redact-secrets.mjs scrubber | ✅ Script functional |
| Telemetry opt-in (OFF by default) | ✅ Code reflected |
| GitHub push security scan | ✅ CRITICAL/HIGH 0 |

## 5. Known Limitations (non-blocking)

| Limitation | Impact | Tracking |
| --- | --- | --- |
| `schema_version` cosmetic (not a migration gate) | Risk of operator misjudgment | Documented |
| Downgrade blocked status silent-stall | User confusion | AGENTS.md warning |
| Evidence unbounded growth (no auto GC) | Disk full | prune-evidence.mjs manual run |
| SessionStart sequential execution | Worst case 65s delay | known-limitations.md |
