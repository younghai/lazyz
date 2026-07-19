# 데이터 흐름

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 4단계 워크플로우 데이터 흐름

```
 ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │  1. Memory  │ ──▶ │  2. Plan     │ ──▶ │  3. Execute  │ ──▶ │  4. Verify   │
 │  init-deep  │     │  ulw-plan    │     │  start-work  │     │  ulw-loop    │
 └─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
        │                   │                    │                     │
        ▼                   ▼                    ▼                     ▼
   AGENTS.md          .omo/plans/          .omo/boulder.json      evidence ledger
   hierarchy          decision-complete     checkbox progress      (artifacts,
   (read every        plan + approval       + Stop-hook            not claims)
   session)           gate before code      continuation
```

## 2. SessionStart 훅 체인 (순차 실행)

```
ZCode SessionStart
   ├─[1] bootstrap (15s)     → 에이전트/dist 프로비저닝
   ├─[2] codegraph (15s)     → 코드 그래프 백그라운드 부트스트랩
   ├─[3] rules (10s)         → 프로젝트 룰 주입
   ├─[4] telemetry (5s)      → DAU 이벤트 (opt-in 시만)
   ├─[5] work-status (10s)   → 진행 중 작업 안내 + Manual-QA 게이트
   └─[6] migrate (10s)       → Codex config 마이그레이션
```

## 3. 상태 파일 카탈로그

### 프로젝트 로컬 (`.omo/`)

| 파일 | 생성자 | 원자적 쓰기 | 수명주기 |
| --- | --- | --- | --- |
| `boulder.json` | start-work LLM | 없음 (soft-schema) | 작업 완료 시까지 |
| `plans/<slug>.md` | ulw-plan | 없음 | 영구 (GC 없음) |
| `start-work/ledger.jsonl` | start-work LLM | 없음 (append) | prune 스크립트 |
| `ulw-loop/goals.json` | ulw-loop CLI | 있음 (tmp+rename) | 영구 |
| `ulw-loop/ledger.jsonl` | ulw-loop CLI | 있음 (mutation lock) | prune 스크립트 |
| `evidence/` | executor/QA | 없음 | prune (30일/100MB) |
| `start-work-continuation/<session>.json` | Stop hook | 있음 (tmp+rename) | 완료 시 삭제 |
| `lazycodex-executor-verify/<id>.json` | PostToolUse hook | 있음 (tmp+rename) | 증거 검증 후 삭제 |
| `.lazyz-prompts.json` | work-status | 있음 (tmp+rename) | 영구 (dedup) |

### 홈 영속 (`~/`)

| 경로 | 목적 | 원자적 쓰기 |
| --- | --- | --- |
| `~/.omo/telemetry-notified` | 최초 안내 센티넬 | 없음 |
| `~/.omo/telemetry-disabled` | opt-out 센티넬 | n/a (사용자 생성) |
| `~/.omo/codegraph/` | codegraph 바이너리 + 로그 | 프로비저닝 락 |
| `~/.local/share/lazyz/` | PostHog 활동 상태 | 있음 |
| `~/.local/share/lazycodex/` | auto-update 상태 | 없음 (lock 있음) |
| `~/.codex/codex-rules/` | rules 세션 캐시 | 세션 락 |
| `~/.zcode/agents/` | 설치된 서브에이전트 | install-agents.sh |

## 4. 데이터 정합성 위험 및 완화

| 위험 | 심각도 | 완화 조치 |
| --- | --- | --- |
| boulder.json 듀얼 파서 drift | HIGH | CI `Verify boulder parser sync` 강제 |
| boulder.json 비원자적 쓰기 (LLM) | HIGH | defensive parser (degraded fallback) |
| evidence PII 평문 | HIGH | `redact-secrets.mjs` 스크러버 |
| `.omo/` 권한 umask 022 | HIGH | mode 0o700 강제 (13곳) |
| evidence 무한 증식 | MEDIUM | `prune-evidence.mjs` (30일/100MB) |
| `.lazyz-prompts.json` 레이스 | MEDIUM | temp+rename 원자적 쓰기 |
