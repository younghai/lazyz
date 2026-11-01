# LazyZ — Regression Tests

What these tests guard, after the Sprint 1 changes. Two layers:

1. **Component unit tests** (TypeScript, `vitest`) — under each component's
   `test/` directory. Assert code behavior.
2. **Scenario regression tests** (conversational, human/agent-run) — this
   document. Assert skill behavior.

---

## Component: `work-status`

At `components/work-status/test/work-status.test.ts`. Run:

```bash
cd components/work-status
npm install
npm test   # builds, then runs vitest
```

Covers (26 cases):
- `getPlanChecklist` — column-0 checkbox counting, indented-skip, missing
  file, legacy `## TODOs` heading, no-heading fallback.
- `readInProgressStartWork` — active work snapshot, most-recent-updated
  preference, completed/missing/empty-plan null paths.
- `readInProgressUlwLoop` — cross-goal criteria aggregation, missing/complete
  null paths, unparseable degraded snapshot.
- `runSessionStartResume` — T4 resume prompt + at-most-once-per-day dedup,
  re-prompt after >24h, valid `hookSpecificOutput` JSON, degraded paths.
- `runSessionStartResume` — T5 init-deep suggestion (fires when AGENTS.md
  missing, suppressed when present, deduped within a day).
- `runSessionStartResume` — T6 build-missing warning (fires when local MCP
  `dist/` missing, suppressed when all present, skipped when no pluginRoot,
  deduped within a day).
- Combined: T4 + T5 + T6 fire together in one `additionalContext` blob.

---

## Scenario: T2 — Approval gate colloquial / multilingual recognition

**Goal:** the `ulw-plan` approval gate recognizes colloquial and Korean
assent, but does NOT over-match mixed negation.

### English colloquial approval (should APPROVE)

`yes`, `yeah`, `yep`, `ok`, `okay`, `go`, `go ahead`, `proceed`, `approve`,
`approved`, `do it`, `sounds good`, `looks good`, `write the plan`, `start`.

### Korean colloquial approval (should APPROVE)

`응`, `네`, `그래`, `예`, `좋아`, `좋아요`, `진행`, `진행해`, `승인`, `시작`,
`해줘`, `그렇게 해`, `ㅇㅋ`, `ㅇㅇ`.

### Answering the open ambiguity (should APPROVE)

- `Redis for the rate-limit store.` (resolves an asked fork)
- `let's go with JWT.`

### Negative mixed with affirmative (PARSE — do not over-match)

| Input | Expected | Note |
| --- | --- | --- |
| `no, go ahead` | Approval | operative intent is "go ahead" |
| `아니 그냥 진행해` | Approval | same pattern, Korean |
| `don't ask, just do it` | Approval | user explicitly wants to proceed |
| `no` | NOT approval | bare negation |
| `not yet` / `wait` / `잠깐` / `아직` / `stop` | NOT approval | |
| `no, use session cookies not JWT` | Scope change | alters the approach |

**Rule for ambiguous mixes:** if operative intent is unclear, emit ONE
short clarifying line — do NOT assume approval. False approval is worse than
one extra question.

### Idle gate re-prompt

A plan at `status: awaiting-approval` for which the user sends an unrelated
new prompt yields ONE short re-prompt line naming the plan and the three
options (approve / change scope / drop) — never silently block, never
restate the whole brief.

---

## Scenario: T1 — Trivial shortcut (plan bypass)

**Goal:** mechanical, single-file, fully-specified changes bypass planning
and the approval gate, but NEVER bypass downstream verification.

### Trivial-qualified (should SHORTCUT)

- `fix the typo in the README: "laziness" -> "lazy"`
- `rename getUser to fetchUser in auth.ts` (single file)
- `change MAX_RETRIES from 3 to 5 in config.ts`
- `add a trailing newline to main.go`

### Verification guardrail

- Trivial shortcut taken, `AdversarialVerify` unavailable → fall back to
  full `ulw-plan` bootstrap.
- Trivial shortcut taken, `AdversarialVerify` returns `needs-fix` → block
  completion; worker must fix and re-verify.

### Non-Trivial that look small (should NOT shortcut)

- `add a login button` (behavior change, outcome not fully specified)
- `fix the auth bug` (ambiguous — which bug?)
- `refactor the parser` (cross-file impact)
- `make it faster` (vague)

**Rule:** "When in doubt whether something is Trivial, it is NOT Trivial —
route to Standard."

### start-work No-plan bootstrap Trivial branch

- `$start-work` + Trivial request, no plan → synthesize single-unit inline
  plan, still call DoneClaim → AdversarialVerify.
- `$start-work` + non-Trivial request, no plan → full `ulw-plan` bootstrap.

---

## Regression for existing power-user paths (must NOT degrade)

| # | Path | Expected |
| --- | --- | --- |
| R1 | `ulw-plan` Standard CLEAR path | Unchanged |
| R2 | `ulw-plan` UNCLEAR path | Unchanged |
| R3 | `ulw-plan` Architecture path (5 host subagents) | Unchanged |
| R4 | `start-work` normal multi-checkbox flow | Unchanged |
| R5 | `start-work` Global Review and Debugging Gate | Unchanged |
| R6 | `start-work-continuation` Stop hook (incl. compaction-marker suppression) | Unchanged |
| R7 | `ulw-loop` full flow | Unchanged |
