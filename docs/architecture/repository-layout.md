# Repository layout

This repository currently contains two live products and several reusable or
vendored package trees. The structure phase records their boundaries without
moving them, so active development and release paths keep working.

## Current and target boundaries

| Current path | Target boundary | Role |
| --- | --- | --- |
| `plugins/lazyz/` | `products/lazyz/` | Shipping ZCode plugin and its prebuilt runtimes. |
| `xcode/` | `products/xcode/` | Xcode product documentation, web surface, and the live agent fork. |
| `xcode/agent/` | `third_party/pi-agent/` plus an Xcode-owned integration layer | Fork imported from `earendil-works/pi`; remains in place during this phase. |
| `comment-checker-core/`, `model-core/`, `prompts-core/`, `rules-engine/`, `shared-skills/`, `utils/`, `lsp-tools-mcp/` | `packages/<name>/` | Reusable source packages shared by product adapters. |
| `plugins/lazyz/vendor/` | `third_party/oh-my-openagent/` | Self-contained OmO/LazyCodex sources used by the shipping plugin. |
| Published `omo-ai@beta` artifact | `products/omo/` when a source product is introduced | OMO native distribution provenance; no live checkout exists here today. |

The target names describe ownership, not an approved move. Imports and build
paths must continue to use the current locations until a separate migration
changes them atomically.

## Provenance contract

`vendor.lock.json` records the immutable upstream revisions and published
artifact hashes for:

- `oh-my-openagent` v4.19.4, which is the selective provenance base for the
  LazyZ fork; its record lists imported paths, excluded features, ZCode patches,
  and the synchronization date instead of claiming an exact full-tree copy;
- the pi commit and subtree-import commit behind `xcode/agent/`; and
- `omo-ai` 5.0.0-0.beta.4 from the `younghai/oh-my-opencode` fork, with the
  canonical repository recorded separately, including its npm tarball and
  executable runtime hashes. The local ast-grep runtime anchor intentionally
  records both the patched local hash and the upstream runtime hash.

Run the local, read-only check from the repository root:

```bash
node scripts/vendor-sync.mjs --check
```

It validates the lock schema, repository-relative paths, local anchor hashes,
and the recorded subtree import commit. It does not copy, delete, rewrite, or
update vendor content. The networked audit is explicit:

```bash
node scripts/vendor-sync.mjs --check --verify-upstream
```

That mode compares npm metadata, downloads package tarballs into temporary
directories, verifies tarball and runtime hashes, and confirms the pi upstream
commit. The scheduled vendor workflow runs this stronger audit weekly.

## Why the Xcode tree stays in place

The pi subtree has repository-local commits after import, including product
branding, authentication migration, human-gate policy, and policy cleanup.
Replacing it with a submodule now would either hide those fork changes in the
superproject or require a separately published fork and migration plan.

A physical move is also premature. The nested workspace, lockfile, scripts,
docs, and CI still refer to the existing pi package graph, whose packages are
named `@earendil-works/pi-*`. No `@xcode/*` packages exist to form a stable new
package boundary. Moving first would create path churn without establishing a
real release boundary.

The next migration should therefore start only after the fork has a durable
upstream remote, the intended `@xcode/*` package names and publication policy
exist, and consumers can be updated in one reviewed change. Until then,
root-level Xcode CI runs against `xcode/agent/package-lock.json` in its current
working directory.
