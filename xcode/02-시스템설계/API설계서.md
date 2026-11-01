# xcode API 설계서

- 문서 버전: v1.0-pi
- 작성일: 2026-07-25
- 기반 모델: **pi-coding-agent** — event-driven agent loop, JSONL session tree

---

## 1. 개요

xcode API는 크게 IDE 납부용 Core API와 외부 연동용 Public API로 나뉜다.
xcode는 `interactive`, `print`, `json`, `rpc`, `sdk` 5가지 runtime mode를 지원하며, API는 모든 모드에서 동일한 core engine을 통해 처리된다.

핵심 추상:
- **Session**: JSONL로 저장되는 append-only event tree.
- **Entry**: session tree의 한 줄. `user`, `assistant`, `tool`, `system`, `summary` 중 하나.
- **Event**: runtime 내에서 흐르는 메시지. entry는 event의 지속 형태.
- **Tool call**: agent가 `functions.*:0` 형태로 요청한 실행 단위.
- **Compact**: context 한도 도달 시 session entry를 재배치/요약하는 연산.

---

## 2. Runtime Modes

| Mode | 설명 | 사용 예 |
|---|---|---|
| `interactive` | IDE/TUI 대화형 | `xcode` |
| `print` | one-shot, CI/스크립트 | `xcode -p "리팩토링해줘"` |
| `json` | 자동화, 로깅 | `xcode --mode json "..."` |
| `rpc` | 외부 프로세스 연동 | `xcode --mode rpc` |
| `sdk` | 임베딩 | `import { createAgentSession } from "@xcode/agent-core"` |

---

## 3. Core API (IPC / 납부)

### 3.1 Task API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| POST | `/task/start` | 새 task 시작 | `{workspace_id, prompt, model}` | `{task_id, session_id, plan}` |
| POST | `/task/{id}/approve` | 계획 승인 | `{approved: true, edits: []}` | `{status: running}` |
| GET | `/task/{id}/status` | 작업 상태 조회 | - | `{status, progress, current_step}` |
| POST | `/task/{id}/pause` | 작업 일시 정지 | - | `{status: paused}` |
| POST | `/task/{id}/resume` | 작업 재개 | - | `{status: running}` |
| POST | `/task/{id}/stop` | 작업 중지 | - | `{status: stopped}` |
| GET | `/task/{id}/log` | 실행 로그 조회 | `?since=...` | `{events: [...]}` |
| POST | `/task/{id}/feedback` | 사용자 피드백 전달 | `{message}` | `{ok: true}` |

### 3.2 Session Tree API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| GET | `/session` | 세션 목록 조회 | `?workspace=...` | `{sessions: [...]}` |
| GET | `/session/{id}` | 세션 메타데이터 조회 | - | `{id, workspace, parent_id, created_at}` |
| GET | `/session/{id}/entries` | 세션 entry 전체 조회 | `?after=message_id` | `{entries: [...]}` |
| POST | `/session/{id}/fork` | 특정 message에서 분기 | `{message_id}` | `{session_id}` |
| POST | `/session/{id}/clone` | 세션 복제 | - | `{session_id}` |
| GET | `/session/{id}/tree` | 세션 트리 조회 | - | `{tree: [...]}` |
| POST | `/session/{id}/jump` | 트리 지점으로 이동 | `{message_id}` | `{session_id}` |
| POST | `/session/{id}/compact` | 강제 compaction | `{goal}` | `{ok: true, summary}` |

### 3.3 Agent Loop API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| POST | `/loop/step` | 한 turn 수동 실행 | `{session_id}` | `{event, next_action}` |
| POST | `/loop/run` | loop 자동 실행 | `{session_id, max_cycles}` | `{status}` |
| POST | `/loop/steer` | 실행 중 steering | `{session_id, message}` | `{ok: true}` |

### 3.4 Tool & Skill API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| GET | `/tools` | 등록된 tool 목록 | - | `{tools: [...]}` |
| POST | `/tools/{id}/invoke` | tool 직접 실행 | `{args}` | `{result}` |
| GET | `/skills` | skill 목록 | - | `{skills: [...]}` |
| POST | `/skills/{id}/invoke` | skill 실행 | `{args}` | `{result}` |

### 3.5 Memory API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| GET | `/memory/working` | working memory 조회 | `?task_id=...` | `{goal, decisions, files, failures, next}` |
| POST | `/memory/working` | working memory 갱신 | `{...}` | `{ok: true}` |
| GET | `/memory/project` | project memory 조회 | - | `{rules, conventions}` |

### 3.6 Provider API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| GET | `/providers` | 등록된 LLM provider 목록 | - | `{providers: [...]}` |
| POST | `/providers/{id}/chat` | provider 직접 호출 | `{messages}` | `{stream \| object}` |
| GET | `/providers/{id}/health` | provider health check | - | `{ok, latency}` |

### 3.7 Package & Extension API

| Method | Path | 설명 | 요청 예시 | 응답 예시 |
|---|---|---|---|---|
| POST | `/packages/install` | package 설치 | `{name, version, ignore_scripts=true}` | `{ok}` |
| POST | `/packages/remove` | package 제거 | `{name}` | `{ok}` |
| GET | `/extensions` | loaded extension 목록 | - | `{extensions: [...]}` |
| POST | `/extensions/reload` | extension reload | - | `{ok}` |

### 3.8 요청/응답 예시

#### task 시작 요청

```json
{
  "workspace_id": "ws_abc123",
  "prompt": "로그인 버그를 수정해줘: 이메일 인증 후 redirect가 루트가 아닌 /dashboard로 가야 함",
  "model": "openai/gpt-4o",
  "options": {
    "auto_verify": true,
    "max_cycles": 5
  }
}
```

#### task 상태 응답

```json
{
  "task_id": "task_123",
  "session_id": "sess_456",
  "status": "running",
  "progress": {
    "total": 7,
    "done": 3,
    "current": 4
  },
  "current_step": "LoginController redirect 수정",
  "last_evidence": "tests/Feature/LoginRedirectTest.php:23 passed"
}
```

#### session entry 예시

```json
{
  "type": "tool",
  "id": "msg_007",
  "parent": "msg_006",
  "timestamp": "2026-07-25T12:34:56Z",
  "tool_call": {
    "id": "call_1",
    "name": "functions.read:0",
    "arguments": {"file": "src/LoginController.ts"}
  },
  "result": {
    "content": "..."
  }
}
```

---

## 4. Public API (외부 연동)

| Method | Path | 설명 | 인증 |
|---|---|---|---|
| POST | `/v1/skill/run` | 외부에서 skill 실행 | API Key |
| POST | `/v1/task/webhook` | 외부 이벤트로 task 트리거 | API Key + signature |
| GET | `/v1/marketplace/skills` | marketplace skill 목록 | API Key |
| POST | `/v1/telemetry/event` | 제품 이벤트 수집 (opt-in) | API Key |

---

## 5. 상태 코드

| 코드 | 의미 |
|---|---|
| 200 | 정상 |
| 202 | 비동기 수락 |
| 400 | 잘못된 요청 |
| 401 | 인증 실패 |
| 403 | 권한 부족 |
| 404 | 리소스 없음 |
| 409 | 충돌 (예: 이미 실행 중인 task) |
| 422 | 검증 실패 |
| 429 | Rate limit 초과 |
| 503 | LLM/외부 서비스 장애 |

---

*문서 작성: 2026-07-25 · pi-coding-agent 기반 모델 반영*
