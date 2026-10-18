# LazyZ

A ZCode plugin for project context, planning, governed execution and evidence-based completion.

LazyZ is a community adaptation of [LazyCodex](https://github.com/code-yeongyu/lazycodex)
and [OmO](https://github.com/code-yeongyu/oh-my-openagent). It is not affiliated with
their maintainers. Upstream attribution and vendored licenses are retained.

**Local publication snapshot: 0.11.0 · analyzed October 17, 2026.**
This snapshot imports development sources and prebuilt runtimes. It does not
certify a live ZCode installation or indicate that a GitHub release was published.

October 18: [all four Linux/macOS × Node 20/22 CI jobs passed](https://github.com/younghai/lazyz/actions/runs/39125322408)
for source commit `8f875db`, including 1,391 product tests per job and zero locked
dependency audit findings. See [the dated verification and scope report](reports/ai-review/2026-10-18-build-test-publication.html).

| Included surface | Current inventory |
| --- | ---: |
| Skills | 29 |
| Agent profiles | 13 |
| Command documents | 5 |
| Hook invocations / event types | 20 / 6 |
| MCP declarations | 6: four local, two remote |
| Package-bearing components | 12 |

## Start here

Requires Node.js 20+ on PATH. Installation uses shipped prebuilt files; contributor
builds additionally use npm and Bun. The reviewed source contract is ZCode 3.14.3
as inspected October 7, not a claim about the newest or currently installed host.

In ZCode, add this repository under Plugin Management, install `lazyz@lazyz`,
and review its hook permissions. The documented CLI equivalent is:

```bash
zcode plugin marketplace add https://github.com/younghai/lazyz
zcode plugin add lazyz@lazyz
```

Use the project workflow:

```text
/init-deep → /ulw-plan → human approval → /ulw-execute → evidence and review
```

`/start-work` is a compatibility alias of `/ulw-execute`; both require an approved,
existing plan. Use `/ulw-loop` for durable multi-goal work. Skills do not override
user authorization, verification policy or commit/publication permissions.

## What it does

- Loads project rules and work status, with resume guidance.
- Separates planning from approved execution.
- Provides inherited-model agent roles for investigation, implementation and review.
- Binds governed dispatch to task IDs, bounded attempts and evidence receipts.
- Supplies local code intelligence and remote research MCP integrations.
- Offers `doctor`, `capabilities`, consent-gated setup and runtime payload export.

Telemetry is **off by default**. Remote MCP calls and optional provisioning are
separate network paths; see [Security](SECURITY.md).

## Structure and documentation

`plugins/lazyz` is the stable marketplace installation root. This public
repository contains that plugin's sources, tests and prebuilts; Xcode and private
development/session material are outside the product boundary.

- [October 17 feature and initial-version comparison report (한국어)](docs/reports/2026-10-17-feature-evolution.md)
- [Current architecture and service flow](docs/architecture/overview.md)
- [Feature map and remaining limitations](BIG-PICTURE.md)
- [Local update and publishing procedure](docs/maintenance/publishing.md)
- [Exact imported source snapshot](docs/reports/source-snapshot.json)
- [All documentation](docs/README.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## What is not established

Static checks are not proof of live host/MCP operation. Background governed
dispatch is intentionally denied; read-only unstructured research is separate.
Stop continuation is bounded, and mid-session compaction recovery is not
guaranteed. Receipt hashes bind artifacts but do not authenticate a trusted
external runner. No measured latency, cost or productivity gain is claimed.

See [known limitations](plugins/lazyz/docs/known-limitations.md) before relying on
long autonomous runs. [July waterfall documents](docs/waterfall/README.md)
remain available as historical records, not current release assurance.
