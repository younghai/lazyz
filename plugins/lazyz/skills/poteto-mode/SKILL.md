---
name: poteto-mode
description: "pstack/poteto 방식의 과업 라우팅 진입점 — 요청을 플레이북 하나로 대응하고 그 단계를 todo 앞에 복사한 뒤 lazyz 형제 스킬로 위임한다. '/poteto-mode', 'poteto mode', '포테토 모드', 'pstack 방식으로 라우팅해줘' 같은 **명시적 호출에만** 활성화한다. 규율(바꿀 수 없는 규칙·원칙)은 lazyz의 hephaestus 규칙이 소유하고, 이 스킬은 진입점·라우터 역할만 한다."
---

# Poteto Mode (진입점 라우터)

**규율은 lazyz의 hephaestus 규칙이 소유한다.** 이 스킬은 과업을 플레이북으로 대응시키는 라우터다. 두 체계가 같이 켜져 있으면: hephaestus의 바꿀 수 없는 규칙 > 이 스킬의 라우팅. 측정·증명·보고 규칙은 hephaestus의 검증 원칙(실행으로 증명, 증거 없는 완료 없음)을 따른다.

출처: cursor/plugins pstack v0.15.36 (MIT, poteto)의 poteto-mode를 lazyz(ZCode, hephaestus 규칙 기반)에 맞게 적응. #986의 코어 강화(목표 재진술, 측정 전 숫자 규칙 선적용) 반영. 규율 참조를 vibe-mode에서 hephaestus로 재지정했고, 형제 스킬 위임은 lazyz가 실제로 제공하는 스킬·에이전트로 재매핑했다.

## 진입 절차

1. **첫 대답에 사용자 목표를 한 문장으로 재진술한다.** 브리핑·PR·최종 보고에도 같은 문장이 처음에 온다. 작업이 길어질수록 이 문장이 방향을 지킨다.
2. 요청을 아래 라우팅 표의 플레이북 하나로 대응시킨다. 측정이 포함된 과업은 **실행 전에** `benchmark-checklist` 스킬의 "배포할 문장 먼저 쓰기"를 지난다.
3. 해당 플레이북의 단계를 **todo 목록 앞에 그대로 복사**한다(`TodoWrite`). 하지 않기로 한 단계도 `건너뜀: <이유>`와 함께 남긴다.
4. 맞는 플레이북이 없으면 직접 만든다 — (1) 검사 가능한 완료 조건, (2) 단계마다 확인 가능한 상태, (3) 실패 시 멈추는 지점. 이 세 가지를 갖추고 hephaestus 규칙 안에서 진행한다.

## 플레이북 라우팅

정본 위치: 이 스킬의 `references/playbooks.md` (14종). 그곳의 단계를 우선 사용한다.

| 요청 모양 | 플레이북 / lazyz 대응 |
|---|---|
| 읽기 전용 질문 — "어떻게 돼?", "왜 이렇게?", "확실해?" | investigation (`how`·`why` 스킬 + `lazyz:explorer`·`librarian` 연계) |
| 보고된 결함 — 재현→원인→수정→검증 | bug-fix (`debugging` 스킬) |
| 새 동작·동작 변경 | feature (`ulw-plan`으로 계획 → 승인 후 `ulw-execute`) |
| 구조·모양 바꾸기, 행동 보존 | refactoring (`refactor` 스킬) |
| 측정된 느림 | perf-issue (`benchmark-checklist`로 수치 검증) |
| 한 지표의 지속 개선 | hillclimb (`ulw-loop`) |
| 갈림길을 관찰로 정하기 | prototype (2~3안을 병렬 `Agent` 스폰으로 시제) |
| 실행 중 증상 계측 진단 | runtime-forensics (`debugging` 스킬) |
| 캡처된 아티팩트 진단 | trace-forensics (`debugging` 스킬) |
| 픽셀 일치 이관 | visual-parity (`visual-qa` 스킬) |
| 여러 단계·PR에 걸친 계획 | multi-phase-plan (`ulw-plan` → 체크박스 계획) |
| 커밋·PR 작성 (명시 요청 시만) | pr-briefing (`git-master` 스킬) |
| 오버나이트·자율 실행 | overnight (`ulw-loop` 병행, 단계마다 명시적 승인) |
| 멈추고 이어받기 | pause-safely / session-pickup (`coding-agent-sessions` 스킬) |
| 코드 리뷰 — diff·PR·커밋 검사, 줄 단위 소견과 커버리지 | `lazyz:lazycodex-code-reviewer` 서브에이전트 |

**비활성화 업스트림 플레이북** — babysit, shipping, orchestrate(agentic), autopilot-full/stack, eval. PR 병합·장기 운영 자동화라서 요청이 있어도 각 단계마다 명시적 승인을 받는다.

## 형제 스킬 위임 (lazyz가 제공하는 것만)

단계가 필요로 하면 부르고, 결과만 메인에 남긴다(guard-the-context-window): `review-work`(다각 검토), `debugging`(가설 주도 조사), `refactor`, `benchmark-checklist`(수치 검증), `blast-radius`(변경 영향·안전 사실 증명), `how`·`why`(실행 동작 해부·설계 의도 조사), `visual-qa`, `git-master`, `coding-agent-sessions`, `remove-ai-slops`. 원본 pstack의 나머지 형제 스킬(arena, interrogate, correct, ketchup, recall, unslop, sharpen, retro, reflect, decision-log)은 lazyz 배포물에 없다 — 전역 스택(`~/.agents/skills/`)에 있으면 쓰고, 없으면 이 라우터가 직접 수행한다.

## 이 환경의 도구 규칙

- 서브에이전트는 ZCode `Agent` 도구 — 자기완결 `prompt`(원래 요청, 제약, 산출물 형식 포함). 모델 라우팅 없음: 세션 모델을 상속한다(`model: inherit`).
- todo는 `TodoWrite`. 플레이북 단계를 그대로 옮긴 뒤 진행한다.
- Cursor 전용 도구(control-ui/cli, /loop, Task environment:cloud)는 쓰지 않는다. UI 검증은 browser-use:web-gui-tester 또는 `visual-qa`.
