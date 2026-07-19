# 시스템 아키텍처

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 전체 구조

```
lazyz/
├── marketplace.json                   → ZCode marketplace manifest (root)
└── plugins/lazyz/                     → the plugin itself
    ├── .zcode-plugin/plugin.json      → ZCode plugin manifest
    ├── .mcp.json                      → 5 MCP servers
    ├── hooks/hooks.json               → 16 hooks across 5 ZCode events
    ├── skills/                        → 25 skills
    ├── commands/                      → 4 commands
    ├── agents/                        → 10 ZCode subagent definitions
    ├── components/                    → 13 TypeScript components (prebuilt dist)
    ├── vendor/                        → 13 vendored packages
    ├── scripts/                       → build/sync/redact/prune/install scripts
    └── shared/                        → shared config-loader
```

## 2. 컴포넌트 계층

### 2.1 스킬 계층 (25개)
사용자/모델이 자연어로 발동. 4개 코어(init-deep, ulw-plan, start-work, ulw-loop) + 21개 전문 스킬.

### 2.2 훅 계층 (16개)
ZCode 5개 이벤트(SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop)에 등록된 TypeScript 컴포넌트.

| 이벤트 | 훅 수 | 주요 컴포넌트 |
| --- | --- | --- |
| SessionStart | 6 | bootstrap, codegraph, rules, telemetry, work-status, migrate-codex-config |
| UserPromptSubmit | 3 | ultrawork, ulw-loop, rules |
| PreToolUse | 1 | git-bash |
| PostToolUse | 5 | comment-checker, lsp, rules, codegraph, lazycodex-executor-verify |
| Stop | 1 | start-work-continuation |

### 2.3 MCP 계층 (5개)
| 서버 | 유형 | 용도 |
| --- | --- | --- |
| grep_app | 원격 | GitHub 코드 검색 |
| context7 | 원격 | 라이브러리 문서 |
| codegraph | 로컬 | 코드 그래프 탐색 |
| git_bash | 로컬 | Windows Git Bash |
| lsp | 로컬 | 언어 서버 진단 |

### 2.4 에이전트 계층 (10개)
ZCode Agent tool로 호출되는 서브에이전트. `~/.zcode/agents/`에 설치.

| 에이전트 | 역할 | 권한 |
| --- | --- | --- |
| explorer | 코드베이스 검색 | read-only |
| librarian | 외부 OSS/문서 연구 | read-only |
| plan | 전략 플래닝 | plan 파일만 쓰기 |
| metis | 사전 분석 | read-only |
| momus | 플랜 리뷰 | read-only |
| lazycodex-executor | 구현 실행 | Edit/Write/Bash |
| lazycodex-qa-executor | QA 실행 | Write/Bash |
| lazycodex-code-reviewer | 코드 품질 리뷰 | read-only |
| lazycodex-gate-reviewer | 최종 게이트 리뷰 | read-only |
| lazycodex-clone-fidelity-reviewer | 클론 충실도 리뷰 | read-only |

## 3. vendor 경계

| 패키지 | components에서 import | 수정 가능 |
| --- | --- | --- |
| rules-engine | 예 (rules) | 아니오 (업스트림 스냅샷) |
| comment-checker-core | 예 (comment-checker) | 아니오 |
| telemetry-core | 예 (telemetry) | 아니오 |
| lsp-daemon | 예 (lsp) | 아니오 |
| utils | 간접 (shared) | 아니오 |
| omo-codex | 예 (bootstrap 상대경로) | 아니오 (원본 스냅샷) |

components/*/src/, shared/src/, scripts/ — 수정 가능 (LazyZ 고유).
vendor/*/src/ — 수정 불가 (외부 스냅샷).
