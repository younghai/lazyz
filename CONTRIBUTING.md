# Contributing to LazyZ

LazyZ is a community ZCode adaptation of the OmO/LazyCodex harness.
Keep changes focused, preserve attribution, and distinguish source-level checks
from observation in the actual host.

## Repository boundaries

The installable product remains in `plugins/lazyz`. Current architecture and
workflow documentation live in `docs/architecture`; dated analyses live in
`docs/reports`. `docs/waterfall` records the July 2026 baseline and is not the
current implementation contract.

Use [the publishing guide](docs/maintenance/publishing.md) when importing a
development snapshot. Do not copy an entire development workspace into this
repository or delete target-only files during synchronization.

## Build and checks

Use the existing npm contract and preserved lockfile inside `plugins/lazyz`.
Node.js 20+ runs the plugin; Bun 1.4.2 bundles components. No tool installation is
performed merely by reading this guide.

```bash
npm ci
npm run build
npm run typecheck:components
npm test
npm run test:components
npm run test:vendor
npm run check:zcode
npm audit --audit-level=moderate
node dist/cli/index.js doctor --json
```

Run checks only within the user's applicable verification authorization.
Record skipped checks explicitly; do not describe a skipped or zero-test run as
passing coverage. CI defines a Linux/macOS, Node 20/22 matrix; its definition
alone is not evidence that the matrix passed.

`npm run check` combines the build, component typechecks, root/component tests,
vendored-runtime tests and ZCode compatibility check. The vendored test boundary
is documented in [the publishing guide](docs/maintenance/publishing.md).

Ship generated component/vendor dist, bundled MCP files and `dist/cli` with
source changes. Keep source/runtime provenance current. Do not hand-edit generated
runtime JavaScript as a substitute for changing and building its source.

## State and compatibility

Boulder status is consumed by both
`components/work-status/src/work-status.ts` and
`components/start-work-continuation/src/boulder-reader.ts`. Keep both parsers
consistent when changing its status union. Boulder is still a soft-schema state;
the versioned goals in ulw-loop have a different persistence contract.

Preserve structured dispatch/receipt fields, admission-before-reservation,
failure handling, bounded retries and safe artifact paths. Read the active root
hook manifest and ZCode contract before porting a Codex-specific event or API.
Do not assume SubagentStop, PostCompact or team-thread APIs exist in ZCode.

## Submitting changes

Use the existing issue/PR templates. Include the affected version, Node/ZCode
versions, reproducible steps, relevant redacted diagnostics, checks actually
performed and remaining host limitations. Prefer small Conventional Commits
when commit creation is authorized. Never commit credentials, project `.omo`
state, local sessions or private evidence.

Security reports belong in a private channel; see [Security](SECURITY.md).
