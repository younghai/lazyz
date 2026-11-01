# xcode 요구사항 명세서 (SRS)

- 문서 버전: v0.2
- 작성일: 2026-07-25
- 작성 기준: pi-coding-agent 소스 구조 및 알고리즘

---

## 1. 개요

xcode는 pi-coding-agent를 기반으로 한 AI-native coding IDE로, 개발자가 AI 에이전트에게 실제로 끝까지 일하게 만드는 것을 목표로 한다.

---

## 2. 기능 요구사항

### 2.1 Runtime Modes

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-001 | xcode는 interactive 모드를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-002 | xcode는 print 모드(`-p`)를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-003 | xcode는 JSON 모드(`--mode json`)를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-004 | xcode는 RPC 모드(`--mode rpc`)를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-005 | xcode는 SDK 모드를 지원한다 | `@xcode/sdk` | 🔲 |

### 2.2 Agent Loop

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-006 | `Agent.prompt()`는 user message를 받아 agent loop를 시작한다 | `@xcode/agent-core` | 🔲 |
| FR-007 | `Agent.continue()`는 현재 context에서 retry/continue한다 | `@xcode/agent-core` | 🔲 |
| FR-008 | Agent loop는 streaming event를 emit한다 | `@xcode/agent-core` | 🔲 |
| FR-009 | Tool call이 있을 경우 자동으로 다음 turn을 실행한다 | `@xcode/agent-core` | 🔲 |
| FR-010 | Tool execution은 parallel 또는 sequential 모드를 지원한다 | `@xcode/agent-core` | 🔲 |
| FR-011 | `beforeToolCall` hook으로 tool call을 block할 수 있다 | `@xcode/agent-core` | 🔲 |
| FR-012 | `afterToolCall` hook으로 tool result를 후처리할 수 있다 | `@xcode/agent-core` | 🔲 |
| FR-013 | Tool은 `terminate: true`를 반환하여 follow-up LLM call skip을 hint할 수 있다 | `@xcode/agent-core` | 🔲 |

### 2.3 Session Tree

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-014 | 세션은 JSONL 파일로 저장된다 | `@xcode/coding-agent` SessionManager | 🔲 |
| FR-015 | 각 entry는 `id`와 `parentId`를 가진다 | SessionManager | 🔲 |
| FR-016 | 세션은 in-place branching을 지원한다 | SessionManager | 🔲 |
| FR-017 | `/tree` 명령으로 임의 지점으로 이동할 수 있다 | SessionManager | 🔲 |
| FR-018 | `/fork` 명령으로 새 세션 파일을 생성할 수 있다 | SessionManager | 🔲 |
| FR-019 | `/clone` 명령으로 현재 branch를 복제할 수 있다 | SessionManager | 🔲 |
| FR-020 | `buildContextEntries()`는 current leaf에서 root까지 path를 수집한다 | SessionManager | 🔲 |
| FR-021 | `buildSessionContext()`는 LLM에 전달할 message list를 생성한다 | SessionManager | 🔲 |

### 2.4 Session Entry Types

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-022 | `session` header entry를 지원한다 | SessionManager | 🔲 |
| FR-023 | `message` entry를 지원한다 | SessionManager | 🔲 |
| FR-024 | `model_change` entry를 지원한다 | SessionManager | 🔲 |
| FR-025 | `thinking_level_change` entry를 지원한다 | SessionManager | 🔲 |
| FR-026 | `compaction` entry를 지원한다 | SessionManager | 🔲 |
| FR-027 | `branch_summary` entry를 지원한다 | SessionManager | 🔲 |
| FR-028 | `custom` entry를 지원한다 (extension state, no LLM context) | SessionManager | 🔲 |
| FR-029 | `custom_message` entry를 지원한다 (LLM context 참여) | SessionManager | 🔲 |
| FR-030 | `label` entry를 지원한다 | SessionManager | 🔲 |
| FR-031 | `session_info` entry를 지원한다 | SessionManager | 🔲 |

