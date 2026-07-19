# Project Artifacts

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Code Artifacts

| Category | Item | Count |
| --- | --- | --- |
| Skills | skills/*/SKILL.md | 25 |
| Agents | agents/*.md | 10 |
| Commands | commands/*.md | 4 |
| Hooks | hooks/hooks.json registered | 16 |
| MCP servers | .mcp.json | 5 |
| Components | components/*/dist/cli.js | 13 (prebuilt) |
| Vendor packages | vendor/*/ | 13 |
| Scripts | scripts/*.mjs, *.sh | 12+ |

## 2. Documentation Artifacts

| Document | Location |
| --- | --- |
| README.md (root) | GitHub first impression, workflow, Changelog |
| plugins/lazyz/README.md | Detailed install/usage guide |
| AGENTS.md | Agent instructions (tool mapping, constraints, downgrade compatibility) |
| CHANGELOG.md | Release history |
| docs/known-limitations.md | Known limitations (schema_version, SessionStart latency, etc.) |
| docs/progress-semantics.md | Completion semantics unification |
| docs/regression-tests.md | Regression test specification |
| docs/waterfall/ (this doc set) | 11-phase waterfall documentation |

## 3. CI/CD Artifacts

| Item | Location |
| --- | --- |
| CI workflow | .github/workflows/ci.yml |
| Build scripts | scripts/build-components.mjs, sync-version.mjs, etc. |
| Security scrubber | scripts/redact-secrets.mjs |
| Retention pruner | scripts/prune-evidence.mjs |
| Agent installer | scripts/install-agents.sh |

## 4. GitHub Commit History

```
86600fb docs: add waterfall documentation (11 phases, 16 files)
893c2ec fix(design): 7 remaining UX inconsistencies — complete sweep
6399ae4 fix(design): UX consistency + brand unification (5 items)
f760541 docs: add update date + changelog to README
96380fb fix(ops): telemetry opt-in + codegraph timeout tuning
b30877a fix(ops): P1-P3 data governance + migration + capacity (10 items)
e3593a8 fix(ops): F1 bootstrap ZCode manifest + NFR data governance
095e9e7 docs: expand README with workflow, port rationale, ecosystem goals
0f2abbc feat: LazyZ ZCode plugin initial release
```

## 5. Consistency Audit Results

| Item | Expected | Actual | Status |
| --- | --- | --- | --- |
| Skill count | 25 | 25 | ✅ |
| Hook count | 16 | 16 | ✅ |
| MCP count | 5 | 5 | ✅ |
| Command count | 4 | 4 | ✅ |
| Agent count | 10 | 10 (.md) | ✅ |
| Version | 0.10.2 | 0.10.2 (all surfaces) | ✅ |
| Telemetry policy | opt-in (OFF by default) | root + sub-README consistent | ✅ |
| author.url | younghai/lazyz | younghai/lazyz | ✅ |
| Description "Codex" residue | 0 (excluding external names) | 0 | ✅ |
