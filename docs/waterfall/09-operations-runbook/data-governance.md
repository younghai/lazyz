# Data Governance Runbook

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Data Classification

| Class | Location | Sensitivity | Protection |
| --- | --- | --- | --- |
| Evidence files | `.omo/evidence/` | HIGH (may contain PII/secrets) | mode 0o700, redact-secrets.mjs |
| Audit logs | `.omo/*/ledger.jsonl` | HIGH (commands field) | mode 0o700, redact-secrets.mjs |
| Progress state | `.omo/boulder.json` | MEDIUM (plan_name, session_id) | mode 0o700 |
| Goals/criteria | `.omo/ulw-loop/goals.json` | MEDIUM | mode 0o700 |
| Telemetry | PostHog (opt-in) | LOW (hashed hostname) | opt-in gate |
| Counters | `.omo/start-work-continuation/` | LOW | mode 0o700 |

## 2. Access Control (RBAC)

LazyZ does not have multi-user RBAC (it is a local development tool). Instead, file permissions provide protection:

| Path | mode | Rationale |
| --- | --- | --- |
| `.omo/` subtree | 0o700 | Block group/other access to evidence/state (13 sites enforced) |
| `~/.zcode/v2/config.json` | 600 | Protect plaintext API keys (P0-1) |
| `~/.zcode/v2/` | 700 | Protect config directory (P0-1) |
| `~/.omo/telemetry-notified` | 0o700 (inherited) | Sentinel file |

## 3. PII / Secret Management

### Evidence File PII Vectors
- HTTP responses (`curl -i`): auth headers, cookies, session tokens
- tmux transcripts: shell-history-level exposure
- DB diffs: user data
- Screenshots: all visible information

### Mitigations
1. **First line of defense**: SKILL.md/directive.md prose ("redact secrets before writing")
2. **Second line of defense**: `scripts/redact-secrets.mjs` scrubber (post-hoc grep-based)
   - Patterns: sk-*, ghp_*, AKIA*, JWT, Bearer, key=value, connection string
   - `--fix` masks in place; without it acts as CI gate (exit 1)
3. **Third line of defense**: File permissions 0o700 (block other accounts)

## 4. Audit Trail

| Log | Reliability | Rotation |
| --- | --- | --- |
| `.omo/start-work/ledger.jsonl` | LOW (LLM-written, "fields drift") | prune-evidence.mjs (10k lines) |
| `.omo/ulw-loop/ledger.jsonl` | MEDIUM (TS CLI, mutation lock) | prune-evidence.mjs (10k lines) |
| `~/.local/share/lazycodex/bootstrap/bootstrap.log` | MEDIUM (TS, structured) | None |
| `~/.local/share/lazyz/telemetry-diagnostics.jsonl` | MEDIUM (TS, 256KB cap) | 7-day cap |

## 5. Data Retention / Disposal

| Data | Retention | Disposal method |
| --- | --- | --- |
| `.omo/evidence/` | 30 days or 100MB | `prune-evidence.mjs` (manual) |
| ledger.jsonl | Last 10,000 lines | `prune-evidence.mjs` (manual) |
| boulder.json | Until work completes | Manual delete or status transition |
| `~/.omo/codegraph/` | Permanent | Manual (`rm -rf`) |
| `~/.zcode/agents/` | Permanent | Overwrite via `install-agents.sh` |

## 6. Compliance

### GDPR / Privacy Act
- Telemetry: **opt-in** (OFF by default). Only sent when `LAZYZ_ENABLE_TELEMETRY=1` is set.
- Hashed hostname: pseudonymization with fixed salt. Not anonymous, but low identifiability.
- User data: evidence files may contain PII. Use redact-secrets.mjs for post-hoc scrubbing.
- Data sovereignty: PostHog US region (default). Overridable via `POSTHOG_HOST`.
