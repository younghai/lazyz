# LazyZ 0.11 — ZCode-native contract

**Reviewed:** 2026-10-07. **LazyZ manifest:** 0.11.0. **Host baseline:** ZCode
3.14.3, release commit
[`29628c9acdb81b703bbd4080c207a0e7ce5e276e`](https://github.com/zai-org/ZCode/commit/29628c9acdb81b703bbd4080c207a0e7ce5e276e).
This is a source-reviewed compatibility target, not a claim about any installed
ZCode version or a substitute for host-runtime testing.

## What 0.11 adopts

| Host contract | LazyZ 0.11 adaptation | Why |
| --- | --- | --- |
| Plugin manifest can declare `agents` | `.zcode-plugin/plugin.json` declares `"agents": "./agents/"`; 13 profiles use `model: inherit`. | Current host source loads enabled-plugin profiles and qualifies collisions as `lazyz:<profile>`. |
| Agent model defaults to inherit | No GLM-5.2 pin. An explicit model may use `thoughtLevel` only when that model is selected. | Avoids importing Codex `model_reasoning_effort` / `service_tier` assumptions into ZCode. |
| Hooks support structured `process` execution | 20 hooks across six declared events use `command: "node"`, `args`, and `timeoutMs`. | No shell parsing is needed for a Node entrypoint. |
| `SessionStart` matcher can identify `compact` / `clear` | LSP and Git reminder cache-reset hooks run for those sources. | ZCode has no `PostCompact`; a reset hook is not an automatic mid-session work-resume guarantee. |
| Hook transcript is invocation-scoped | Hook state uses `ZCODE_PLUGIN_DATA`; optional `model` and `turn_id` are normalized. | Do not persist to, or rely on, a temporary host transcript. |
| Background Agent returns a launch acknowledgement | Governed structured work is foreground-only; background read-only unstructured exploration remains allowed. | `async_launched` means started, not completed, and no plugin completion hook is documented. |
| Stdio MCP supports `command`, `args`, `cwd`, `env`, `enabled`, `timeoutMs` | Four local servers use Node, `enabled: true`, and `timeoutMs: 30000`. | These are the fields present in the reviewed resolver. |

The command-flow boundary is deliberately narrow:

Rules and LSP use separate `ZCODE_PLUGIN_DATA/rules/sessions/` and
`ZCODE_PLUGIN_DATA/lsp/sessions/` caches. Earlier shared `sessions/` cache
files are left untouched and ignored; the first hook rebuilds its own cache.

```text
Agent request
  ├─ read-only / unstructured → may launch in background → host later owns completion notification
  └─ any structured dispatch  → PreToolUse requires foreground → PostToolUse consumes an actual result
                                                       └─ async launch acknowledgement stays unresolved
```

The verifier accepts namespaced and bare LazyZ governed role names equally. A
nested text response may be parsed as actual host result text, but LazyZ does
not manufacture a success receipt from arbitrary fields. This preserves an
unresolved state where the host has not supplied a completion result.

The root manifest uses the following current-tree form (the component and
timeout vary by hook):

```json
{
  "type": "process",
  "command": "node",
  "args": ["${ZCODE_PLUGIN_ROOT}/components/lsp/dist/cli.js", "hook", "session-start"],
  "timeoutMs": 5000
}
```

`/ulw-execute` is the canonical command for approved-plan execution;
`/start-work` remains the compatibility alias for the same start-work runtime.
The retained `teammode` skill is an Agent-call/local-artifact port, not the
Codex thread API. ZCode source separately exposes a `SendMessage` continuation
path for foreground and background agents; LazyZ 0.11 does not base its
artifact-oriented team orchestration on that path.

## Explicit non-adoptions and limits

- There is no official ZCode `PostCompact` or `SubagentStop` hook event.
  `PostToolUse` observes a tool result; it is not a general background-agent
  completion callback.
- `Stop` can block/continue at most three consecutive times. This bounds a
  consecutive host loop only; it is neither a durable authorization boundary
  nor a proof of completion.
- LazyZ declares no `required`, `defer`, or lazy-load MCP field. The reviewed
  source did not establish those as supported plugin configuration fields.
- `nativeGoalMode`, Memory, and Wiki-related host surfaces exist in current
  source, but LazyZ does not infer a plugin-call API from their existence.
- Root hooks no longer depend on a POSIX shell. That removes one Windows
  dependency, but no Windows runtime QA is claimed.
- Node.js 20+ is a runtime requirement. Bun is for rebuilding prebuilt
  artifacts only.
- A future source layout can change these findings. `lazyz capabilities --json`
  prints this reviewed contract and does **not** probe the installed host;
  `lazyz doctor` performs static manifest/payload checks, including the
  process/args hook shape, not host-runtime validation.

## Source basis

### Official documentation

- [ZCode hooks](https://zcode.z.ai/en/docs/hooks) — event list, process-hook
  form, stdout/exit handling, `ZCODE_PLUGIN_DATA`, and the three-consecutive
  `Stop` limit.
- [ZCode plugins](https://zcode.z.ai/en/docs/plugin) — plugin manifest and
  standard discovery conventions.
- [ZCode subagents](https://zcode.z.ai/en/docs/subagents) — agent frontmatter
  and model behavior, including `model`/`thoughtLevel` usage.
- [ZCode MCP services](https://zcode.z.ai/en/docs/mcp-services) — MCP service
  configuration and connection lifecycle.
- [ZCode 3.14.3 release](https://github.com/zai-org/ZCode/releases/tag/v3.14.3)
  — version/date anchor for this review.

### Pinned public source evidence

ZCode host source is public under the upstream repository; it is not limited
to plugin examples. The following links are pinned to the reviewed release
commit rather than a moving branch:

- [Plugin agent discovery](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/bootstrap/src/subagents.ts#L126-L188)
  — enabled-plugin `agents/*.md` loading and namespacing.
- [Agent result contract](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/contracts/src/tools/agent.ts#L44-L112)
  — completed result versus `{ "status": "async_launched", "isAsync": true }`.
- [Background runner lifecycle](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/core/src/subagent/runner.ts#L318-L381)
  — the launch acknowledgement and later host-side completion path.
- [Agent tool handler](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/core/src/tool/handlers/agent.ts#L116-L190)
  — returned `agentId` continuation instructions and `SendMessage` support for
  foreground/background agents.
- [MCP plugin resolver](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/adapters/src/plugins/mcp.ts#L201-L249)
  — accepted stdio configuration fields used by LazyZ.
- [Hook source discovery](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/apps/zcode-cli/packages/adapters/src/plugins/hook-sources.ts#L22-L101)
  — standard plugin hook-source discovery.

## Upstream distribution note

The OmO/LazyCodex upstream distribution reference captured for this update is
`5.1.22` on the stable/latest line and `5.1.0` on its beta line. That is an
upstream provenance note, not a LazyZ or ZCode version and not an automatic
upgrade instruction. LazyZ remains manifest version `0.11.0` and carries only
the adapted sources/configuration explicitly documented above.
