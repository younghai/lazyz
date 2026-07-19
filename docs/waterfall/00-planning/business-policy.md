# 비즈니스 정책

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 라이선스

MIT. 업스트림 LazyCodex/OmO 소스에서 상속.

## 2. Telemetry 정책

- **기본 OFF** (privacy-by-default, GDPR 정합)
- 활성화: `LAZYZ_ENABLE_TELEMETRY=1` (또는 legacy `OMO_ENABLE_TELEMETRY=1`)
- 비활성화: `~/.omo/telemetry-disabled` 파일 또는 `LAZYZ_DISABLE_POSTHOG=1`
- 전송 데이터: hashed hostname, OS/runtime metadata, event name, day_utc
- 미전송: prompts, transcripts, source files, file paths, tokens, API keys

## 3. 데이터 보존 정책

| 데이터 | 위치 | 보존 기간 | 정리 도구 |
| --- | --- | --- | --- |
| `.omo/evidence/` | 프로젝트 로컬 | 30일 또는 100MB | `scripts/prune-evidence.mjs` |
| `.omo/*/ledger.jsonl` | 프로젝트 로컬 | 마지막 10,000줄 | `scripts/prune-evidence.mjs` |
| `.omo/boulder.json` | 프로젝트 로컬 | 작업 완료 시까지 | 수동 (LLM 작성) |
| `~/.omo/codegraph/` | 홈 | 영구 (GC 없음) | 수동 |
| `~/.local/share/lazyz/` | 홈 | 영구 (telemetry dedup) | 수동 |

## 4. 보안 정책

- `.omo/` 디렉토리: mode 0o700 강제 (13곳)
- `~/.zcode/v2/`: mode 600/700 (P0-1 완료)
- 증거 파일 PII: `scripts/redact-secrets.mjs` 스크러버 (sk-*, ghp_*, JWT, Bearer, DB 연결문자열)
- `--fix` 플래그로 마스킹, 미사용 시 CI gate (exit 1)

## 5. 비제휴 선언

LazyZ는 Sisyphus Labs와 비제휴. 업스트림 하네스의 모든 공로는 OmO maintainer에게 귀속.
