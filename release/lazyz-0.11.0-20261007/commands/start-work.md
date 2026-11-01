---
description: Execute a work plan until every checkbox is done, with durable progress tracking, evidence ledger updates, parallel subagents, and automatic continuation. Prints ORCHESTRATION COMPLETE.
argument-hint: "[plan-name] [--worktree <path>]"
---

# /start-work

Invoke the **start-work** skill to execute a plan.

The skill orchestrates execution: it reads the plan, tracks progress in Boulder state, delegates every implementation/test/QA/review unit through the required execution schema (`execution_shape`, `role`, `parallel_safe`, `owned_paths`, `completion_condition`), gates assignments and worker finals through the bundled eval-free validator, validates artifacts and evidence, and stops only when every top-level checkbox is complete.

## Arguments

$ARGUMENTS

If a plan name is given, execute that plan; otherwise pick the most recent plan under `plans/`. If `--worktree <path>` is given, run the work in that git worktree.

Pass the arguments above to the start-work skill.
