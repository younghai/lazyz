# Component Detailed Design

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Component List (13)

| Component | Hook events | Key responsibility | Build tool |
| --- | --- | --- | --- |
| bootstrap | SessionStart | Agent/dist provisioning, ast-grep binary | tsc |
| codegraph | SessionStart, PostToolUse | Code graph MCP + bootstrap | bun |
| comment-checker | PostToolUse | Comment quality check | bun |
| git-bash | PreToolUse | Windows Git Bash recommendation | tsc |
| lazycodex-executor-verify | PostToolUse(Agent) | Evidence receipt verification | tsc |
| lsp | PostToolUse | LSP diagnostics | tsc |
| rules | SessionStart, UserPromptSubmit, PostToolUse | Project rule injection | bun |
| start-work-continuation | Stop | boulder.json-based auto-resume | bun |
| telemetry | SessionStart | DAU event (opt-in) | bun |
| ultrawork | UserPromptSubmit | ultrawork directive injection | tsc |
| ulw-loop | UserPromptSubmit | Multi-goal loop CLI | tsc |
| work-status | SessionStart | Progress notification + QA gate | bun |
| test-support | (tests only) | Test fixtures | - |

## 2. Key Component Details

### 2.1 bootstrap
- **Entry point**: `hook session-start`
- **F1 fix (CRITICAL)**: reads `.zcode-plugin/plugin.json` + recognizes `ZCODE_PLUGIN_ROOT` env (legacy `.codex-plugin`/`PLUGIN_ROOT` as fallback)
- **Detached worker**: `hook session-start-worker` subcommand for async provisioning
- **State**: `~/.local/share/lazycodex/bootstrap/state.json` (skip based on completedForVersion)

### 2.2 work-status
- **Entry point**: `hook session-start`
- **4 concerns**: T4 (resume), T5 (init-deep suggestion), T6 (build-missing warning), T7 (Manual-QA notice)
- **Dedup**: `.omo/.lazyz-prompts.json` (once/day/identity, temp+rename atomic write)
- **Sprint 2**: blocked status surface (⛔ message)

### 2.3 start-work-continuation
- **Entry point**: `hook stop`
- **Resume decision**: boulder.json → isContinuableStatus → remaining checkboxes → continuation counter
- **Counter**: `.omo/start-work-continuation/<session>.json` (MAX 10, temp+rename)

### 2.4 lazycodex-executor-verify
- **Entry point**: `hook post-tool-use` (matcher: `^(Agent|Task)$`)
- **ZCode workaround**: SubagentStop unsupported → PostToolUse+Agent as best-effort proxy
- **Verification**: `EVIDENCE_RECORDED: <path>` receipt + `.omo/evidence/` non-empty file
- **Constraint**: ZCode PostToolUse input has no agent_type/agent_id → detect via tool_input.subagent_type

## 3. boulder.json Schema

```json
{
  "schema_version": 2,
  "active_work_id": "<work-id>",
  "works": {
    "<work-id>": {
      "work_id": "<work-id>",
      "active_plan": ".omo/plans/<plan-name>.md",
      "plan_name": "<plan-name>",
      "session_ids": ["codex:<session_id>"],
      "status": "active|paused|completed|abandoned|blocked",
      "fail_count": 0,
      "worktree_path": null
    }
  }
}
```

### Dual-Parser Sync (CI-enforced)

| File | Role | Sync |
| --- | --- | --- |
| `components/work-status/src/work-status.ts` | SessionStart reader | CI diff enforced |
| `components/start-work-continuation/src/boulder-reader.ts` | Stop-hook reader | CI diff enforced |

CI step `Verify boulder parser sync`: extracts `BoulderWorkStatus` union values from both and diffs. Exits 1 on mismatch.
