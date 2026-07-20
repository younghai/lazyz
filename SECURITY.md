# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in LazyZ, please **do not** open a
public GitHub issue. Instead, report it privately:

1. Open a **GitHub Security Advisory** (Repository → Security → Advisories →
   New advisory).
2. Or email the maintainer directly via GitHub.

Please include:
- A description of the vulnerability
- Steps to reproduce
- The affected component (hooks, MCP, agents, scripts)
- The potential impact

You will receive a response within 72 hours. We will credit reporters in the
fix release unless you prefer to remain anonymous.

## Known Security Posture

### Telemetry
- **OFF by default** (privacy-by-default, opt-in).
- Enable: `export LAZYZ_ENABLE_TELEMETRY=1`.
- Data sent: hashed hostname, OS/runtime metadata only.
- Not sent: prompts, transcripts, source files, file paths, tokens, API keys.

### File Permissions
- `.omo/` state directories: mode `0o700` (owner-only access).
- `~/.zcode/v2/config.json`: mode `600` (API key protection).
- Evidence files: protected by parent directory mode.

### Secret Handling
- LazyZ hooks capture command output (HTTP responses, tmux transcripts) as
  evidence artifacts. These may contain secrets.
- **First line of defense**: SKILL.md instructs the agent to redact secrets
  before writing evidence.
- **Second line of defense**: `scripts/redact-secrets.mjs` — a post-hoc
  scrubber that scans `.omo/evidence/` and `ledger.jsonl` for common secret
  patterns (API keys, tokens, JWTs, connection strings). Run `--fix` to mask
  in place.
- **Third line of defense**: `.omo/` directory permissions block other users
  on shared hosts.

### What LazyZ Does NOT Do
- Does not make network requests (except opt-in telemetry to PostHog).
- Does not execute remote code.
- Does not transmit source files, prompts, or tokens.
- MCP servers (`grep_app`, `context7`) connect to their respective public APIs
  with no authentication required.
