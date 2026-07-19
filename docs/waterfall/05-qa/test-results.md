# 테스트 결과

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |
| 테스트 기간 | 2026-07-05 ~ 2026-07-19 |

## 1. 빌드 검증

| 컴포넌트 | 빌드 도구 | 결과 | dist 크기 |
| --- | --- | --- | --- |
| bootstrap | tsc → bun bundle | ✅ PASS | 124.4 KB |
| codegraph | bun | ✅ PASS | 108.9 KB |
| comment-checker | bun | ✅ PASS | — |
| git-bash | tsc | ✅ PASS | — |
| lazycodex-executor-verify | tsc | ✅ PASS | — |
| lsp | tsc | ✅ PASS | — |
| rules | bun | ✅ PASS | 154.3 KB |
| start-work-continuation | bun | ✅ PASS | 14.5 KB |
| telemetry | bun | ✅ PASS | 212.4 KB |
| ultrawork | tsc | ✅ PASS | — |
| ulw-loop | tsc | ✅ PASS | — |
| work-status | bun | ✅ PASS | 20.0 KB |

## 2. CI 검증

| 검증 항목 | 결과 |
| --- | --- |
| Verify hook outputs exist (13 components + 3 vendor) | ✅ PASS |
| Verify manifest consistency (hooks.json + .mcp.json) | ✅ PASS |
| Verify boulder parser sync (CI 신규 스텝) | ✅ PASS |

## 3. ZCode 등록 검증

| 항목 | 결과 | 증거 |
| --- | --- | --- |
| 마켓플레이스 등록 | ✅ | `known_marketplaces.json` lazyz pluginCount=1 |
| 플러그인 설치 | ✅ | `data/lazyz@lazyz/` 디렉토리 존재 |
| 스킬 노출 | ✅ | 세션에서 lazyz:* 24개 확인 |
| MCP 연결 | ✅ | context7, grep_app lazyz 스코프로 연결 |

## 4. 보안 검증

| 항목 | 결과 |
| --- | --- |
| API 키 config.json 권한 600 | ✅ PASS (P0-1) |
| `.omo/` mode 0o700 (13곳) | ✅ 코드 반영 |
| redact-secrets.mjs 스크러버 | ✅ 스크립트 동작 |
| telemetry opt-in (기본 OFF) | ✅ 코드 반영 |
| GitHub push 보안 스캔 | ✅ CRITICAL/HIGH 0건 |

## 5. 알려진 한계 (비차단)

| 한계 | 영향 | 추적 |
| --- | --- | --- |
| `schema_version` cosmetic (마이그레이션 게이트 아님) | 운영자 오판 위험 | 문서화 완료 |
| downgrade 시 blocked 상태 silent-stall | 사용자 혼란 | AGENTS.md 경고 |
| evidence 무한 증식 (자동 GC 없음) | 디스크 가득 | prune-evidence.mjs 수동 실행 |
| SessionStart 직렬 실행 | 최악 65s 지연 | known-limitations.md |
