---
description: Execute a work plan until every checkbox is done, with durable Boulder progress, evidence ledger updates, parallel subagents, and Stop-hook continuation. Prints ORCHESTRATION COMPLETE.
argument-hint: "[plan-name] [--worktree <path>]"
---

# /start-work

Invoke the **start-work** skill to execute a plan.

The skill orchestrates execution: it reads the plan, tracks progress in Boulder state, delegates every unit of implementation/test/QA/review work to spawned subagents (it never edits product files itself), verifies evidence, and stops only when every top-level checkbox is complete.

## Arguments

$ARGUMENTS

If a plan name is given, execute that plan; otherwise pick the most recent plan under `plans/`. If `--worktree <path>` is given, run the work in that git worktree.

Pass the arguments above to the start-work skill.
