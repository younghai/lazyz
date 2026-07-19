# Maintenance Plan

| Item | Value |
| --- | --- |
| Document version | v1.0 |
| Date | 2026-07-19 |

## 1. Regular Inspection Items

| Frequency | Item | Method |
| --- | --- | --- |
| Monthly | Evidence disk usage | `du -sh .omo/evidence/` + run prune |
| Monthly | PII scrubbing | Run `redact-secrets.mjs` |
| Quarterly | ZCode plugin update check | ZCode Discover tab |
| Quarterly | Node.js version check | `node --version` (keep 20+) |
| Per release | Full CI pass | GitHub Actions |
| Per release | Boulder parser sync | CI `Verify boulder parser sync` |

## 2. Backlog (Sprint 3 deferred)

| Item | Priority | Description |
| --- | --- | --- |
| boulder.json code-enforced caps | High | Currently prose-only; design checkbox-level counter |
| SessionStart parallelization | Medium | Investigate ZCode hook concurrency, then split |
| teammode porting | Medium | Codex thread API → ZCode Agent alternative design |
| SubagentStop enforcement gate | Medium | Rewrite codex-hook.ts for 3-attempt cap semantics |
| Evidence auto GC | Low | Auto-trigger prune-evidence.mjs from SessionStart |
| shared/ common module | Low | DRY CONTEXT_PRESSURE_MARKERS, readStdin |
| lazyz-work merge | Low | Absorb unique assets from Desktop copy (600M), then discard |

## 3. Change Control

### Code changes
1. Update file map in `04-implementation/implementation.md`
2. CI pass (build + manifest + parser sync)
3. Rebuild dist and commit
4. Sync to github folder (lazyz-github)

### Schema changes (boulder.json)
1. Modify both parsers (work-status.ts, boulder-reader.ts) simultaneously
2. Update SKILL.md example
3. Update directive.md
4. Confirm CI `Verify boulder parser sync` passes

### Version changes
1. Change `plugins/lazyz/package.json` version (single source)
2. `npm run build` auto-runs sync-version.mjs
3. Update README changelog