### 2.5 Compaction

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-032 | `contextTokens > contextWindow - reserveTokens` 시 auto-compaction이 trigger된다 | `@xcode/coding-agent` CompactionEngine | 🔲 |
| FR-033 | `/compact [instructions]` manual compaction을 지원한다 | CompactionEngine | 🔲 |
| FR-034 | Compaction은 turn boundary에서 cut한다 | CompactionEngine | 🔲 |
| FR-035 | Split turn 시 history summary + turn prefix summary를 merge한다 | CompactionEngine | 🔲 |
| FR-036 | CompactionEntry는 summary, firstKeptEntryId, tokensBefore, details를 저장한다 | CompactionEngine | 🔲 |
| FR-037 | CompactionEntry는 `retainedTail` self-contained checkpoint를 포함할 수 있다 | CompactionEngine | 🔲 |
| FR-038 | `/tree` navigation 시 branch summarization을 지원한다 | CompactionEngine | 🔲 |
| FR-039 | Summary는 structured format(Goal/Progress/Key Decisions/Next Steps/Critical Context)을 따른다 | CompactionEngine | 🔲 |
| FR-040 | Message serialization 시 tool results는 2000자로 truncate한다 | CompactionEngine | 🔲 |

### 2.6 Message Queue

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-041 | Steering message는 현재 turn 종료 후 전달된다 | `@xcode/agent-core` | 🔲 |
| FR-042 | Follow-up message는 agent가 idle 상태가 되면 전달된다 | `@xcode/agent-core` | 🔲 |
| FR-043 | Queue mode는 `one-at-a-time` 또는 `all`을 지원한다 | `@xcode/agent-core` | 🔲 |

### 2.7 Tools

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-044 | Built-in tool `read`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-045 | Built-in tool `write`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-046 | Built-in tool `edit`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-047 | Built-in tool `bash`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-048 | Built-in tool `grep`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-049 | Built-in tool `find`를 지원한다 | `@xcode/coding-agent` | 🔲 |
| FR-050 | Built-in tool `ls`를 지원한다 | `@xcode/coding-agent` | 🔲 |

### 2.8 Extensions

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-051 | Extension은 default factory function을 export한다 | `@xcode/coding-agent` ExtensionRuntime | 🔲 |
| FR-052 | Extension은 custom tool을 등록할 수 있다 | ExtensionRuntime | 🔲 |
| FR-053 | Extension은 custom command를 등록할 수 있다 | ExtensionRuntime | 🔲 |
| FR-054 | Extension은 lifecycle events를 구독할 수 있다 | ExtensionRuntime | 🔲 |
| FR-055 | Extension은 `ctx.ui`로 사용자와 상호작용할 수 있다 | ExtensionRuntime | 🔲 |
| FR-056 | Project-local extension은 trust 이후에만 로드된다 | ExtensionRuntime | 🔲 |
| FR-057 | Extension은 `pi.appendEntry()`로 state를 persist할 수 있다 | ExtensionRuntime | 🔲 |

### 2.9 Skills

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-058 | Skill은 Agent Skills standard를 따른다 | `@xcode/coding-agent` SkillRegistry | 🔲 |
| FR-059 | Skill은 `SKILL.md` frontmatter(name, description)를 가진다 | SkillRegistry | 🔲 |
| FR-060 | Skill은 `/skill:name`으로 호출할 수 있다 | SkillRegistry | 🔲 |
| FR-061 | Skill description은 system prompt에 포함된다 | SkillRegistry | 🔲 |
| FR-062 | Full SKILL.md는 on-demand로 로드된다 | SkillRegistry | 🔲 |

### 2.10 Prompt Templates

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-063 | Prompt template은 Markdown 파일로 정의된다 | `@xcode/coding-agent` PromptTemplateRegistry | 🔲 |
| FR-064 | Template filename이 `/command`가 된다 | PromptTemplateRegistry | 🔲 |
| FR-065 | Template은 positional arguments를 지원한다 | PromptTemplateRegistry | 🔲 |

