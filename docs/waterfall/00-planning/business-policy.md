# Business Policy

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. License

MIT. Inherited from upstream LazyCodex/OmO sources.

## 2. Telemetry Policy

- **OFF by default** (privacy-by-default, GDPR-aligned)
- Enable: `LAZYZ_ENABLE_TELEMETRY=1` (or legacy `OMO_ENABLE_TELEMETRY=1`)
- Disable: `~/.omo/telemetry-disabled` file or `LAZYZ_DISABLE_POSTHOG=1`
- Transmitted data: hashed hostname, OS/runtime metadata, event name, day_utc
- Not transmitted: prompts, transcripts, source files, file paths, tokens, API keys

## 3. Data Retention Policy

| Data | Location | Retention | Cleanup tool |
| --- | --- | --- | --- |
| `.omo/evidence/` | Project local | 30 days or 100MB | `scripts/prune-evidence.mjs` |
| `.omo/*/ledger.jsonl` | Project local | Last 10,000 lines | `scripts/prune-evidence.mjs` |
| `.omo/boulder.json` | Project local | Until work completes | Manual (LLM-written) |
| `~/.omo/codegraph/` | Home | Permanent (no GC) | Manual |
| `~/.local/share/lazyz/` | Home | Permanent (telemetry dedup) | Manual |

## 4. Security Policy

- `.omo/` directories: mode 0o700 enforced (13 sites)
- `~/.zcode/v2/`: mode 600/700 (P0-1 complete)
- Evidence PII: `scripts/redact-secrets.mjs` scrubber (sk-*, ghp_*, JWT, Bearer, DB connection strings)
- `--fix` flag for masking; without it acts as CI gate (exit 1)

## 5. Non-Affiliation

LazyZ is not affiliated with Sisyphus Labs. All credit for the underlying harness belongs to the OmO maintainers.
