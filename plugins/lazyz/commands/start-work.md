---
description: Compatibility alias for executing an approved plan through the ZCode ulw-execute contract.
argument-hint: "<plan-name> [--worktree <path>]"
---

# /start-work

Invoke the **start-work** skill as the compatibility alias for **ulw-execute**.

Execute only the named, decision-complete `.omo/plans/<name>.md` plan after explicit plan approval and an explicit execution request. Register goals first with `lazyz ulw-loop create-goals`; do not hand-edit `.omo` state. Preserve the required execution schema (`execution_shape`, `role`, `parallel_safe`, `owned_paths`, `completion_condition`), bundled validator, ReceiptV1 evidence, and observable QA gates.

## Arguments

$ARGUMENTS

Resolve the named approved plan exactly; do not create a plan or select the most recent plan when none is named. If `--worktree <path>` is given, run the work in that git worktree.

Pass the arguments above to the start-work skill.
