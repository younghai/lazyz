# Service Planning

| Item | Value |
| --- | --- |
| Project | LazyZ |
| Document version | v1.0 |
| Date | 2026-07-19 |
| Status | as-built |
| Source | `plugins/lazyz/`, GitHub `younghai/lazyz` |

## 1. Service Overview

LazyZ is a port of the Codex agent harness (LazyCodex/OmO) as a ZCode plugin. It provides a four-stage discipline — project memory (init-deep), planning (ulw-plan), execution (start-work), and verified completion (ulw-loop) — as a single installable plugin inside ZCode.

## 2. Core Users

| User | Goal | Entry point |
| --- | --- | --- |
| ZCode developer | Add discipline (plan → execute → verify) to a coding agent | `/init-deep`, `/ulw-plan`, `/start-work`, `/ulw-loop` |
| Plugin developer | Study LazyZ structure to design their own plugin | `plugins/lazyz/` source, README, this waterfall doc |
| Operations lead | Verify data governance, security, incident readiness | `09-operations-runbook/`, `10-monitoring/` |

## 3. Core Values

| Value | Description | Verification metric |
| --- | --- | --- |
| Discipline porting | Bring LazyCodex's four-stage loop to ZCode | 25 skills, 16 hooks, 5 MCP loaded |
| Install-and-go | Prebuilt dist; no build step required | Skills appear after `zcode plugin add lazyz@lazyz` |
| Ecosystem growth | Reference for full-workflow plugins | GitHub repo, README workflow diagram |
| Privacy by default | Telemetry opt-in (OFF by default) | No event sent without `LAZYZ_ENABLE_TELEMETRY=1` |

## 4. Scope

### In Scope

- Codex→ZCode porting (manifest, hook events, agents, identifiers)
- Four-stage workflow (memory → plan → execute → verify)
- Sprint 2: boulder.json blocked status + fail_count + cycle caps + debugging budget
- Data governance hardening (13 items: file permissions, redaction, retention, atomic writes, CI sync)
- UX consistency (design review: count unification, version unification, Codex residue removal, message tiers)

### Out of Scope (deferred to Sprint 3)

- teammode skill (depends on Codex thread API, no ZCode equivalent)
- SubagentStop enforcement gate (ZCode unsupported, advisory only)
- SessionStart hook parallelization (ZCode behavior undetermined)
- boulder.json code-enforced caps (currently prose-only, LLM soft-schema)

## 5. Changes from Original

| Area | LazyCodex (Codex) | LazyZ (ZCode) |
| --- | --- | --- |
| Manifest | `.codex-plugin/plugin.json` | `.zcode-plugin/plugin.json` |
| Hook events | 7 (incl. SubagentStop, PostCompact) | 5 (ZCode-supported events only) |
| Agents | multi_agent_v1.spawn_agent + TOML | ZCode Agent tool + .md subagents |
| Models | GPT-5.5/GPT-5.4-mini (reasoning effort) | GLM-5.2 single (no reasoning control) |
| Telemetry | opt-out (ON by default) | opt-in (OFF by default, privacy-by-default) |
| Identifier | omo-codex / omo_codex_daily_active | lazyz / lazyz_daily_active |
