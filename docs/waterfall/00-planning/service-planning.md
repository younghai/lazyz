# 서비스 기획서

| 항목 | 내용 |
| --- | --- |
| 프로젝트명 | LazyZ |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |
| 문서 상태 | as-built |
| 기준 소스 | `plugins/lazyz/`, GitHub `younghai/lazyz` |

## 1. 서비스 개요

LazyZ는 Codex용 에이전트 하네스(LazyCodex/OmO)를 ZCode 플러그인으로 포팅한 것이다. 프로젝트 메모리(init-deep), 계획(ulw-plan), 실행(start-work), 검증 완료(ulw-loop)의 4단계 discipline을 ZCode 안에서 하나의 설치 가능한 플러그인으로 제공한다.

## 2. 핵심 사용자

| 사용자 | 목표 | 주요 진입점 |
| --- | --- | --- |
| ZCode 개발자 | 코딩 에이전트에 discipline(계획→실행→검증)을 부여 | `/init-deep`, `/ulw-plan`, `/start-work`, `/ulw-loop` |
| 플러그인 개발자 | LazyZ 구조를 참고해 자체 플러그인 설계 | `plugins/lazyz/` 소스, README, 이 waterfall 문서 |
| 운영 담당자 | 데이터 거버넌스, 보안, 장애 대응 기준 확인 | `09-operations-runbook/`, `10-monitoring/` |

## 3. 핵심 가치

| 가치 | 설명 | 검증 지표 |
| --- | --- | --- |
| Discipline 이식 | LazyCodex의 4단계 루프를 ZCode로 가져옴 | 25 스킬, 16 훅, 5 MCP 로드 확인 |
| 설치 즉시 사용 | prebuilt dist로 빌드 없이 작동 | `zcode plugin add lazyz@lazyz` 후 스킬 노출 |
| 생태계 확산 | 풀워크플로우 플러그인의 레퍼런스 | GitHub 저장소, README 워크플로우 다이어그램 |
| 프라이버시 기본값 | telemetry opt-in (OFF by default) | `LAZYZ_ENABLE_TELEMETRY=1` 없으면 전송 안 함 |

## 4. 범위

### In Scope

- Codex→ZCode 포팅 (매니페스트, 훅 이벤트, 에이전트, 식별자)
- 4단계 워크플로우 (memory → plan → execute → verify)
- Sprint 2: boulder.json blocked 상태 + fail_count + 사이클 캡 + 디버깅 budget
- 데이터 거버넌스 강화 (13개 항목: 파일 권한, redaction, retention, 원자적 쓰기, CI 동기화)
- UX 일관성 (디자인 검수 12건: 숫자 통일, 버전 통일, Codex 잔재 제거, 메시지 tier)

### Out of Scope (Sprint 3 이월)

- teammode 스킬 (Codex thread API 의존, ZCode 대안 없음)
- SubagentStop 강제 게이트 (ZCode 미지원, advisory only)
- SessionStart 훅 병렬화 (ZCode 동작 미확정)
- boulder.json 코드 강제 캡 (현재 prose-only, LLM soft-schema)

## 5. 원본 대비 변경

| 영역 | LazyCodex (Codex) | LazyZ (ZCode) |
| --- | --- | --- |
| 매니페스트 | `.codex-plugin/plugin.json` | `.zcode-plugin/plugin.json` |
| 훅 이벤트 | 7개 (SubagentStop, PostCompact 포함) | 5개 (ZCode 지원 이벤트만) |
| 에이전트 | multi_agent_v1.spawn_agent + TOML | ZCode Agent tool + .md 서브에이전트 |
| 모델 | GPT-5.5/GPT-5.4-mini (reasoning effort) | GLM-5.2 단일 (reasoning 제어 불가) |
| Telemetry | opt-out (기본 ON) | opt-in (기본 OFF, privacy-by-default) |
| 식별자 | omo-codex / omo_codex_daily_active | lazyz / lazyz_daily_active |
