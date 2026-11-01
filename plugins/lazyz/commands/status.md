---
description: Show current LazyZ work status. Summarizes awaiting-approval drafts, active plans, Boulder execution state, and registered ulw-loop goals from .omo state. Read-only.
argument-hint: "[plan-name]"
---

# /status

Report the current LazyZ work state for this project. Read state only; do not modify anything.

## What to collect

1. **Drafts first.** List `.omo/drafts/*.md`. If any draft contains `status: awaiting-approval`, surface it at the top: a plan is parked waiting for the user's explicit okay, and nothing else should be started before that decision.
2. **Plans.** List `.omo/plans/*.md`. For each (or only the named plan when an argument is given), read the `## TL;DR (For humans)` block and report the count of checked vs unchecked top-level checkboxes plus the next unchecked item.
3. **Execution state.** Read `.omo/boulder.json` if present. Summarize the plan name, session binding, and remaining work. On any parse failure, report `degraded` with what could be read; never treat malformed state as an error that blocks the rest of the report.
4. **Goals.** Read `.omo/ulw-loop/goals.json` if present. Report the aggregate goal status and per-criterion completion.

## Output format

One short section per source, then a single recommended next action: approve or reject a waiting draft, continue with `/ulw-execute <plan-name>`, or start `/ulw-plan` for new work. If `.omo/` is absent, say the project has no LazyZ state yet and suggest `/init-deep` followed by `/ulw-plan`.
