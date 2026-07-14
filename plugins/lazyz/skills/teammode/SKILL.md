---
name: teammode
description: "Multi-agent team collaboration for large or parallelizable work. The main session acts as the LEADER: it defines 2+ members with concrete ownership slices, dispatches each as a parallel background Agent call, collects their final-message deliverables, and integrates the results. MUST USE when the user asks for a 'team', 'multiple agents', 'parallel members', 'squad', 'divide and conquer', or the work has 2+ clearly independent slices that benefit from isolation. Do NOT use for single-threaded tasks or when slices are tightly coupled (use ulw-loop or start-work instead)."
---

# teammode — ZCode team collaboration (lightweight port)

You orchestrate a team of parallel agents. The main session is the **leader**: it
plans the slices, dispatches members, collects results, and integrates. The leader
**never writes product code** while a team is running — every edit is a member's slice.

This is a lightweight port of the upstream Codex `teammode` skill. ZCode has no native
team-of-threads API and no live member-messaging channel, so members are **one-shot
`Agent`-tool calls** whose final message IS the deliverable. Coordination happens through
the leader's turn and the shared `artifacts/` directory, not through live messaging.

## When to use teammode (and when not)

**Use teammode when:**
- The work splits into 2+ **independent** slices (different modules, different concerns,
  different perspectives) that can be worked in parallel.
- A large task benefits from isolated worktrees per slice so members don't trip over each
  other's files.

**Do NOT use teammode when:**
- The task is single-threaded or the slices are tightly coupled (use `start-work` / `ulw-loop`).
- There is only one slice (a single member is not a team — it is a subagent; use `Agent`).
- You need live back-and-forth between members (ZCode members are fire-and-forget; they
  cannot message each other mid-run. Cross-member exchange is via the `artifacts/` directory).

## ZCode Agent-tool model (the constraint that shapes everything)

A member is **one `Agent` tool call** with `subagent_type` + `run_in_background: true` +
a self-contained `prompt`. You have **one turn per dispatch**: the member does its work and
returns a single final message. That message is the deliverable. There is no
`send_message` to a running member — to re-task a member, dispatch a fresh `Agent` call.

LazyZ does NOT install ZCode-recognized agent roles automatically, so **describe the
member's role inside the `prompt` text** (the `member-prompt` script below generates the
canonical bootstrap text for each member). Do not rely on `subagent_type` alone to convey
the role.

## Controller CLI

All team state lives under `<cwd>/.omo/teams/<session-id>/`. Manage it through the
controller script — **never hand-write `team.json` or `guide.md`**, and **never hand-run
`git worktree` or `git merge`** for team isolation (use `worktree-add` / `integrate`):

```
SCRIPT="${ZCODE_PLUGIN_ROOT}/components/teammode/scripts/team.mjs"

# 1. Create the team (pick a memorable session id, or let it auto-generate)
node "$SCRIPT" init --name "<team name>" --session-name "<session label>" [--session <id>] [--worktree] [--base-branch <branch>]

# 2. Add members (minimum 2). Each needs a concrete focus, a lens, and a deliverable.
node "$SCRIPT" add-member --team <id> --id A --name "<short role>" \
  --focus "<concrete part/ownership/perspective>" \
  --lens area|ownership|perspective \
  --deliverable "<what this member produces>" [--branch <b>]
# repeat for B, C, ...

# 3. Inspect
node "$SCRIPT" status --team <id>

# 4. Dispatch members (leader does this with the Agent tool — see below)

# 5. (Optional) isolate members that collide on files
node "$SCRIPT" worktree-add --team <id> --id A [--base-branch <b>]
# re-dispatch A with its worktree path as cwd

# 6. Integrate member branches back (merge commits, never squash/rebase)
node "$SCRIPT" integrate --team <id> [--id A]

# 7. Close out
node "$SCRIPT" set-status --team <id> --id A --status reported
node "$SCRIPT" archive --team <id>
node "$SCRIPT" delete --team <id>
```

