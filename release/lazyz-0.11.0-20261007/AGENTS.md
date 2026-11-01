# LazyZ — ZCode integration notes

LazyZ is an OmO/LazyCodex distribution for ZCode. These notes describe the
ZCode 3.14.3 source contract reviewed on 2026-10-07; they are not a probe of
the installed ZCode binary. See [ZCode-native 0.11](docs/zcode-native-0.11.md)
for pinned upstream sources and the compatibility matrix.

## Agent roles and model routing

The plugin manifest declares `"agents": "./agents/"`. ZCode 3.14.3 source
loads enabled plugin `agents/*.md` profiles and exposes them with a
plugin-qualified name such as `lazyz:lazycodex-executor`; it may also expose a
bare name when there is no collision. Use the qualified name when a skill
needs an unambiguous LazyZ role. Copying roles into `~/.zcode/agents/` is an
older-host compatibility option, not the normal 0.11 installation path.

All 13 LazyZ roles declare `model: inherit`. That means use the active ZCode
model; it is not a GLM-5.2 pin. When selecting a particular ZCode model,
`thoughtLevel` is the documented companion setting and applies only with that
specific model. Do not translate Codex `model_reasoning_effort` or
`service_tier` fields into an assumed ZCode setting.

## Tooling map

| Earlier harness concept | ZCode / LazyZ 0.11 guidance |
| --- | --- |
| `spawn_agent` / `task` | Call `Agent` with an installed role or a self-contained role prompt. |
| background research | `run_in_background: true` is suitable for read-only, unstructured work such as `Explore`. The launch acknowledgement is not completion. |
| governed executor / reviewer output | Keep it foreground. The LazyZ verifier rejects a structured governed execution requested with `run_in_background: true`, because no plugin hook observes a reliable background-completion receipt. |
| `background_output(task_id=...)` | Do not infer a completion API from the launch acknowledgement. ZCode reports `async_launched` first and later emits host-side completion notification/session state. |
| `/start-work` | Compatibility alias for the canonical `/ulw-execute` command and existing start-work runtime. |
| `team_*` | The retained `teammode` skill coordinates Agent calls and local artifacts. It does not recreate Codex thread creation or worktree-host APIs, and its current orchestration does not depend on the host `SendMessage` continuation surface. |

## Hooks, continuation, and receipts

The declared root hooks use ZCode `process` entries (`command: "node"`, an
`args` array, and `timeoutMs`) rather than a shell wrapper. Hook input is
normalized for optional `model` and `turn_id`; temporary transcript data is
only invocation-scoped. Persistent LazyZ hook state belongs under the
host-provided `ZCODE_PLUGIN_DATA` directory.

ZCode supports these events: `SessionStart`, `UserPromptSubmit`,
`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, and
`Stop`. It does not provide `PostCompact` or `SubagentStop`. LazyZ uses
`SessionStart` matchers for `compact|clear` cache-reset work, but that does not
create a guaranteed mid-session continuation event.

`PostToolUse` is a result-observation point, not a replacement for a
subagent-completion hook. The verifier keeps an already-launched async
governed task unresolved rather than treating its launch acknowledgement or a
missing receipt as success/failure. It recognizes both bare and `lazyz:`
namespaced governed roles.

The host permits at most three consecutive `Stop` blocks/continuations. That
limit bounds one consecutive host sequence; it is not a persistent security
boundary or a proof that a workflow completed.

## MCP and runtime requirements

The four local MCP declarations use `command`, `args`, `cwd`, `enabled: true`,
and `timeoutMs: 30000`; `grep_app` and `context7` are remote. ZCode 3.14.3
source supports those stdio fields. LazyZ deliberately does not declare
undocumented `required`, `defer`, or lazy-loading fields.

Node.js 20+ is required at runtime for the process hooks and local server
entrypoints. Bun is required only when rebuilding prebuilt artifacts. The
shell wrapper dependency was removed from root hook declarations. This removes
that particular Windows shell requirement, but Windows runtime behavior has
not been exercised here, so LazyZ does not claim full Windows support.

`lazyz capabilities --json` prints the reviewed source contract; it does not
detect or validate the installed host. `lazyz doctor` statically checks the
declared process/args hook shape and local payload files; it is not host-runtime
QA.

## Host features outside the LazyZ contract

ZCode source includes native goal, memory, and wiki-related surfaces. LazyZ
does not claim a plugin-call API for them: no API is inferred from their source
presence. LazyZ keeps durable workflow state in its own documented `.omo/`
files until an official plugin API is documented.
