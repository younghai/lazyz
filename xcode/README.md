# xcode 문서 중앙 저장소

> AI-native coding IDE / agent harness, xcode 프로젝트의 waterfall 산출물을 한 곳에서 관리합니다.
>
> 본 문서 세트는 2026-07-25 기준 **가재코드(GJC) 방향성, LazyZ/OmO 하네스 경험, 그리고 pi-coding-agent 실제 구조 및 개발 문화(AGENTS.md, CONTRIBUTING.md, RFCs)**를 바탕으로 작성되었습니다.

---

## 📋 문서 개요

이 저장소는 xcode 시스템의 기획, 요구사항, 설계, 구현, 테스트, 배포, 운영에 필요한 문서를 포함합니다.

### 문서 구조

```
xcode/
├── 00-기획/              # 프로젝트 기획 단계 산출물
├── 01-요구사항분석/       # 요구사항 정의 및 분석
├── 02-시스템설계/         # 시스템 아키텍처 및 설계
├── 03-상세설계/           # 상세 설계 문서 (핵심: context compaction, agent loop)
├── 04-구현/               # 구현 가이드
├── 05-테스트/             # 테스트 계획 및 전략
├── 06-배포/               # 배포 및 운영 문서
├── 07-유지보수/           # 유지보수 계획
├── 08-검토/               # 단계별 검토 산출물
├── 09-운영런북/           # 장애 대응/운영 표준 절차
├── proposals/             # 제안서/기획안
└── README.md              # 이 파일
```

---

## 🗂️ 문서 상세 목록

### 00-기획

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [서비스기획서.md](./00-기획/서비스기획서.md) | 프로젝트 개요, 서비스 범위, 구현 범위, KPI, Phase 현황 | v1.0-pi |
| [비즈니스정책서.md](./00-기획/비즈니스정책서.md) | 플랜/과금, AI 정책, 보안/개인정보, SLA, containerization | v1.0-pi |

### 01-요구사항분석

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [요구사항명세서-SRS.md](./01-요구사항분석/요구사항명세서-SRS.md) | 기능/비기능 요구사항 상세 정의 | v1.0-pi |
| [유스케이스명세서.md](./01-요구사항분석/유스케이스명세서.md) | 핵심 유스케이스 상세 | v0.1 |
| [용어규칙.md](./01-요구사항분석/용어규칙.md) | 프로젝트 용어 사전 및 표기 원칙 | v0.1 |

### 02-시스템설계

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [시스템아키텍처설계서-SAD.md](./02-시스템설계/시스템아키텍처설계서-SAD.md) | 4-package 구조, 컴포넌트, 외부 연동, 패턴 | v1.0-pi |
| [API설계서.md](./02-시스템설계/API설계서.md) | session tree API, event 기반 API, provider/package API | v1.0-pi |

### 03-상세설계

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [상세설계서.md](./03-상세설계/상세설계서.md) | Agent loop, JSONL session tree, compaction, extension, containerization | v1.0-pi |

### 04-구현

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [구현가이드.md](./04-구현/구현가이드.md) | 개발 환경, monorepo 구조, 코딩 표준, Git 규칙, release 절차 | v1.0-pi |

### 05-테스트

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [테스트계획서.md](./05-테스트/테스트계획서.md) | 테스트 전략, 환경, 품질 게이트, pi event/compaction 시나리오 | v1.0-pi |

### 06-배포

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [배포계획서.md](./06-배포/배포계획서.md) | 4-package 배포, lockstep versioning, trusted publishing, CI 게이트 | v1.0-pi |

### 07-유지보수

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [유지보수계획서.md](./07-유지보수/유지보수계획서.md) | 데이터 보존, 정기 점검, 의존성 관리 | v1.0-pi |

### 08-검토

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [우선순위-로드맵.md](./08-검토/우선순위-로드맵.md) | pi 기반 Phase 1/1.5/2/3 로드맵 | v1.0-pi |
| [Phase1-MVP-범위확정서.md](./08-검토/Phase1-MVP-범위확정서.md) | Phase 1 MVP 범위, 성공 기준, 의존성 | v1.0-pi |

### 09-운영런북

| 문서 | 설명 | 버전 |
|------|------|:----:|
| [장애대응-런북.md](./09-운영런북/장애대응-런북.md) | 증상별 진단·복구 절차 | v1.0-pi |

### proposals

| 문서 | 설명 |
|------|------|
| [AGENTIC_WORKFLOW_DESIGN.md](./proposals/AGENTIC_WORKFLOW_DESIGN.md) | 에이전틱 워크플로우 + Graph Engineering 제안 |
| [CONTEXT_COMPACTION_DESIGN.md](./proposals/CONTEXT_COMPACTION_DESIGN.md) | Context Compaction Architecture 제안 |
| [PI_BASED_MODEL_INTEGRATION.md](./proposals/PI_BASED_MODEL_INTEGRATION.md) | pi-coding-agent 기반 모델 통합 제안 (심화) |

---

## 프로젝트 요약

| 항목 | 내용 |
|------|------|
| 프로젝트명 | xcode |
| 목적 | 개발자가 AI 에이전트에게 실제로 끝까지 일하게 만드는 agent-native coding IDE |
| 핵심 흐름 | 사용자 의도 → Classify → Planner/Executor → Agent Loop → Tool Execution → Basic Verify → Compaction → 다음 Task |
| 패키지 구조 | **@xcode/ai** · **@xcode/agent-core** · **@xcode/coding-agent** · **@xcode/tui** |
| 기반 모델 | **pi-coding-agent** — minimal core + aggressive extensibility + JSONL session tree + event-driven agent loop |
| 개발 문화 | pi의 `AGENTS.md`/`CONTRIBUTING.md`/RFCs 방식 참고: minimal core, explicit commits, lockstep versioning, supply-chain hardening |
| 스택 | Tauri + TypeScript, Node.js, SQLite, JSONL |
| AI | OpenAI Responses-style API, Ollama/local fallback |
| 보안 | Project Trust, `--ignore-scripts`, pinned deps, shrinkwrap, optional containerization (Gondolin/Docker/OpenShell) |
| 배포 | npm monorepo packages, Tauri standalone, Docker Compose (팀/클우드), npm trusted publishing |
| 테스트 | TS 단위/통합 테스트, Agent 시뮬레이션, Playwright E2E |

---

*문서 작성: 2026-07-25 · LazyZ/OmO 하네스 경험 및 pi-coding-agent 구조/문화 반영*
