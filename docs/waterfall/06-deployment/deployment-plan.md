# 배포 계획

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | v1.0 |
| 작성일 | 2026-07-19 |
| 저장소 | https://github.com/younghai/lazyz |
| 버전 | 0.10.2 |

## 1. 배포 아키텍처

```
GitHub (younghai/lazyz)
  │
  ├── marketplace.json (루트)
  └── plugins/lazyz/ (플러그인 본체)
       ├── .zcode-plugin/plugin.json
       ├── hooks/hooks.json
       ├── skills/, commands/, agents/
       ├── components/*/dist/ (prebuilt)
       └── vendor/*/dist/ (prebuilt)
  │
  ▼ (zcode plugin marketplace add)
  │
ZCode 클라이언트
  ├── ~/.zcode/cli/plugins/marketplaces/lazyz/
  ├── ~/.zcode/cli/plugins/data/lazyz@lazyz/
  └── ~/.zcode/agents/ (install-agents.sh로 배포)
```

## 2. 설치 절차

### 자동 설치 (사용자)
```bash
zcode plugin marketplace add https://github.com/younghai/lazyz
zcode plugin add lazyz@lazyz
```

### 수동 설치 (개발자)
1. ZCode → Settings → Plugin Management → Discover → `+`
2. 로컬 디렉토리: `/path/to/lazyz/plugins/lazyz`
3. marketplace `lazyz` 등록
4. `lazyz@lazyz` enabled ON

### 에이전트 배포 (별도)
```bash
sh plugins/lazyz/scripts/install-agents.sh
# 또는 --symlink 모드
```
`~/.zcode/agents/`에 10개 .md 서브에이전트 복사.

## 3. prebuilt dist 정책

- 모든 `components/*/dist/`와 `vendor/*/dist/`는 git에 커밋됨
- 사용자는 Node.js 20+만 있으면 빌드 불필요
- `.gitignore`에서 `!plugins/lazyz/components/*/dist/` 예외로 관리
- CI가 dist 존재를 하드체크 (`Verify hook outputs exist`)

## 4. go/no-go gate

| 조건 | 상태 |
| --- | --- |
| 모든 컴포넌트 빌드 성공 | ✅ GO |
| JSON 매니페스트 유효 | ✅ GO |
| CI boulder 파서 동기화 통과 | ✅ GO |
| ZCode 등록 검증 (스킬/MCP 노출) | ✅ GO |
| 보안 스캔 (CRITICAL/HIGH 0건) | ✅ GO |
| GitHub push 완료 | ✅ GO |

**판정: GO**

## 5. 롤백 절차

1. ZCode → Plugin Management → `lazyz@lazyz` Uninstall
2. ZCode 재시작
3. 이전 버전 재설치 (또는 로컬 디렉토리로 다시 add)
4. `~/.zcode/agents/`의 에이전트는 수동 관리 (install-agents.sh 재실행)

### 주의사항
- boulder.json의 `status: "blocked"`를 구버전이 읽으면 undefined로 처리 → work가 UI에서 안 보임 (silent-stall). AGENTS.md 참조.
- `.omo/` 상태는 플러그인 업데이트/롤백과 무관 (프로젝트 로컬에 유지).