### 2.11 Multi-Provider LLM

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-066 | OpenAI provider를 지원한다 | `@xcode/ai` | 🔲 |
| FR-067 | Anthropic provider를 지원한다 | `@xcode/ai` | 🔲 |
| FR-068 | Google provider를 지원한다 | `@xcode/ai` | 🔲 |
| FR-069 | Local model provider(llama.cpp/Ollama)를 지원한다 | `@xcode/ai` | 🔲 |
| FR-070 | Custom provider는 `models.json`로 등록할 수 있다 | `@xcode/ai` | 🔲 |
| FR-071 | Custom provider는 extension으로 등록할 수 있다 | `@xcode/ai` | 🔲 |
| FR-072 | Auth resolution은 CLI flag → auth.json → env var 순서로 이루어진다 | `@xcode/ai` | 🔲 |
| FR-073 | Model cycling(Ctrl+P)을 지원한다 | `@xcode/ai` | 🔲 |

### 2.12 Project Trust

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-074 | `.xcode/` project-local 리소스는 승인 후 로드된다 | `@xcode/coding-agent` ProjectTrust | 🔲 |
| FR-075 | Trust 수준은 `ask`/`always`/`never`를 지원한다 | ProjectTrust | 🔲 |
| FR-076 | CLI `--approve`/`-a`로 override할 수 있다 | ProjectTrust | 🔲 |

### 2.13 Context Files

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-077 | `AGENTS.md`/`CLAUDE.md`를 cwd부터 ancestor까지 자동 로드한다 | `@xcode/coding-agent` ContextFileLoader | 🔲 |

### 2.14 Package System

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-078 | npm package를 설치할 수 있다 | `@xcode/coding-agent` PackageManager | 🔲 |
| FR-079 | git package를 설치할 수 있다 | PackageManager | 🔲 |
| FR-080 | local path package를 설치할 수 있다 | PackageManager | 🔲 |
| FR-081 | Package ref는 pinned version/tag/commit이다 | PackageManager | 🔲 |
| FR-082 | Package는 `xcode` manifest 또는 conventional directory를 사용한다 | PackageManager | 🔲 |

### 2.15 Verified Completion

| ID | 요구사항 | 구현 위치 | 상태 |
|---|---|---|---|
| FR-083 | Test 실행 결과(pass/fail)를 evidence로 수집한다 | extension 또는 built-in | 🔲 |
| FR-084 | Agent 실행 로그는 검토 가능하다 | `@xcode/coding-agent` | 🔲 |

---

## 3. 비기능 요구사항

| ID | 요구사항 | 구현/측정 | 상태 |
|---|---|---|---|
| NFR-001 | JSONL session file은 append-only로 유지된다 | SessionManager | 🔲 |
| NFR-002 | Compaction은 원본 JSONL을 보존한다 | SessionManager | 🔲 |
| NFR-003 | Tool result는 summarization 시 2000자로 truncate된다 | CompactionEngine | 🔲 |
| NFR-004 | auth.json 파일 권한은 0600이다 | `@xcode/ai` | 🔲 |
| NFR-005 | Package 설치 시 `--ignore-scripts`가 기본값이다 | PackageManager | 🔲 |
| NFR-006 | npm/git package는 pinned ref로 설치된다 | PackageManager | 🔲 |
| NFR-007 | Extension은 project trust 이후에만 로드된다 | ExtensionRuntime | 🔲 |
| NFR-008 | Secret은 로그에서 마스킹된다 | `@xcode/coding-agent` | 🔲 |
| NFR-009 | IDE UI 응답 지연 < 100ms | 성능 테스트 | 🔲 |
| NFR-010 | Reproducible build: lockfile이 ground truth | CI | 🔲 |
| NFR-011 | Offline mode(`XCODE_OFFLINE=1`) 지원 | `@xcode/coding-agent` | 🔲 |

---

*문서 작성: 2026-07-25 · pi-coding-agent 소스 기반*
