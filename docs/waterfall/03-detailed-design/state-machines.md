# State Machines

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. boulder.json Work State Machine

```
                  (isContinuableStatus = true)
   ┌────────────────────────────────────────┐
   ▼                                        │
 active ◄──── (re-entry) ────► paused        │ (Stop hook & work-status
   │                       ▲   │            │  treat active/paused as
   │                       │   │            │  continuable only)
   │ (5 cycles or           │   │ (user      │
   │  3 same-failure        │   │  manual)   │
   │  or                    │   │            │
   │  needs-human-review)   │   ▼            │
   ▼                       blocked          │
 blocked ◄─────────────────┘   │            │
   │                            │            │
   │ (user sets to active)      │            │
   └────────────────────────────┘            │
                                              │
 completed ◄── (all checkboxes done) ────────┘
 abandoned ◄── (user cancels) ───────────────┘
   (terminal — not resumable)
```

### State Transition Rules

| Transition | Trigger | fail_count | Code enforcement |
| --- | --- | --- | --- |
| active → paused | User manual | Unchanged | None (LLM prose) |
| active → blocked | 5 cycles / 3 same-failure / needs-human-review | +1 | Prose (SKILL.md/directive.md) |
| blocked → active | User manual | Retained | None |
| active → completed | All checkboxes - [x] | Reset | None |
| active → abandoned | User cancels | Unchanged | None |

### isContinuableStatus (code-enforced)

```typescript
function isContinuableStatus(status: BoulderWorkStatus | undefined): boolean {
    return status === "active" || status === "paused";
}
```

`blocked`, `completed`, `abandoned`, `undefined` → false (not resumable).

## 2. ulw-loop Goal State Machine

```
 pending → in_progress → (criterion loop) → complete / failed / needs_user_decision
```

- `complete`: all criteria PASS
- `failed`: 5 cycles or 3 same-criterion failures
- `needs_user_decision`: external-auth blocker 3 times (code-enforced, checkpoint.ts)

## 3. start-work Continuation Counter

```
 Stop hook fires
   │
   ├─ stop_hook_active? → abort
   ├─ context pressure? → abort
   ├─ no continuable work in boulder.json? → abort + clear counter
   ├─ remaining checkboxes === 0? → abort + clear counter
   ├─ counter >= MAX_CONTINUATIONS (10)? → abort
   └─ pass → counter++ + inject directive (decision: block)
```

## 4. SessionStart Hook Order (sequential)

```
 1. bootstrap (15s timeout)
 2. codegraph (15s, detached worker)
 3. rules (10s)
 4. telemetry (5s, only when opt-in)
 5. work-status (10s)
 6. migrate-codex-config (10s)
```

Each hook has an independent timeout and exit 0 fallback. One slow hook does not indefinitely block others.
