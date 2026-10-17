# OMO / Senpi / pi Family Coding-Agent Sessions

The pi family shares one JSONL session format and is exposed through three platform keys:

- `senpi`: `~/.omo/agent`, `~/.senpi/agent`, `~/.pi/agent`
- `oh-my-pi` (alias `omp`): `~/.omp/agent`
- `gajae-code` (alias `gjc`): `~/.gjc/agent`

Each config root may also contain `profiles/*/agent`, and XDG data roots are probed when `XDG_DATA_HOME` is set. Sessions live under:

- `<agent-root>/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`
- `~/.senpi/agent/settings.json`, `models.json`, and `auth.json` provide environment context.

Common event types:

- `session`: includes `id`, `timestamp`, and `cwd`.
- `model_change`: includes `provider` and `modelId`.
- `thinking_level_change`: includes effort metadata.
- `message`: wraps provider-native messages, tool calls, usage, and costs.
- `custom` with `customType: senpi.todo-state`: stores todo state.

Prefer Senpi usage fields when present: `usage.input`, `usage.output`, `usage.cacheRead`, `usage.cacheWrite`, `usage.totalTokens`, and `usage.cost.total`.
