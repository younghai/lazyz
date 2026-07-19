# 모니터링 / SLO

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 가시성 현황

LazyZ는 로컬 개발 도구이므로 전통적 서비스 모니터링(메트릭/대시보드)이 없다. 대신 다음 채널로 가시성을 제공:

| 채널 | 내용 | 사용자 노출 |
| --- | --- | --- |
| stderr 진단 | `[LazyZ]` 접두어 메시지 (run-hook.sh) | ZCode 세션 |
| SessionStart additionalContext | `⏳💡⚠️ℹ️⛔` 이모지 메시지 (work-status) | ZCode 세션 |
| bootstrap.log | `~/.local/share/lazycodex/bootstrap/bootstrap.log` (JSONL) | 파일만 |
| telemetry-diagnostics.jsonl | `~/.local/share/lazyz/telemetry-diagnostics.jsonl` (256KB cap) | 파일만 |
| CI | GitHub Actions (빌드, 매니페스트, 파서 동기화) | GitHub |
| ledger.jsonl | `.omo/*/ledger.jsonl` (작업 이벤트) | 파일만 |

## 2. SLO 정의

LazyZ는 로컬 도구이므로 엄격한 SLO보다는 "사용자 기대 품질" 기준:

| 지표 | 목표 | 측정 방법 |
| --- | --- | --- |
| SessionStart 훅 지연 | < 15s (훅별) | 각 훅 timeout (15s/10s/5s) |
| 스킬 발동률 | 100% (등록된 스킬) | ZCode `/` 메뉴 노출 |
| MCP 연결률 | 100% (required: false는 제외) | `/mcp` 메뉴 |
| 빌드 성공률 | 100% (CI) | GitHub Actions |
| 조용한 실패 | 0건 (사용자 인지 못하는 장애) | stderr + additionalContext |

## 3. 알림

LazyZ 자체 알림 시스템은 없다. 대신:

| 조건 | 알림 방법 |
| --- | --- |
| Node.js 없음 | stderr 3줄 진단 + exit 0 |
| dist 없음 | stderr 진단 + exit 0 |
| MCP 빌드 누락 | SessionStart `⚠️ LazyZ:` 메시지 (1회/일) |
| boulder.json 파싱 실패 | SessionStart `⏳ LazyZ:` degraded 메시지 |
| 작업 blocked | SessionStart `⛔ LazyZ:` 메시지 |
| init-deep 미실행 | SessionStart `💡 LazyZ:` 제안 (1회/일) |

## 4. 모니터링 갭 (Sprint 3 추적)

| 갭 | 영향 | 추적 |
| --- | --- | --- |
| stderr가 ZCode에 표시되는지 미확정 | 사용자가 진단을 못 볼 수 있음 | ZCode 동작 조사 필요 |
| bootstrap degraded가 사용자에게 안 보임 | 부분 동작 상태를 모름 | additionalContext 노출 검토 |
| evidence 디스크 사용량 모니터링 없음 | 디스크 가득 참 | prune-evidence.mjs 자동화 |
| telemetry DAU가 운영 모니터링용이 아님 | 설치 베이스 파악만 | product events (Sprint 3) |
