---
name: ulw-execute
description: Execute an approved .omo plan using the existing LazyZ start-work runtime.
metadata:
  short-description: Execute an approved plan with Boulder state and evidence
---

# ulw-execute

Use only when the user requests execution of an approved `.omo/plans/<name>.md`
plan, including by invoking `/ulw-execute`. Plan approval alone is not an execution
request. Execution authorization does not cover unrelated scope.

## ZCode execution contract

1. Resolve the plan name and confirm the plan exists and is decision-complete.
2. Register goals first with `lazyz ulw-loop create-goals`; do not hand-edit `.omo` state.
3. Reuse the existing LazyZ `/start-work` runtime and Stop continuation behavior.
4. Keep evidence tied to observable CLI, file, or real runtime surfaces. Respect the user's verification policy and do not invent model, turn, permission, or external-service evidence.
5. ZCode permits at most three Stop continuations. After the third, surface the blocker. Background agents cannot grant stdout permissions; return permission-gated work to the parent session.

`/start-work` remains the compatibility alias for this workflow. This skill does not require Codex goals, Senpi threads, native team transports, or Codex-only hook events.
