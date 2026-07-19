# 데이터 거버넌스 런북

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 데이터 분류

| 분류 | 위치 | 민감도 | 보호 조치 |
| --- | --- | --- | --- |
| 증거 파일 | `.omo/evidence/` | HIGH (PII/secret 가능) | mode 0o700, redact-secrets.mjs |
| 감사 로그 | `.omo/*/ledger.jsonl` | HIGH (commands 필드) | mode 0o700, redact-secrets.mjs |
| 진행 상태 | `.omo/boulder.json` | MEDIUM (plan_name, session_id) | mode 0o700 |
| 목표/크리테리아 | `.omo/ulw-loop/goals.json` | MEDIUM | mode 0o700 |
| 텔레메트리 | PostHog (opt-in) | LOW (hashed hostname) | opt-in 게이트 |
| 카운터 | `.omo/start-work-continuation/` | LOW | mode 0o700 |

## 2. 접근 권한 (RBAC)

LazyZ는 다중 사용자 RBAC를 가지지 않는다 (로컬 개발 도구). 대신 파일 권한으로 보호:

| 경로 | mode | 근거 |
| --- | --- | --- |
| `.omo/` 하위 전체 | 0o700 | 증거/상태 파일의 그룹/타인 접근 차단 (13곳 강제) |
| `~/.zcode/v2/config.json` | 600 | API 키 평문 보호 (P0-1) |
| `~/.zcode/v2/` | 700 | 설정 디렉토리 보호 (P0-1) |
| `~/.omo/telemetry-notified` | 0o700 (상속) | 센티넬 파일 |

## 3. PII / Secret 관리

### 증거 파일 PII 벡터
- HTTP 응답 (`curl -i`): 인증 헤더, 쿠키, 세션 토큰
- tmux 트랜스크립트: shell history 급 노출
- DB diff: 사용자 데이터
- 스크린샷: 화면에 보이는 모든 정보

### 완화 조치
1. **1차 방어**: SKILL.md/directive.md prose ("redact secrets before writing")
2. **2차 방어**: `scripts/redact-secrets.mjs` 스크러버 (사후 grep 기반)
   - 패턴: sk-*, ghp_*, AKSA*, JWT, Bearer, key=value, connection string
   - `--fix`로 마스킹, 미사용 시 CI gate (exit 1)
3. **3차 방어**: 파일 권한 0o700 (다른 계정 접근 차단)

## 4. 감사 로그 (Audit Trail)

| 로그 | 신뢰성 | 회전 |
| --- | --- | --- |
| `.omo/start-work/ledger.jsonl` | LOW (LLM 작성, "fields drift") | prune-evidence.mjs (10k줄) |
| `.omo/ulw-loop/ledger.jsonl` | MEDIUM (TS CLI, mutation lock) | prune-evidence.mjs (10k줄) |
| `~/.local/share/lazycodex/bootstrap/bootstrap.log` | MEDIUM (TS, 구조화) | 없음 |
| `~/.local/share/lazyz/telemetry-diagnostics.jsonl` | MEDIUM (TS, 256KB cap) | 7일 캡 |

## 5. 데이터 보존/폐기

| 데이터 | 보존 | 폐기 방법 |
| --- | --- | --- |
| `.omo/evidence/` | 30일 또는 100MB | `prune-evidence.mjs` (수동) |
| ledger.jsonl | 마지막 10,000줄 | `prune-evidence.mjs` (수동) |
| boulder.json | 작업 완료 시까지 | 수동 삭제 또는 status 전이 |
| `~/.omo/codegraph/` | 영구 | 수동 (`rm -rf`) |
| `~/.zcode/agents/` | 영구 | `install-agents.sh` 재실행으로 덮어쓰기 |

## 6. 컴플라이언스

### GDPR / 개인정보보호법
- telemetry: **opt-in** (기본 OFF). `LAZYZ_ENABLE_TELEMETRY=1` 있을 때만 전송.
- hashed hostname: 가명화 (pseudonymization), 고정 salt. 식별 가능성 낮지만 익명화 아님.
- 사용자 데이터: 증거 파일에 PII 포함 가능. redact-secrets.mjs로 사후 스크러빙.
- 데이터 주권: PostHog US 리전 (기본). `POSTHOG_HOST`로 override 가능.
