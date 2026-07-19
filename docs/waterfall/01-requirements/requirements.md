# 요구사항 명세

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |
| 기준 소스 | `plugins/lazyz/`, Sprint 1-2 구현 이력 |

## 1. 기능 요구사항

### FR-1: ZCode 플러그인으로 설치·운영
- FR-1.1: `.zcode-plugin/plugin.json` 매니페스트로 ZCode가 플러그인을 발견
- FR-1.2: `zcode plugin add lazyz@lazyz`로 설치 시 prebuilt dist로 빌드 불필요
- FR-1.3: 25 스킬, 16 훅, 5 MCP 서버가 정상 로드

### FR-2: 4단계 워크플로우
- FR-2.1: `init-deep` — 계층적 AGENTS.md 프로젝트 메모리 생성
- FR-2.2: `ulw-plan` — 탐색 선행 계획 (승인 게이트 후 plan 파일 작성)
- FR-2.3: `start-work` — boulder.json 기반 체크박스 실행 (Stop-hook 자동 재개)
- FR-2.4: `ulw-loop` — 다중 목표 검증 루프 (증거 기반 완료 게이트)

### FR-3: Sprint 2 기능
- FR-3.1: boulder.json `status: "blocked"` + `fail_count` 스키마 확장
- FR-3.2: 사이클 캡 (5 execution cycles, 3 same-failure type)
- FR-3.3: 디버깅 budget (2 failed rounds → debugging 스킬 로드)
- FR-3.4: Manual-QA 사전 안내 게이트 (SessionStart)

### FR-4: 에이전트 시스템
- FR-4.1: 10개 TOML 에이전트를 ZCode .md 서브에이전트로 변환
- FR-4.2: `scripts/install-agents.sh`로 `~/.zcode/agents/` 배포

## 2. 비기능 요구사항

### NFR-1: 보안
- NFR-1.1: `.omo/` 디렉토리 mode 0o700 (그룹/타인 접근 차단)
- NFR-1.2: 증거 파일 PII redaction 스크러버 (`redact-secrets.mjs`)
- NFR-1.3: telemetry opt-in (기본 OFF)

### NFR-2: 데이터 정합성
- NFR-2.1: `.lazyz-prompts.json` 원자적 쓰기 (temp+rename)
- NFR-2.2: 두 boulder 파서 동기화 CI 강제 (`Verify boulder parser sync`)
- NFR-2.3: vendor boulder-reader.ts와 메인 동기화

### NFR-3: 가용성
- NFR-3.1: run-hook.sh가 Node/dist 없으면 exit 0 (세션 차단 안 함)
- NFR-3.2: codegraph timeout 15s (detached worker로 비동기)

### NFR-4: 일관성
- NFR-4.1: 모든 표면의 숫자 통일 (25 skills, 16 hooks, 5 MCP, 4 commands)
- NFR-4.2: 버전 통일 (0.10.2)
- NFR-4.3: 스킬 description "Codex" 잔재 0건
- NFR-4.4: 브랜드 통일 ([LazyZ] 접두어)

## 3. 제약사항

- ZCode에 SubagentStop 이벤트 없음 → executor-verify는 advisory
- ZCode에 PostCompact 이벤트 없음 → 캐시 리셋은 SessionStart로 우회
- ZCode에 goal API / multi_agent_v1 없음 → 파일 기반 상태로 대체
- boulder.json은 LLM 작성 soft-schema → 코드 강제 불가, prose 가이드에 의존
- model은 GLM-5.2 단일 (reasoning_effort 제어 불가)
