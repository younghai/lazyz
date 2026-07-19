# 장애 대응 런북

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |

## 1. 장애 모드 카탈로그

### F1: bootstrap 영구 no-op (해결됨)
- **원인**: `.codex-plugin/plugin.json`만 읽음 (lazyz는 `.zcode-plugin/`)
- **해결**: `.zcode-plugin` 우선 + `.codex-plugin` 폴백 + `ZCODE_PLUGIN_ROOT` env (commit `e3593a8`)
- **상태**: ✅ 해결

### F2: Node.js 없음
- **현상**: 모든 훅 exit 0, stderr 3줄 진단
- **대응**: `node --version` 확인 → 20+ 설치 → ZCode 재시작
- **사용자 인지**: stderr 가시성에 의존

### F3: dist 없음
- **현상**: 훅 exit 0, stderr "Run the build..."
- **대응**: prebuilt dist 정책이므로 git clone 후 `npm install` 안 한 경우만 발생
- **대응**: `cd plugins/lazyz && npm install && npm run build`

### F4: vendor/omo-codex 삭제
- **현상**: bootstrap setup 실패 → degraded entry 기록, exit 0
- **대응**: git checkout으로 복원

### F5: 다중 세션 `.lazyz-prompts.json` 레이스 (해결됨)
- **원인**: 직접 writeFileSync (read-modify-write)
- **해결**: temp+rename 원자적 쓰기 (commit `e3593a8`)
- **상태**: ✅ 해결

### F6: Stop continuation 무한 루프
- **현상**: 카운터가 MAX(10) 도달 시 조용히 중단 (return "")
- **대응**: `LAZYZ_START_WORK_MAX_CONTINUATIONS`로 조정

### F7: boulder.json 파서 drift
- **현상**: 두 파서가 다른 status 해석 → work가 UI에서 안 보임
- **대응**: CI `Verify boulder parser sync`가 사전 차단
- **수동 대응**: 두 파일 diff 확인, 수동 동기화

## 2. 장애 대응 절차

### "스킬이 발동 안 해요"
1. ZCode Settings → Plugin Management → lazyz enabled 확인
2. `/` 메뉴에 lazyz:* 스킬이 보이는지 확인
3. `/mcp`로 MCP 연결 상태 확인
4. stderr `[LazyZ]` 진단 메시지 확인
5. `node --version` (20+ 확인)

### "start-work가 자동 재개 안 해요"
1. `.omo/boulder.json` 존재 + `status: "active"` 확인
2. `session_ids`에 현재 세션 ID 포함 확인
3. `.omo/start-work-continuation/<session>.json` 카운터가 MAX(10) 미만인지
4. transcript에 context pressure 마커 없는지

### "에이전트가 Agent tool에 안 떠요"
1. `sh plugins/lazyz/scripts/install-agents.sh` 실행
2. `~/.zcode/agents/*.md` 10개 존재 확인
3. ZCode 재시작

## 3. 포스트모템 절차

1. `.omo/*/ledger.jsonl`에서 장애 시점 이벤트 확인
2. `~/.local/share/lazycodex/bootstrap/bootstrap.log` 확인
3. stderr 진단 메시지 수집
4. 원인 식별 → known-limitations.md 갱신
5. 재발 방지 조치 → 코드/문서/CI 반영
