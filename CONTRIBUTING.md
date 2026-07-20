# Contributing to LazyZ

Thank you for your interest in contributing! LazyZ is a community port of the
OmO/LazyCodex agent harness for ZCode.

## How to Contribute

### Bug Reports
1. Check existing issues to avoid duplicates.
2. Use the bug report template (`.github/ISSUE_TEMPLATE/bug-report.md`).
3. Include: ZCode version, Node.js version, OS, steps to reproduce, expected
   vs actual behavior, and relevant `[LazyZ]` stderr diagnostics.

### Feature Requests
1. Open a discussion or issue describing the use case.
2. Explain which of the four stages (memory, plan, execute, verify) it
   improves and why.

### Pull Requests
1. Fork the repository and create a feature branch.
2. **Build before committing**: `cd plugins/lazyz && npm install && npm run build`.
   The prebuilt `dist/` must be committed (install-and-go policy).
3. **CI must pass**: build, manifest consistency, and boulder parser sync.
4. Keep PRs focused — one logical change per PR.
5. Use Conventional Commits (`fix(scope): description`).

### Code Style
- TypeScript strict mode. No `@ts-ignore`.
- Bun for bundling components. `tsc` for type-checked components.
- Terse technical prose. No emojis in source code or diagnostics.

### Schema Changes (boulder.json)
- Modify **both** parsers simultaneously:
  `components/work-status/src/work-status.ts` and
  `components/start-work-continuation/src/boulder-reader.ts`.
- CI step `Verify boulder parser sync` will fail if they diverge.
- Update `skills/start-work/SKILL.md` examples and `directive.md`.

## Project Structure

See `docs/waterfall/` for the full architecture documentation (11 phases).
