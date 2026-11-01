---
description: Run LazyZ installation self-diagnostics via the lcx-doctor skill. Checks install health against the latest sources and reports actionable fixes.
---

# /doctor

Invoke the **lcx-doctor** skill to diagnose this LazyZ installation: plugin manifest and payload integrity, hook process entrypoints, MCP server configuration, enabled state, and version status against the latest sources.

Report findings as PASS / WARN / FAIL, each with a one-line fix. Do not modify plugin files while diagnosing.

This command exists so the health check is reachable from the `/` menu; the `lcx-doctor` skill remains the implementation. It is an explicit user request, which satisfies that skill's activation gate.
