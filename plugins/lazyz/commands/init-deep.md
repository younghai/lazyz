---
description: Generate hierarchical AGENTS.md project memory. Scores complex directories, writes local guidance near the code that needs it, and gives future agents landmarks before they edit.
argument-hint: "[--create-new] [--max-depth=N]"
---

# /init-deep

Invoke the **init-deep** skill to generate hierarchical `AGENTS.md` context.

The skill scores complex directories, writes root + subdirectory `AGENTS.md` files near the code that needs them, and gives future agents landmarks before they edit. Use it when the repository is too large to explain from memory. Run it again when the shape of the codebase changes.

## Arguments

$ARGUMENTS

- No arguments — Update mode: modify existing `AGENTS.md` files and create new ones where warranted.
- `--create-new` — Read existing files, remove all, then regenerate from scratch.
- `--max-depth=N` — Limit directory depth (default: 3).

Pass the arguments above to the init-deep skill.
