---
name: start-work
description: "DEPRECATED — use the ulw-execute skill instead. This skill is kept only as a redirect so old references keep working. Trigger ulw-execute (or the /ulw-execute command) for plan execution with Boulder progress, evidence ledger, worktree discipline, and Stop-hook continuation."
---

# start-work (deprecated)

`start-work` has been folded into **ulw-execute**. The underlying runtime
(`components/start-work-continuation`) is unchanged — only the entrypoint moved.

- To execute a plan: invoke the **ulw-execute** skill, or run `/ulw-execute [plan-name] [--worktree <path>]`.
- Plans, Boulder state, and evidence ledgers are shared — nothing to migrate.

Do not follow any instructions below this header from older copies of this skill; always route to ulw-execute.
