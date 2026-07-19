# LazyZ Waterfall Documentation

> 기준일: 2026-07-19
> 범위: `plugins/lazyz/` 플러그인 전체 (Codex→ZCode 포팅, Sprint 1-2, 데이터 거버넌스, UX 검수)
> 소스 저장소: https://github.com/younghai/lazyz

이 문서 세트는 LazyZ ZCode 플러그인을 워터폴 산출물 관점으로 정리한 것이다.
구현이 이미 완료된 상태에서 각 단계를 as-built 기준으로 역추적하여 작성했다.

## 문서 구성

| Phase | 단계 | 문서 | 목적 |
| --- | --- | --- | --- |
| 0 | 기획 | [서비스 기획](00-planning/service-planning.md), [비즈니스 정책](00-planning/business-policy.md) | 제품 목적, 사용자, 범위, 운영 정책 |
| 1 | 요구사항 | [요구사항 명세](01-requirements/requirements.md), [용어](01-requirements/terminology.md) | 기능/비기능 요구사항, 제약 |
| 2 | 시스템 설계 | [아키텍처](02-system-design/system-architecture.md), [데이터 흐름](02-system-design/data-flow.md) | 아키텍처, 컴포넌트, 데이터 흐름 |
| 3 | 상세 설계 | [컴포넌트 설계](03-detailed-design/component-design.md), [상태머신](03-detailed-design/state-machines.md) | 모듈 책임, 상태 흐름, 스키마 |
| 4 | 구현 | [구현 현황](04-implementation/implementation.md) | 파일 배치, 구현된 기능, 스프린트 이력 |
| 5 | QA | [QA 계획](05-qa/qa-plan.md), [테스트 결과](05-qa/test-results.md) | 검증 전략, 릴리스 게이트 |
| 6 | 배포 | [배포 계획](06-deployment/deployment-plan.md), [운영 가이드](06-deployment/operations-guide.md) | 배포 절차, 롤백, 환경 |
| 7 | 유지보수 | [유지보수 계획](07-maintenance/maintenance.md) | 정기 점검, 백로그 |
| 8 | 검토 | [단계별 체크리스트](08-review/phase-checklist.md), [산출물 목록](08-review/project-artifacts.md) | 단계 게이트, 정합성 |
| 9 | 운영 런북 | [데이터 거버넌스](09-operations-runbook/data-governance.md), [장애 대응](09-operations-runbook/incident-response.md) | 운영 절차, 장애, 복구 |
| 10 | 모니터링 | [모니터링/SLO](10-monitoring/monitoring-slo.md) | 지표, 알림, 가시성 |

## 빠른 사실

| 항목 | 내용 |
| --- | --- |
| 제품 | LazyZ |
| 유형 | ZCode 플러그인 (에이전트 하네스) |
| 핵심 가치 | 프로젝트 메모리, 계획, 실행, 검증 완료를 ZCode 안에서 하나의 플러그인으로 |
| 원본 | LazyCodex (Codex 배포판) → OmO — oh-my-openagent |
| 언어/런타임 | TypeScript, Node.js 20+, Bun (빌드) |
| 컴포넌트 | 25 스킬, 10 에이전트, 16 훅, 5 MCP 서버, 4 커맨드 |
| 저장소 | https://github.com/younghai/lazyz |
| 버전 | 0.10.2 |
| 라이선스 | MIT |

## 운영 가능성 기준

이 문서 세트에서 "운영 가능"은 다음 조건을 모두 충족한다는 의미다.

1. [배포 계획](06-deployment/deployment-plan.md)의 go/no-go gate가 PASS.
2. ZCode 플러그인 마켓플레이스 등록이 완료되고 스킬/MCP/훅이 정상 로드됨.
3. [데이터 거버넌스](09-operations-runbook/data-governance.md)의 P0 항목이 해소됨.
4. [장애 대응](09-operations-runbook/incident-response.md) 런북이 최신 범위와 일치함.
5. GitHub push가 완료되고 설치 검증이 통과함.

## 워터폴 운영 원칙

1. 요구사항 변경은 `01-requirements/requirements.md`를 먼저 갱신한다.
2. 설계 변경은 `02-system-design/`과 `03-detailed-design/` 양쪽에 반영한다.
3. 코드 변경은 `04-implementation/implementation.md`의 파일 맵을 갱신한다.
4. 데이터 스키마 변경 시 두 파서(work-status, boulder-reader) 동기화를 CI가 강제한다.
5. 모든 단계 완료 판단은 `08-review/phase-checklist.md`의 게이트로 남긴다.
