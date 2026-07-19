# 상태머신

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. boulder.json Work 상태머신

```
                  (isContinuableStatus = true)
   ┌────────────────────────────────────────┐
   ▼                                        │
 active ◄──── (재진입) ────► paused          │ (Stop hook & work-status
   │                       ▲   │            │  모두 active/paused만
   │                       │   │            │  continuable로 판정)
   │ (5 cycles 또는         │   │ (사용자     │
   │  3 same-failure        │   │  수동)     │
   │  또는                  │   │            │
   │  needs-human-review)   │   ▼            │
   ▼                       blocked          │
 blocked ◄─────────────────┘   │            │
   │                            │            │
   │ (사용자가 active로 변경)    │            │
   └────────────────────────────┘            │
                                              │
 completed ◄── (모든 체크박스 완료) ──────────┘
 abandoned ◄── (사용자 취소) ────────────────┘
   (terminal — 재개 불가)
```

### 상태 전이 규칙

| 전이 | 트리거 | fail_count | 코드 강제 |
| --- | --- | --- | --- |
| active → paused | 사용자 수동 | 변경 없음 | 없음 (LLM prose) |
| active → blocked | 5 cycles / 3 same-failure / needs-human-review | +1 | prose (SKILL.md/directive.md) |
| blocked → active | 사용자 수동 | 유지 | 없음 |
| active → completed | 모든 체크박스 - [x] | 리셋 | 없음 |
| active → abandoned | 사용자 취소 | 변경 없음 | 없음 |

### isContinuableStatus (코드 강제)

```typescript
function isContinuableStatus(status: BoulderWorkStatus | undefined): boolean {
    return status === "active" || status === "paused";
}
```

`blocked`, `completed`, `abandoned`, `undefined` → false (재개 불가).

## 2. ulw-loop 골 상태머신

```
 pending → in_progress → (criterion loop) → complete / failed / needs_user_decision
```

- `complete`: 모든 크리테리아 PASS
- `failed`: 5 cycles 또는 3 same-criterion failures
- `needs_user_decision`: external-auth blocker 3회 (코드 강제, checkpoint.ts)

## 3. start-work continuation 카운터

```
 Stop hook 발화
   │
   ├─ stop_hook_active? → 중단
   ├─ context pressure? → 중단
   ├─ boulder.json continuable work 없음? → 중단 + counter clear
   ├─ remaining checkboxes === 0? → 중단 + counter clear
   ├─ counter >= MAX_CONTINUATIONS (10)? → 중단
   └─ 통과 → counter++ + directive 주입 (decision: block)
```

## 4. SessionStart 훅 순서 (순차)

```
 1. bootstrap (15s timeout)
 2. codegraph (15s, detached worker)
 3. rules (10s)
 4. telemetry (5s, opt-in 시만)
 5. work-status (10s)
 6. migrate-codex-config (10s)
```

각 훅은 독립 타임아웃 + exit 0 폴백. 하나가 느려도 다른 훅을 무한 블로킹하지 않음.
