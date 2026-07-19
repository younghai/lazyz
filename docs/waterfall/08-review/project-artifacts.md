# 산출물 목록

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 코드 산출물

| 분류 | 항목 | 수량 |
| --- | --- | --- |
| 스킬 | skills/*/SKILL.md | 25 |
| 에이전트 | agents/*.md | 10 |
| 커맨드 | commands/*.md | 4 |
| 훅 | hooks/hooks.json 등록 | 16 |
| MCP 서버 | .mcp.json | 5 |
| 컴포넌트 | components/*/dist/cli.js | 13 (prebuilt) |
| vendor 패키지 | vendor/*/ | 13 |
| 스크립트 | scripts/*.mjs, *.sh | 12+ |

## 2. 문서 산출물

| 문서 | 위치 |
| --- | --- |
| README.md (루트) | GitHub 첫인상, 워크플로우, Changelog |
| plugins/lazyz/README.md | 상세 설치/사용 가이드 |
| AGENTS.md | 에이전트 지시 (툴 매핑, 제약, downgrade 호환성) |
| CHANGELOG.md | 릴리스 이력 |
| docs/known-limitations.md | 알려진 한계 (schema_version, SessionStart 지연 등) |
| docs/progress-semantics.md | 완료 의미 통일 |
| docs/regression-tests.md | 회귀 테스트 명세 |
| docs/waterfall/ (본 문서 세트) | 11 Phase waterfall 문서 |

## 3. CI/CD 산출물

| 항목 | 위치 |
| --- | --- |
| CI 워크플로우 | .github/workflows/ci.yml |
| 빌드 스크립트 | scripts/build-components.mjs, sync-version.mjs 등 |
| 보안 스크러버 | scripts/redact-secrets.mjs |
| retention pruner | scripts/prune-evidence.mjs |
| 에이전트 설치 | scripts/install-agents.sh |

## 4. GitHub 커밋 이력

```
893c2ec fix(design): 7 remaining UX inconsistencies — complete sweep
6399ae4 fix(design): UX consistency + brand unification (5 items)
f760541 docs: add update date + changelog to README
96380fb fix(ops): telemetry opt-in + codegraph timeout tuning
b30877a fix(ops): P1-P3 data governance + migration + capacity (10 items)
e3593a8 fix(ops): F1 bootstrap ZCode manifest + NFR data governance
095e9e7 docs: expand README with workflow, port rationale, ecosystem goals
0f2abbc feat: LazyZ ZCode plugin initial release
```

## 5. 정합성 검증 결과

| 항목 | 기준값 | 실제값 | 상태 |
| --- | --- | --- | --- |
| 스킬 수 | 25 | 25 | ✅ |
| 훅 수 | 16 | 16 | ✅ |
| MCP 수 | 5 | 5 | ✅ |
| 커맨드 수 | 4 | 4 | ✅ |
| 에이전트 수 | 10 | 10 (.md) | ✅ |
| 버전 | 0.10.2 | 0.10.2 (전 표면) | ✅ |
| telemetry 정책 | opt-in (OFF by default) | root + 부품 README 일치 | ✅ |
| author.url | younghai/lazyz | younghai/lazyz | ✅ |
| description "Codex" 잔재 | 0건 (외부 명칭 제외) | 0건 | ✅ |
