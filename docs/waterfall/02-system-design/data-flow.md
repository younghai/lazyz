# Data Flow

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Four-Stage Workflow Data Flow

```
 ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Memory  │ ──▶ │  2. Plan     │ ──▶ │  3. Execute  │ ──▶ │  4. Verify   │
 │  init-deep  │     │  ulw-plan    │     │  start-work  │     │  ulw-loop    │
 └─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
        │                   │                    │                     │
        ▼                   ▼                    ▼                     ▼
   AGENTS.md          .omo/plans/          .omo/boulder.json      evidence ledger
   hierarchy          decision-complete     checkbox progress      (artifacts,
   (read every        plan + approval       + Stop-hook            not claims)
   session)           gate before code      continuation
```

## 2. SessionStart Hook Chain (sequential)

```
ZCode SessionStart
   ├─[1] bootstrap (15s)     → agent/dist provisioning
   ├─[2] codegraph (15s)     → code graph background bootstrap
   ├─[3] rules (10s)         → project rule injection
   ├─[4] telemetry (5s)      → DAU event (only when opt-in)
   ├─[5] work-status (10s)   → in-progress work notice + Manual-QA gate
   └─[6] migrate (10s)       → Codex config migration
```

## 3. State File Catalog

### Project Local (`.omo/`)

| File | Writer | Atomic write | Lifecycle |
| --- | --- | --- | --- |
| `boulder.json` | start-work LLM | No (soft-schema) | Until work completes |
| `plans/<slug>.md` | ulw-plan | No | Permanent (no GC) |
| `start-work/ledger.jsonl` | start-work LLM | No (append) | prune script |
| `ulw-loop/goals.json` | ulw-loop CLI | Yes (tmp+rename) | Permanent |
| `ulw-loop/ledger.jsonl` | ulw-loop CLI | Yes (mutation lock) | prune script |
| `evidence/` | executor/QA | No | prune (30 days/100MB) |
| `start-work-continuation/<session>.json` | Stop hook | Yes (tmp+rename) | Deleted on completion |
| `lazycodex-executor-verify/<id>.json` | PostToolUse hook | Yes (tmp+rename) | Deleted after verification |
| `.lazyz-prompts.json` | work-status | Yes (tmp+rename) | Permanent (dedup) |

### Home Persistent (`~/`)

| Path | Purpose | Atomic write |
| --- | --- | --- |
| `~/.omo/telemetry-notified` | First-run notice sentinel | No |
| `~/.omo/telemetry-disabled` | Opt-out sentinel | n/a (user-created) |
| `~/.omo/codegraph/` | codegraph binary + logs | Provisioning lock |
| `~/.local/share/lazyz/` | PostHog activity state | Yes |
| `~/.local/share/lazycodex/` | auto-update state | No (lock present) |
| `~/.codex/codex-rules/` | rules session cache | Session lock |
| `~/.zcode/agents/` | Installed subagents | install-agents.sh |

## 4. Data Integrity Risks and Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| boulder.json dual-parser drift | HIGH | CI `Verify boulder parser sync` enforced |
| boulder.json non-atomic writes (LLM) | HIGH | Defensive parser (degraded fallback) |
| Evidence PII in plaintext | HIGH | `redact-secrets.mjs` scrubber |
| `.omo/` permissions umask 022 | HIGH | mode 0o700 enforced (13 sites) |
| Evidence unbounded growth | MEDIUM | `prune-evidence.mjs` (30 days/100MB) |
| `.lazyz-prompts.json` race | MEDIUM | temp+rename atomic write |
