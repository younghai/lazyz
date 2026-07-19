# 운영 가이드

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 환경 요구사항

| 요구사항 | 최소 | 권장 |
| --- | --- | --- |
| ZCode | 최신 안정 버전 | 최신 |
| Node.js | 20+ | 22+ |
| OS | macOS, Linux | macOS (Windows 미지원) |
| Bun (빌드 시만) | latest | latest |

## 2. 런타임 환경 변수

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `LAZYZ_ENABLE_TELEMETRY` | (없음=OFF) | telemetry opt-in |
| `LAZYZ_DISABLE_POSTHOG` | (없음) | telemetry 강제 비활성화 |
| `LAZYZ_RULES_*` | (없음) | rules 엔진 설정 (CODEX_RULES_* 별칭) |
| `LAZYZ_START_WORK_MAX_CONTINUATIONS` | 10 | Stop hook 재개 횟수 제한 (0=무제한) |
| `ZCODE_PLUGIN_ROOT` | (ZCode 주입) | 플러그인 루트 경로 |

## 3. 정기 운영 작업

### 증거 정리 (월 1회 권장)
```bash
node plugins/lazyz/scripts/prune-evidence.mjs --days 30 --max-bytes 104857600
```

### PII 스크러빙 (공유/커밋 전)
```bash
node plugins/lazyz/scripts/redact-secrets.mjs          # 검사만
node plugins/lazyz/scripts/redact-secrets.mjs --fix    # 마스킹
```

### 에이전트 업데이트 (플러그인 업데이트 후)
```bash
sh plugins/lazyz/scripts/install-agents.sh
```

## 4. 장애 진단

### "스킬이 안 보여요"
1. ZCode → Settings → Plugin Management → `lazyz@lazyz` enabled 확인
2. ZCode 재시작
3. `/mcp`로 MCP 서버 연결 상태 확인
4. stderr에 `[LazyZ]` 진단 메시지 확인

### "훅이 작동 안 해요"
1. `node --version` (Node.js 20+ 확인)
2. `ls plugins/lazyz/components/*/dist/cli.js` (dist 존재 확인)
3. `~/.local/share/lazycodex/bootstrap/bootstrap.log` 확인

### "bootstrap이 프로비저닝 안 돼요"
1. F1 수정 반영 확인: `.zcode-plugin/plugin.json` 읽는지
2. `ZCODE_PLUGIN_ROOT` env가 주입되는지
3. bootstrap state: `~/.local/share/lazycodex/bootstrap/state.json`

## 5. 버전 관리

- 단일 버전: `plugin.json`, `package.json`, 모든 `components/*/package.json`이 동일 버전 (sync-version.mjs)
- 버전 동기화: `npm run build` 시 자동 실행
- changelog: README.md 하단 Changelog 섹션
