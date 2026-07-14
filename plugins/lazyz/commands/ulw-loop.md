---
description: Self-referential loop that decomposes work into systematic, evidence-bound steps and runs until the result is Oracle-verified. Caps at 500 iterations in ultrawork mode, 100 in normal mode.
argument-hint: "\"task\" [--completion-promise=TEXT] [--strategy=reset|continue]"
---

# /ulw-loop

Invoke the **ulw-loop** skill with the user's task.

The skill runs a goal-like loop using ultrawork mode: it decomposes the work into systematic, evidence-bound steps, executes each step, and keeps iterating until the result is verified by evidence rather than a hopeful status update.

## Arguments

$ARGUMENTS

- The first argument (or `$1`) is the task description.
- `--completion-promise=TEXT` (optional) — a textual completion promise the loop checks against.
- `--strategy=reset|continue` (optional) — whether to reset state or continue from a prior run.

Pass the arguments above to the ulw-loop skill.
