# LazyZ — Progress Semantics

> Sprint 1 DoD #3: a single agreed document for what "progress" means across
> the two execution paths, so the user-facing wording stays consistent.

## Why this exists

Two execution paths with **different state-file stability**:

| Path | State file | Writer | Stability |
| --- | --- | --- | --- |
| `start-work` | `.omo/boulder.json` (pointer) + `.omo/plans/<slug>.md` (checkboxes) + `.omo/start-work/ledger.jsonl` | LLM following skill prose | **Soft** — fields drift; readers must be defensive |
| `ulw-loop` | `.omo/ulw-loop/goals.json` + `.omo/ulw-loop/ledger.jsonl` | `omo ulw-loop` TS CLI (atomic write + mutation lock, schema `version: 1`) | **Stable** — schema-validated |

## The agreed semantic (user-facing)

Progress is reported as **`<done>/<total>` of the atomic unit the path
tracks, plus the next unit's label**. ETA is never shown.

| Path | Atomic unit | `done` | `total` | `next` |
| --- | --- | --- | --- | --- |
| `start-work` | column-0 checkbox in `## Todos` / `## Final Verification Wave` | `- [x]` checkboxes | all column-0 checkboxes | first remaining `- [ ]` label |
| `ulw-loop` | success criterion of a goal | criteria `status: "pass"` | all criteria across all goals | first goal not `complete` |

### Canonical wording (single semantic, both paths)

```
⏳ <plan/goal name> — <done>/<total> 완료. 다음: <next label>.
```

- Korean. "완료" maps to `done/total` for **both** paths.
- The `next` label is truncated to ~80 chars.

## What is NOT shown (intentional)

- **ETA / time estimates** — counts do not predict wall-clock time (PM DoD #6).
  The `cli.ts` `query` serializer has an explicit comment forbidding `eta`.
- **Internal path name** — surfaced only for actionable instructions.
- **Adversarial-verify state, ledger events, worktree path** — internal.

## Reader responsibilities (component contract)

The `work-status` component must:

1. **Never throw** on soft-schema parse failure → return `degraded: true`.
2. **Missing files = "no work"** (null); **exists but unparseable = degraded**.
3. **Column-0 checkboxes only** for start-work.
4. **Active/paused work only** for start-work; most-recently-updated wins.
5. **Criteria across ALL goals** for ulw-loop.

## Sync requirement

`work-status.ts` re-implements the boulder + plan-checkbox parser (canonical
one in `components/start-work-continuation/src/boulder-reader.ts`). The two
are independent bundled packages — keep in sync if the boulder schema evolves.
