# Terminology

| Term | Definition |
| --- | --- |
| **LazyZ** | The ZCode plugin distribution. The product name of this repository. |
| **LazyCodex** | The Codex distribution. The original of LazyZ. |
| **OmO** | oh-my-openagent. The upstream harness of LazyCodex/LazyZ. |
| **ZCode** | The target client (plugin host). |
| **Codex** | The original client (OpenAI). |
| **Harness** | A framework that adds discipline to an agent. |
| **init-deep** | Skill that generates hierarchical AGENTS.md project memory (Stage 1). |
| **ulw-plan** | Explore-first planning consultant skill (Stage 2). |
| **start-work** | Skill that executes a plan via boulder.json (Stage 3). |
| **ulw-loop** | Multi-goal verification loop skill (Stage 4). |
| **boulder.json** | start-work progress state file (`.omo/boulder.json`). |
| **goals.json** | ulw-loop goal/criteria state file (`.omo/ulw-loop/goals.json`). |
| **ledger.jsonl** | Append-only audit log (JSONL). |
| **evidence** | Evidence files (HTTP responses, tmux transcripts, screenshots, etc.). |
| **PIN→RED→GREEN→SURFACE→CLEAN** | The 5-step execution loop of start-work. |
| **BoulderWorkStatus** | The work status enum in boulder.json (active, paused, completed, abandoned, blocked). |
| **schema_version** | Documentation field in boulder.json (cosmetic, not a migration gate). |
| **SubagentStop** | Codex hook event (unsupported in ZCode, worked around with PostToolUse+Agent). |
| **PostCompact** | Codex hook event (unsupported in ZCode, worked around with SessionStart). |
| **soft-schema** | A non-enforced schema written by an LLM following prose instructions. |
| **detached worker** | An asynchronous background job for codegraph provisioning. |
