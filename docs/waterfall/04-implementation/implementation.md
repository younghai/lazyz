# 구현 현황

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |
| 기준 소스 | GitHub `younghai/lazyz` 커밋 이력 (9개) |

## 1. 스프린트 이력

### Sprint 1 (2026-07-05 ~ 07-12): Codex→ZCode 포팅

| Phase | 작업 | 커밋 |
| --- | --- | --- |
| 1 | 매니페스트 정비 (plugin.json hooks/agents 필드, marketplace.json) | `0f2abbc` |
| 2 | 10개 TOML 에이전트 → ZCode .md 서브에이전트 변환 | `0f2abbc` |
| 3 | SubagentStop 우회 (PostToolUse+Agent 매처) | `0f2abbc` |
| 4 | 스킬 잔재 정리 (description "Codex"→"ZCode" 3건) | `0f2abbc` |
| 5 | 식별자 리브랜드 (package.json @lazyz/*, telemetry lazyz) | `0f2abbc` |
| 6 | ZCode 등록 사전 검증 | `0f2abbc` |

### Sprint 2 (2026-07-12): D·E·L 기능

| TASK | 작업 |
| --- | --- |
| L-1 | boulder.json 스키마 확장 (blocked + fail_count, 두 파서 동시 수정) |
| E-1/E-2 | start-work 사이클 캡 (5/3) + 디버깅 budget prose |
| E-3 | directive.md 캡 규칙 확장 |
| L-2 | SKILL.md boulder.json 예시 확장 |
| L-3 | hook.ts blocked 상태 surface |
| D-1 | hook.ts maybeManualQaNotice 추가 |
| D-2 | SKILL.md pre-Phase 1 Manual-QA 안내 블록 |

### 데이터 거버넌스 강화 (2026-07-17)

| 항목 | 작업 | 커밋 |
| --- | --- | --- |
| F1 (P0) | bootstrap `.zcode-plugin` + `ZCODE_PLUGIN_ROOT` 인식 | `e3593a8` |
| G2 (P1) | `.omo/` mode 0o700 강제 (13곳) | `e3593a8`, `b30877a` |
| G1+G3 (P1) | `redact-secrets.mjs` PII 스크러버 | `b30877a` |
| C1 (P3) | `prune-evidence.mjs` retention | `b30877a` |
| M3 (P2) | CI `Verify boulder parser sync` | `b30877a` |
| C5 (P3) | telemetry 완전 opt-in (기본 OFF) | `96380fb` |
| C3/C4 (P3) | codegraph timeout 15s 정합화 | `96380fb` |

### UX 디자인 검수 (2026-07-19)

| 항목 | 작업 | 커밋 |
| --- | --- | --- |
| D1-D5 | 숫자 통일, 버전 통일, Codex 잔재 제거, 메시지 tier, 브랜드 통일 | `6399ae4` |
| N1-N7 | coding-agent-sessions, lcx-*, lsp-setup, start-work, init-deep, telemetry 정합, author.url | `893c2ec` |

## 2. 파일 맵 (주요 수정 파일)

### 매니페스트/설정
- `plugins/lazyz/.zcode-plugin/plugin.json` — hooks/agents 필드, author.url 교정
- `plugins/lazyz/marketplace.json` — 루트 공식 패턴 (source: "./plugins/lazyz")
- `plugins/lazyz/hooks/hooks.json` — 16 훅, codegraph timeout 15s
- `plugins/lazyz/.mcp.json` — 5 MCP 서버

### 컴포넌트 (수정된 것)
- `components/bootstrap/src/hook.ts` — ZCODE_PLUGIN_ROOT 인식
- `components/bootstrap/src/worker.ts` — .zcode-plugin 읽기, doctor hint 교정
- `components/bootstrap/src/setup.ts` — mode 0o700
- `components/work-status/src/hook.ts` — T7 Manual-QA, blocked surface, 원자적 쓰기, 메시지 tier
- `components/work-status/src/work-status.ts` — BoulderWorkStatus blocked + failCount
- `components/start-work-continuation/src/boulder-reader.ts` — 동기화
- `components/start-work-continuation/src/continuation-counter.ts` — mode 0o700
- `components/start-work-continuation/directive.md` — 캡 규칙 확장
- `components/telemetry/src/codex-hook.ts` — opt-in 게이트, 알림 개선
- `components/telemetry/src/product-identity.ts` — lazyz 식별자
- `components/lazycodex-executor-verify/src/codex-hook.ts` — PostToolUse 핸들러
- `components/lazycodex-executor-verify/src/types.ts` — PostToolUseInput/DenyOutput
- `components/lazycodex-executor-verify/src/state.ts` — mode 0o700
- `components/ulw-loop/src/plan-io.ts` — mode 0o700
- `components/git-bash/src/codex-hook.ts` — mode 0o700
- `components/lsp/src/lsp-session-state.ts` — mode 0o700
- `components/codegraph/src/session-start-worker.ts` — mode 0o700

### 스킬/커맨드
- `skills/start-work/SKILL.md` — Manual-QA 블록, 캡, budget, boulder.json 예시
- `skills/comment-checker/SKILL.md`, `lsp/`, `rules/`, `ultrawork/` — Codex→ZCode
- `skills/init-deep/SKILL.md` — description 트리거 추가
- `skills/coding-agent-sessions/SKILL.md` — ZCode 추가
- `skills/lcx-*/SKILL.md` (3개) — LazyZ 기준
- `skills/lsp-setup/SKILL.md` — 한국어 제거
- `commands/start-work.md` — Boulder/Codex 제거

### 신규 스크립트
- `scripts/redact-secrets.mjs` — PII/secret 스크러버
- `scripts/prune-evidence.mjs` — retention pruner
- `scripts/install-agents.sh` — 서브에이전트 배포

### 신규 에이전트 (10개)
- `agents/explorer.md`, `librarian.md`, `plan.md`, `metis.md`, `momus.md`
- `agents/lazycodex-executor.md`, `lazycodex-qa-executor.md`
- `agents/lazycodex-code-reviewer.md`, `lazycodex-gate-reviewer.md`, `lazycodex-clone-fidelity-reviewer.md`

### CI
- `.github/workflows/ci.yml` — `Verify boulder parser sync` 스텝 추가

### 문서
- `README.md` — 워크플로우 다이어그램, Changelog, opt-in
- `AGENTS.md` — Downgrade compatibility, subagent wiring
- `docs/known-limitations.md` — schema_version cosmetic, SessionStart latency
