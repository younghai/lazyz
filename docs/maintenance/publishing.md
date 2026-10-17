# Preparing and publishing LazyZ

This repository contains contributor sources and prebuilt installable runtimes.
The source-free runtime payload is a separate artifact. Neither a local import
nor a static doctor result publishes a GitHub release or proves host operation.

## Local source import

From this repository root, supply the development workspace explicitly:

```bash
node scripts/sync-from-workspace.mjs --source /absolute/path/to/lazyz
node scripts/sync-from-workspace.mjs --source /absolute/path/to/lazyz --apply
```

The first command only compares. The second copies changed allowlisted files
under `plugins/lazyz`, backs up overwritten files in the printed temporary
directory, and records SHA-256 hashes in `docs/reports/source-snapshot.json`.
It never deletes target-only files. Root docs, Git history, marketplace metadata,
governance and `.github` are target-owned and require an intentional update.

Stop concurrent edits while importing. This is a local maintenance tool, not a
transactional deployment system or a security boundary against another process
changing the filesystem at the same instant. On failure, it may leave a partial
copy; use the printed backup and Git diff to recover, then retry after resolving
the cause. Do not restore unrelated user changes. Temporary backups may be
cleaned by the OS; retain one elsewhere if long-term recovery is required.

Allowed inputs include manifests, skills, agents, command docs, component source
and tests, shared/vendor build inputs, policies, runtime sources, locks and
required prebuilts. Recursive exclusions cover dependency installations, local
sessions, `.omo`, graph/cache state, environment files, logs and temporary
workspaces. Symlinks and non-regular input files are rejected. The import is not
a secret scanner: review new source content and licenses before publishing.

Do not mirror the development root. Xcode, private reports, root recovery
packages, credentials, user configuration and release working directories are
not part of this plugin repository. The development root's mixed `vendor.lock.json`
also belongs to that workspace, not this plugin-only contract.

## Build and release checks

The package-manager contract is npm; Bun 1.4.2 is pinned for component bundlers.
The tracked `package-lock.json` is authoritative for `npm ci`. `bun.lock` is a
retained upstream snapshot, not the installation lock for this distribution;
do not substitute `bun install` for the locked npm install. October 18 repairs
update security patches and explicitly declare the CLI's esbuild dependency.
Build scripts never install packages. Source checkouts rebuild the three local
MCP bundles; dist-only installations use their shipped files.

`source-snapshot.json` records the October 17 import, not the later repaired
publication tree. Preserve it as provenance. Subsequent repairs and regenerated
files are described by the Git commits and dated verification report. Re-running
the import can overwrite those target-side repairs; inspect the dry-run first.

When verification is authorized, run inside `plugins/lazyz`:

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
node dist/cli/index.js ulw-loop --help
```

`npm run check` combines all steps through compatibility (audit and payload
staging are separate). `test:vendor` runs all eleven standalone runtime/core
package suites and the six Codex helper test files used by LazyZ bootstrap.
The complete `vendor/omo-codex` installer, its nested Codex plugin, and upstream
OpenCode CLI integration suites are reference material, not a second supported
product. An exploratory full adapter run on October 18 found 17 failures,
including 11 import errors caused by missing OpenCode/monorepo assets; it was
not a passing check. Those upstream-only suites are not silently skipped inside
the product gate, and remain unchanged except a relocatable helper fixture path.
Live Codex installation and live ZCode operation require their own explicit scope.

To stage a source-free payload, choose a new empty output directory:

```bash
npm run build:release -- --output /absolute/path/to/new-release-directory
```

Do not replace the public source tree with this runtime-only payload. It
deliberately omits contributor sources, tests and dependency locks.

## Publication handoff

1. Review the change list, imported-file hashes, license attribution and new content.
2. Resolve release-blocking failures or explicitly record unverified areas. Check
   actual ZCode discovery, a plan/execute task, denial paths and local MCP startup
   in an approved host session; static doctor is not that check.
3. Stage only intended files, including new runtime/CLI files and the npm lock.
   Do not blanket-stage the development workspace.
4. Commit/push only on maintainer authorization. After GitHub CI finishes, inspect
   its actual result before calling the update released or verified.
5. Publish release notes with version, source snapshot and dated verification;
   do not relabel July or October 7 checks as October 17 checks.

As of the October 17 preparation, the remote repository was still at `64b0d5a`
(July 20). GitHub Pages was disabled. This is repository preparation, not a Pages
site deployment. A website can be a later separately authorized deliverable.
