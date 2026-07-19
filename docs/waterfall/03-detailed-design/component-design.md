# 컴포넌트 상세 설계

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 컴포넌트 목록 (13개)

| 컴포넌트 | 훅 이벤트 | 주요 책임 | 빌드 도구 |
| --- | --- | --- | --- |
| bootstrap | SessionStart | 에이전트/dist 프로비저닝, ast-grep 바이너리 | tsc |
| codegraph | SessionStart, PostToolUse | 코드 그래프 MCP + 부트스트랩 | bun |
| comment-checker | PostToolUse | 주석 품질 검사 | bun |
| git-bash | PreToolUse | Windows Git Bash 추천 | tsc |
| lazycodex-executor-verify | PostToolUse(Agent) | 증거 영수증 검증 | tsc |
| lsp | PostToolUse | LSP 진단 | tsc |
| rules | SessionStart, UserPromptSubmit, PostToolUse | 프로젝트 룰 주입 | bun |
| start-work-continuation | Stop | boulder.json 기반 자동 재개 | bun |
| telemetry | SessionStart | DAU 이벤트 (opt-in) | bun |
| ultrawork | UserPromptSubmit | ultrawork directive 주입 | tsc |
| ulw-loop | UserPromptSubmit | 다중 목표 루프 CLI | tsc |
| work-status | SessionStart | 진행 상태 안내 + QA 게이트 | bun |
| test-support | (테스트만) | 테스트 픽스처 | - |

## 2. 핵심 컴포넌트 상세

### 2.1 bootstrap
- **진입점**: `hook session-start`
- **F1 수정 (CRITICAL)**: `.zcode-plugin/plugin.json` 읽기 + `ZCODE_PLUGIN_ROOT` env 인식 (구 `.codex-plugin`/`PLUGIN_ROOT`는 폴백)
- ** detached worker**: `hook session-start-worker` 서브커맨드로 비동기 프로비저닝
- **state**: `~/.local/share/lazycodex/bootstrap/state.json` (completedForVersion 기반 skip)

### 2.2 work-status
- **진입점**: `hook session-start`
- **4개 concern**: T4(resume), T5(init-deep 제안), T6(build-missing 경고), T7(Manual-QA 안내)
- **dedup**: `.omo/.lazyz-prompts.json` (1회/일/identity, temp+rename 원자적 쓰기)
- **Sprint 2**: blocked 상태 surface (⛔ 메시지)

### 2.3 start-work-continuation
- **진입점**: `hook stop`
- **재개 결정**: boulder.json → isContinuableStatus → remaining checkboxes → continuation counter
- **카운터**: `.omo/start-work-continuation/<session>.json` (MAX 10, temp+rename)

### 2.4 lazycodex-executor-verify
- **진입점**: `hook post-tool-use` (matcher: `^(Agent|Task)$`)
- **ZCode 우회**: SubagentStop 미지원 → PostToolUse+Agent로 best-effort proxy
- **검증**: `EVIDENCE_RECORDED: <path>` 영수증 + `.omo/evidence/` 비어있지 않은 파일
- **제약**: ZCode PostToolUse 입력에 agent_type/agent_id 없음 → tool_input.subagent_type으로 감지

## 3. boulder.json 스키마

```json
{
  "schema_version": 2,          // cosmetic (마이그레이션 게이트 아님)
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

### 두 파서 동기화 (CI 강제)

| 파일 | 역할 | 동기화 |
| --- | --- | --- |
| `components/work-status/src/work-status.ts` | SessionStart reader | CI diff 강제 |
| `components/start-work-continuation/src/boulder-reader.ts` | Stop-hook reader | CI diff 강제 |

CI step `Verify boulder parser sync`: `BoulderWorkStatus` union 값을 양쪽에서 추출하여 diff. 불일치 시 exit 1.
