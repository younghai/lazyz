# 유지보수 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 정기 점검 항목

| 주기 | 항목 | 방법 |
| --- | --- | --- |
| 월 1회 | 증거 디스크 사용량 | `du -sh .omo/evidence/` + prune 실행 |
| 월 1회 | PII 스크러빙 | `redact-secrets.mjs` 실행 |
| 분기 1회 | ZCode 플러그인 업데이트 확인 | ZCode Discover 탭 |
| 분기 1회 | Node.js 버전 확인 | `node --version` (20+ 유지) |
| 릴리스 시 | CI 전체 통과 | GitHub Actions 확인 |
| 릴리스 시 | boulder 파서 동기화 | CI `Verify boulder parser sync` |

## 2. 백로그 (Sprint 3 이월)

| 항목 | 우선순위 | 설명 |
| --- | --- | --- |
| boulder.json 코드 강제 캡 | High | 현재 prose-only, checkbox 단위 카운터 신규 설계 |
| SessionStart 병렬화 | Medium | ZCode 훅 동시성 모델 조사 후 분할 |
| teammode 포팅 | Medium | Codex thread API → ZCode Agent 대안 설계 |
| SubagentStop 강제 게이트 | Medium | codex-hook.ts 개편으로 3회 cap 시맨틱 구현 |
| evidence 자동 GC | Low | prune-evidence.mjs를 SessionStart에 자동 연결 |
| shared/ 공통 모듈 | Low | CONTEXT_PRESSURE_MARKERS, readStdin DRY화 |
| lazyz-work 병합 | Low | Desktop 사본(600M) 고유 자산 흡수 후 폐기 |

## 3. 변경 통제

### 코드 변경 시
1. `04-implementation/implementation.md` 파일 맵 갱신
2. CI 통과 (빌드 + 매니페스트 + 파서 동기화)
3. dist 재빌드 후 커밋
4. github 폴더(lazyz-github)에 동기화

### 스키마 변경 시 (boulder.json)
1. 두 파서(work-status.ts, boulder-reader.ts) 동시 수정
2. SKILL.md 예시 갱신
3. directive.md 갱신
4. CI `Verify boulder parser sync` 통과 확인

### 버전 변경 시
1. `plugins/lazyz/package.json` version 변경 (단일 출처)
2. `npm run build`로 sync-version.mjs 자동 실행
3. README changelog 갱신
