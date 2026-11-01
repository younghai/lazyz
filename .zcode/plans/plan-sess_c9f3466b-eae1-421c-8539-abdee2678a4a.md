# GitHub Push 플랜 — 새 폴더 + 새 저장소

## 사전 검증 완료
- ✅ 보안: CRITICAL/HIGH 시크릿 0건 (API 키, 토큰, 개인정보 전부 없음)
- ✅ PostHog 키는 의도적 공개 키 (시크릿 아님)
- ✅ 사용자 결정: 새 폴더 / 새 GitHub 저장소 / .zcode 무시 / marketplace.json 포함

---

## Step 1: 새 폴더 생성 + 파일 복사

**위치**: `/Users/young2026/Downloads/personal_project/lazyz-github/`

복사할 것 (git 추적 대상만 선별):
- `plugins/lazyz/` 전체 (플러그인 본체, dist 포함 — 의도적 배포)
- `.agents/plugins/marketplace.json` (마켓플레이스 매니페스트)
- `plugins/lazyz/marketplace.json` (설치 핵심 — source: ".")
- `README.md`, `LICENSE`, `.github/workflows/ci.yml`
- `.gitignore` (정리 후 복사)

**제외** (복사 안 함):
- `node_modules/` 전체
- 루트의 7개 recovery 패키지 (comment-checker-core 등 → vendor와 중복)
- `shared-skills/`
- `.zcode/plans/`
- `.DS_Store`
- `package-lock.json` (bun.lock만 유지)

## Step 2: .gitignore 정리 (새로 작성)

```
node_modules/
**/node_modules/
.DS_Store
*.log
.omo/
.zcode/
.env
.env.*
package-lock.json
**/package-lock.json
shared-skills/
# 루트 recovery 패키지 (vendor와 중복)
comment-checker-core/
lsp-tools-mcp/
model-core/
prompts-core/
rules-engine/
utils/
# prebuilt dist는 예외 (배포 정책)
!plugins/lazyz/components/*/dist/
!plugins/lazyz/vendor/*/dist/
```

## Step 3: marketplace.json 정리

`plugins/lazyz/marketplace.json`을 루트로 복사 + 정리:
```json
{
  "name": "lazyz",
  "plugins": [
    { "name": "lazyz", "source": "./plugins/lazyz" }
  ]
}
```
(공식 zcode-plugins-official 패턴: 루트 marketplace.json이 서브디렉토리 참조)

## Step 4: git init + 첫 커밋

```bash
cd /Users/young2026/Downloads/personal_project/lazyz-github
git init
git add .
git commit -m "feat: LazyZ ZCode plugin initial release (v0.1.1)

- ZCode plugin port of the OmO/LazyCodex harness
- 24 skills, 10 agents, 13 hooks, 5 MCP servers
- Project memory (init-deep), planning (ulw-plan),
  execution (start-work), verified completion (ulw-loop)
- Prebuilt dist for install-and-go
- MIT License"
```

## Step 5: GitHub 저장소 생성 (사용자 조작 필요)

**사용자가 GitHub에서 직접 생성**:
1. https://github.com/new 접속
2. Repository name: `lazyz` (또는 원하는 이름)
3. **Private** 권장 (첫 릴리스 전)
4. "Create repository"
5. 저장소 URL 복사

## Step 6: push (사용자가 URL 알려주면)

```bash
cd /Users/young2026/Downloads/personal_project/lazyz-github
git remote add origin https://github.com/<username>/<repo>.git
git branch -M main
git push -u origin main
```

## Step 7: push 후 보안 재검증

push 완료 후:
- `git ls-files | grep -E "node_modules|\.env|\.omo|\.zcode|package-lock"` → 0건 확인
- marketplace.json, plugin.json, LICENSE 포함 확인
- `.DS_Store` 0건 확인

---

## PM 안전장치
- 복사는 rsync --exclude로 안전하게 (원본 lazyz/ 손대지 않음)
- 새 폴더는 원본과 완전 분리
- push 전 최종 보안 스캔 1회 더 실행
- 기존 code-yeongyu/lazyz.git은 건드리지 않음 (새 저장소이므로)

## 사용자가 해야 할 것
1. Step 1-4: PM이 실행 (새 폴더 + 커밋)
2. **Step 5: 사용자가 GitHub에서 빈 저장소 생성**
3. 저장소 URL을 PM에게 알려줌
4. Step 6-7: PM이 push + 재검증

## 리스크
- GitHub 저장소 이름이 lazyz가 아닌 경우 README 설치 지침과 불일치 → push 후 README 수정 필요
- 새 저장소라 첫 push이므로 이력 충돌 없음 (안전)