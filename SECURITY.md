# Security policy and boundaries

## Reporting

Do not publish secrets or exploit details in a public issue. Use GitHub's private
vulnerability reporting if enabled for this repository, or an established private
maintainer contact. No response-time guarantee is stated here.

Include affected versions/components, reproduction steps, impact and redacted
evidence. Do not send API keys, unredacted transcripts or private source code
unless a secure disclosure channel has been agreed.

## Trust and network boundaries

LazyZ runs local Node hooks and MCP processes with the permissions available to
the host. It is not an OS sandbox. Filesystem path checks, locks, dispatch budgets
and evidence validation apply to specific plugin code paths; they do not contain
every shell command, model action or separately installed tool.

Configured remote MCP servers are `grep_app` and `context7`. Their calls send
the selected tool arguments to those services. Local provisioning and tools can
also access network resources. Review tool permissions and payloads before using
private project information. A blanket “no network” or “no source transmission”
guarantee would be incorrect.

## Telemetry

Telemetry is disabled by default; `LAZYZ_ENABLE_TELEMETRY=1` opts in.
The implementation sends a daily-active signal and runtime/platform metadata,
not product-event analytics. This opt-in setting does not disable external MCP
tools or model-provider traffic controlled by ZCode.

## Local state and evidence

Plans, task state and evidence are project-local, commonly under `.omo`.
Command output and agent-generated artifacts may contain secrets. Redact before
writing or sharing; restrict access to the project and host data directories.
A path guard does not guarantee every model-written file has safe permissions.

The plugin includes `scripts/redact-secrets.mjs` and
`scripts/prune-evidence.mjs`. Inspect their help and scope before use: redaction
is pattern-based, not a completeness guarantee, and retention changes can delete
evidence. These scripts are not automatically run by publication preparation.

Receipts bind task/attempt/criteria/source and artifact hashes. They do not prove
that a named reviewer is authentic or that a command ran in a trusted external
runner. Structured background work is denied because an asynchronous launch
acknowledgement is not a completion receipt.

## Publication

Only explicitly selected plugin files are imported by the local sync tool.
Dependency installations, session state, caches, environment files, logs and
temporary workspaces are excluded; symlink inputs are rejected. Review imported
content and licenses because allowlisting is not a secret scanner.

The public source repository and the source-free runtime release use different
allowlists. Do not include development-root reports, private configuration,
Xcode, or operational evidence in either without an explicit review.