Other subcommands: `member-prompt --team <id> --id A` (prints the member's bootstrap
prompt text, which you paste into the `Agent` call), `set-run-id` (record which Agent
call produced a member's result), `guide` (regenerate the member field manual).

## Leader protocol

### 1. Define the team and its slices

A member is defined by a **concrete** `focus` (a part, ownership area, or perspective),
a `lens` (`area` | `ownership` | `perspective`), a `deliverable`, and a short `name`.
Vague job titles like "backend dev" are an anti-pattern — name the actual slice
("rate-limit middleware", "auth token refresh flow", "iOS layout regression").

Run `init` then `add-member` for each slice. A team is **always 2+ members**; the
controller refuses to treat a single member as a team.

### 2. Dispatch all members in one turn

Generate each member's bootstrap prompt with `member-prompt`, then fire **every** member
as a parallel `Agent` call in a single message — do not serialize them. Each call uses
`run_in_background: true` so they run concurrently:

```
Agent(
  subagent_type="general-purpose",        // or "Explore" for read-only research members
  run_in_background=true,
  description="<member A short role>",
  prompt="<paste the member-prompt output for A, plus any task-specific context, files,
          constraints, and the exact deliverable you expect>"
)
Agent(
  subagent_type="general-purpose",
  run_in_background=true,
  description="<member B short role>",
  prompt="<paste the member-prompt output for B, plus context>"
)
# ...one call per member, all in ONE message
```

Because the `Agent` tool starts a child with only the prompt you give it (no parent
history), **include all required context inline**: the slice definition, relevant file
paths, constraints, the artifacts directory path, and what "done" means. Point the member
at its field manual (`guide.md`) and team state (`team.json`) paths so it can read them.

After dispatching, record each call's handle with `set-run-id` if you want to track which
Agent result maps to which member (optional but helpful for status reporting).

### 3. Collect deliverables

Each member's **final message** is its deliverable. Wait for the background calls to
complete in bounded cycles; do not treat a timeout, an ack-only reply, or an empty result
as a PASS. A member that returns `BLOCKED:` needs a re-dispatch (a fresh `Agent` call with
the blocker resolved, e.g. a peer's output now in `artifacts/`). A member that returns
`PARTIAL:` may warrant a smaller follow-up dispatch for the remainder.

Mark each member's status as it reports: `set-status --team <id> --id A --status reported`
(or `blocked`).

### 4. Worktree isolation (conflict-triggered, not mandatory up front)

The moment two members' slices would edit the **same files**, give each its own git
worktree. Decide this when you see the collision — at team creation OR mid-run. The first
`worktree-add` flips the whole team into worktree mode:

```
node "$SCRIPT" worktree-add --team <id> --id A
```

This provisions a branch `team/<session-id>/A` off the base branch and a worktree under
`.omo/teams/<session-id>/worktrees/A`. **Re-dispatch member A** with its worktree path set
as its `cwd` (the `member-prompt` output and `guide.md` instruct the member to work only
there).

### 5. Integrate

When members finish in their worktrees, integrate their branches back with **merge commits
only** (`--no-ff`, never squash, never rebase — repo policy):

```
node "$SCRIPT" integrate --team <id>            # all members with worktree branches
node "$SCRIPT" integrate --team <id> --id A      # just one
```

On conflict, the controller leaves the tree mid-merge and lists the conflicting files.
Resolve the conflict, commit the merge, then re-run `integrate`.

### 6. Cross-member exchange via artifacts

Members share files through `<cwd>/.omo/teams/<session-id>/artifacts/`. A member that
produces a large output (a diff, a report, a generated file) writes it there and references
the path in its final message. A member that depends on a peer's output checks `artifacts/`
first; if absent, it returns `BLOCKED: waiting on <member id> for <thing>` so you can
re-sequence.

## Limitations vs. the upstream Codex teammode (read before relying on it)

- **No live member messaging.** Upstream members push findings to each other and the leader
  via `send_message_to_thread` in real time. ZCode members cannot — each returns one final
  message. Cross-member coordination collapses to: member writes to `artifacts/`, leader
  reads it and re-dispatches dependents. Plan slices to minimize back-and-forth.
- **No durable, re-taskable members.** Upstream members are durable threads you can message
  again. ZCode members are one-shot; re-tasking means a fresh `Agent` call.
- **Single model (GLM-5.2).** All members run on the same model with no per-role reasoning
  effort. Expect less depth than the Codex multi-model original on highly ambiguous slices.
- **No PostToolUse member-completion hook.** Upstream watched `create_thread` to enforce
  thread-title hygiene. ZCode has no thread creation to watch; the leader polls background
  Agent completions directly.

## Hard rules

- The leader **never edits product code** while a team is running. Delegate every edit.
- A team is **always 2+ members**. One slice is a subagent, not a team.
- Members are defined by **concrete** focus/lens/deliverable — never vague job titles.
- Never hand-write `team.json` or `guide.md`. Never hand-run `git worktree` or `git merge`
  for team isolation. Use the controller subcommands only.
- Integration is **merge commits only** (`--no-ff`). Never squash, never rebase.
