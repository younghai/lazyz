# 단계별 체크리스트

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## Phase 0: 기획

- [x] 서비스 목적 정의 (4단계 discipline)
- [x] 핵심 사용자 식별 (ZCode 개발자, 플러그인 개발자, 운영 담당자)
- [x] 범위 확정 (In/Out Scope)
- [x] 원본 대비 변경 정리 (LazyCodex vs LazyZ)

## Phase 1: 요구사항

- [x] 기능 요구사항 정의 (FR-1 ~ FR-4)
- [x] 비기능 요구사항 정의 (NFR-1 ~ NFR-4)
- [x] 제약사항 식별 (ZCode 한계 5가지)
- [x] 용어 정의

## Phase 2: 시스템 설계

- [x] 아키텍처 다이어그램
- [x] 컴포넌트 계층 (스킬/훅/MCP/에이전트)
- [x] 데이터 흐름 (4단계 워크플로우 + SessionStart 체인)
- [x] vendor 경계 정의

## Phase 3: 상세 설계

- [x] 13개 컴포넌트 상세
- [x] boulder.json 상태머신
- [x] ulw-loop 골 상태머신
- [x] continuation 카운터 로직
- [x] 두 파서 동기화 메커니즘

## Phase 4: 구현

- [x] Sprint 1 포팅 (6 Phase)
- [x] Sprint 2 D·E·L (7 TASK)
- [x] 데이터 거버넌스 (13개 항목)
- [x] UX 디자인 검수 (12개 항목)
- [x] GitHub push (9 커밋)

## Phase 5: QA

- [x] 13개 컴포넌트 빌드 성공
- [x] CI 3종 검증 통과 (hook outputs, manifest, parser sync)
- [x] ZCode 등록 검증 (스킬/MCP 노출)
- [x] 보안 검증 (권한, PII, telemetry)
- [x] 잔여 리스크 문서화

## Phase 6: 배포

- [x] go/no-go gate PASS
- [x] GitHub 저장소 push 완료
- [x] prebuilt dist 정책 일관
- [x] 롤백 절차 문서화

## Phase 7: 유지보수

- [x] 정기 점검 항목 정의
- [x] Sprint 3 백로그 정리
- [x] 변경 통제 절차 정의

## Phase 8: 검토

- [x] 단계별 체크리스트 (본 문서)
- [x] 산출물 목록
- [x] 정합성 점검 (숫자/버전/브랜드/telemetry)

## Phase 9: 운영 런북

- [x] 데이터 거버넌스 가이드
- [x] 장애 대응 런북
- [x] 백업/복구 가이드

## Phase 10: 모니터링

- [x] 가시성 현황 (stderr, degraded ledger)
- [x] SLO 정의
- [x] 모니터링 갭 식별
