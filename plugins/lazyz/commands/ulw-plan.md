---
description: Explore-first planning consultant. Grounds in the codebase, asks only the forks exploration cannot resolve, waits for explicit approval, then writes ONE decision-complete work plan a worker executes with zero further interview. Never writes product code.
argument-hint: "\"what to build\""
---

# /ulw-plan

Invoke the **ulw-plan** skill with the user's arguments as the planning brief.

The skill (Prometheus) will:
1. Explore the codebase to ground the plan in reality.
2. Surface only the open questions exploration cannot resolve (or research best-practice defaults when intent is fuzzy).
3. Wait for explicit approval.
4. Write one decision-complete work plan to `plans/<slug>.md`.

## Arguments

$ARGUMENTS

Pass the arguments above to the ulw-plan skill as the planning brief. Treat the entire argument string as the description of what the user wants planned.
