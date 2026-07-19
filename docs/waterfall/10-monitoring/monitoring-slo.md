# Monitoring / SLO

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Visibility Status

LazyZ is a local development tool, so it does not have traditional service monitoring (metrics/dashboards). Instead, visibility is provided through these channels:

| Channel | Content | User exposure |
| --- | --- | --- |
| stderr diagnostics | `[LazyZ]` prefixed messages (run-hook.sh) | ZCode session |
| SessionStart additionalContext | `⏳💡⚠️ℹ️⛔` emoji messages (work-status) | ZCode session |
| bootstrap.log | `~/.local/share/lazycodex/bootstrap/bootstrap.log` (JSONL) | File only |
| telemetry-diagnostics.jsonl | `~/.local/share/lazyz/telemetry-diagnostics.jsonl` (256KB cap) | File only |
| CI | GitHub Actions (build, manifest, parser sync) | GitHub |
| ledger.jsonl | `.omo/*/ledger.jsonl` (work events) | File only |

## 2. SLO Definition

LazyZ is a local tool, so instead of strict SLOs, it uses "expected user quality" criteria:

| Metric | Target | Measurement |
| --- | --- | --- |
| SessionStart hook latency | < 15s per hook | Each hook timeout (15s/10s/5s) |
| Skill trigger rate | 100% (of registered skills) | ZCode `/` menu exposure |
| MCP connection rate | 100% (excluding required:false) | `/mcp` menu |
| Build success rate | 100% (CI) | GitHub Actions |
| Silent failures | 0 (failures the user cannot detect) | stderr + additionalContext |

## 3. Alerts

LazyZ has no built-in alerting system. Instead:

| Condition | Alert method |
| --- | --- |
| Node.js missing | stderr 3-line diagnostic + exit 0 |
| dist missing | stderr diagnostic + exit 0 |
| MCP build missing | SessionStart `⚠️ LazyZ:` message (once/day) |
| boulder.json parse failure | SessionStart `⏳ LazyZ:` degraded message |
| Work blocked | SessionStart `⛔ LazyZ:` message |
| init-deep not run | SessionStart `💡 LazyZ:` suggestion (once/day) |

## 4. Monitoring Gaps (Sprint 3 tracking)

| Gap | Impact | Tracking |
| --- | --- | --- |
| stderr visibility in ZCode undetermined | User may not see diagnostics | Needs ZCode behavior investigation |
| Bootstrap degraded not shown to user | Partial operation undetected | Consider additionalContext exposure |
| Evidence disk usage not monitored | Disk full risk | Automate prune-evidence.mjs |
| Telemetry DAU is not operational monitoring | Install base count only | Product events (Sprint 3) |
