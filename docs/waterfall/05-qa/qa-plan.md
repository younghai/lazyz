# QA 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 검증 전략

### 자동화 검증 (CI)

| 검증 | 방법 | 게이트 |
| --- | --- | --- |
| 컴포넌트 빌드 | `npm run build` (13개 컴포넌트) | dist/cli.js 존재 |
| 매니페스트 일관성 | hooks.json/.mcp.json 경로 → dist 파일 존재 | 깨진 참조 exit 1 |
| boulder 파서 동기화 | BoulderWorkStatus enum diff (work-status vs boulder-reader) | 불일치 exit 1 |
| prebuilt dist 존재 | components/*/dist/ + vendor/*/dist/ | 누락 exit 1 |

### 수동 검증 (ZCode 세션)

| 시나리오 | 방법 | 기대 결과 |
| --- | --- | --- |
| 스킬 노출 | ZCode `/` 메뉴 또는 Settings → Skills | lazyz:* 25개 노출 |
| MCP 연결 | `/mcp` 메뉴 | 5개 서버 표시 |
| SessionStart 훅 | 세션 시작 | `(LazyZ)` 상태 메시지 |
| 스킬 호출 | `/init-deep` 실행 | AGENTS.md 생성 |
| 에이전트 노출 | `install-agents.sh` 실행 후 Agent tool | 10개 subagent_type 표시 |

### 보안 검증

| 시나리오 | 방법 | 기대 결과 |
| --- | --- | --- |
| 파일 권한 | `.omo/` 생성 후 `ls -la` | drwx------ (0700) |
| PII 스크러버 | `node scripts/redact-secrets.mjs` (증거 파일에 secret 포함) | secret 발견 시 exit 1 |
| telemetry opt-in | `LAZYZ_ENABLE_TELEMETRY` 없이 세션 시작 | 이벤트 전송 안 함 |

## 2. 테스트 매트릭스

| 영역 | 테스트 범위 | 상태 |
| --- | --- | --- |
| 컴포넌트 빌드 | 13개 전부 tsc/bun 빌드 | ✅ 통과 |
| JSON 유효성 | plugin.json, marketplace.json, hooks.json, .mcp.json | ✅ 통과 |
| CI boulder 동기화 | BoulderWorkStatus 양쪽 5값 일치 | ✅ 통과 |
| ZCode 등록 | plugin install → 스킬/MCP 노출 | ✅ 통과 (24 스킬, 2 MCP 확인) |
| F1 bootstrap | `.zcode-plugin` + ZCODE_PLUGIN_ROOT 인식 | ✅ 빌드 반영 확인 |
| 파일 권한 | 13곳 mode 0o700 | ✅ 코드 반영 |
| telemetry opt-in | 기본 OFF | ✅ 빌드 반영 확인 |

## 3. 잔여 리스크

| 리스크 | 심각도 | 상태 |
| --- | --- | --- |
| boulder.json soft-schema (LLM 작성) | MEDIUM | prose 가이드에 의존 (코드 강제는 Sprint 3) |
| SubagentStop 미지원 | MEDIUM | PostToolUse advisory (강제성 약화) |
| SessionStart 직렬 지연 | LOW | 최악 65s (각 훅 독립 타임아웃) |
| model 단일화 (GLM-5.2) | LOW | reasoning_effort 불가 (영구적 한계) |
| teammode 미포팅 | LOW | vendor 보관 (Sprint 3) |
