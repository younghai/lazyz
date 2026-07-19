# 용어 정의

| 용어 | 정의 |
| --- | --- |
| **LazyZ** | ZCode 플러그인 배포판. 이 저장소의 제품명 |
| **LazyCodex** | Codex용 배포판. LazyZ의 원본 |
| **OmO** | oh-my-openagent. LazyCodex/LazyZ의 업스트림 하네스 |
| **ZCode** | 타겟 클라이언트 (플러그인 호스트) |
| **Codex** | 원본 클라이언트 (OpenAI) |
| **하네스(harness)** | 에이전트에 discipline을 부여하는 프레임워크 |
| **init-deep** | 계층적 AGENTS.md 프로젝트 메모리 생성 스킬 (Stage 1) |
| **ulw-plan** | 탐색 선행 계획 컨설턴트 스킬 (Stage 2) |
| **start-work** | boulder.json 기반 계획 실행 스킬 (Stage 3) |
| **ulw-loop** | 다중 목표 검증 루프 스킬 (Stage 4) |
| **boulder.json** | start-work의 진행 상태 파일 (`.omo/boulder.json`) |
| **goals.json** | ulw-loop의 목표/크리테리아 상태 파일 (`.omo/ulw-loop/goals.json`) |
| **ledger.jsonl** | 작업 감사 로그 (append-only JSONL) |
| **evidence** | 증거 파일 (HTTP 응답, tmux 트랜스크립트, 스크린샷 등) |
| **PIN→RED→GREEN→SURFACE→CLEAN** | start-work의 5단계 실행 루프 |
| **BoulderWorkStatus** | boulder.json의 work 상태 (active, paused, completed, abandoned, blocked) |
| **schema_version** | boulder.json의 문서용 필드 (cosmetic, 마이그레이션 게이트 아님) |
| **SubagentStop** | Codex 훅 이벤트 (ZCode 미지원, PostToolUse+Agent로 우회) |
| **PostCompact** | Codex 훅 이벤트 (ZCode 미지원, SessionStart로 우회) |
| **soft-schema** | LLM이 prose를 따라 작성하는 비강제 스키마 |
| **detached worker** | codegraph 프로비저닝의 비동기 백그라운드 작업 |
