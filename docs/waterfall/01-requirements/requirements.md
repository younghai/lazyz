# Requirements Specification

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |
| Source | `plugins/lazyz/`, Sprint 1-2 implementation history |

## 1. Functional Requirements

### FR-1: Install and operate as a ZCode plugin
- FR-1.1: ZCode discovers the plugin via `.zcode-plugin/plugin.json` manifest
- FR-1.2: `zcode plugin add lazyz@lazyz` works without a build step (prebuilt dist)
- FR-1.3: 25 skills, 16 hooks, 5 MCP servers load correctly

### FR-2: Four-stage workflow
- FR-2.1: `init-deep` — generates hierarchical AGENTS.md project memory
- FR-2.2: `ulw-plan` — explore-first planning (approval gate before plan file)
- FR-2.3: `start-work` — checkbox execution via boulder.json (Stop-hook auto-resume)
- FR-2.4: `ulw-loop` — multi-goal verification loop (evidence-based completion gate)

### FR-3: Sprint 2 features
- FR-3.1: boulder.json `status: "blocked"` + `fail_count` schema extension
- FR-3.2: Cycle caps (5 execution cycles, 3 same-failure type)
- FR-3.3: Debugging budget (2 failed rounds → load debugging skill)
- FR-3.4: Manual-QA pre-notification gate (SessionStart)

### FR-4: Agent system
- FR-4.1: 10 TOML agents converted to ZCode .md subagents
- FR-4.2: `scripts/install-agents.sh` deploys to `~/.zcode/agents/`

## 2. Nonfunctional Requirements

### NFR-1: Security
- NFR-1.1: `.omo/` directories mode 0o700 (block group/other access)
- NFR-1.2: Evidence file PII redaction scrubber (`redact-secrets.mjs`)
- NFR-1.3: Telemetry opt-in (OFF by default)

### NFR-2: Data integrity
- NFR-2.1: `.lazyz-prompts.json` atomic writes (temp+rename)
- NFR-2.2: Dual boulder parser sync enforced by CI (`Verify boulder parser sync`)
- NFR-2.3: Vendor boulder-reader.ts synced with main

### NFR-3: Availability
- NFR-3.1: run-hook.sh exits 0 when Node/dist missing (never blocks session)
- NFR-3.2: codegraph timeout 15s (detached worker, asynchronous)

### NFR-4: Consistency
- NFR-4.1: Count unification across all surfaces (25 skills, 16 hooks, 5 MCP, 4 commands)
- NFR-4.2: Version unification (0.10.2)
- NFR-4.3: Skill description "Codex" residue = 0
- NFR-4.4: Brand unification ([LazyZ] prefix)

## 3. Constraints

- ZCode has no SubagentStop event → executor-verify is advisory
- ZCode has no PostCompact event → cache reset moved to SessionStart
- ZCode has no goal API / multi_agent_v1 → file-based state instead
- boulder.json is LLM-written soft-schema → no code enforcement, relies on prose
- Model is GLM-5.2 single (no reasoning_effort control)
