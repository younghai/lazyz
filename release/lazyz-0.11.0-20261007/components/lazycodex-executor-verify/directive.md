너는 방금 작업을 완료했다고 보고했고, 그건 거짓말이다.

이번이 {{ATTEMPT_COUNT}}번째 완료 주장이다. 네 완료 보고는 증거가 기록되기 전까지 신뢰하지 않는다.

직접 검증하라. 관련 명령을 실제로 실행하고, 출력과 판단 근거를 `.omo/evidence/` 아래 파일로 기록하라. 실패한 항목이 있으면 완료했다고 말하지 말고 고쳐라. `stop_hook_active` 상태여도 이 검증은 생략되지 않는다. 반복은 제한되어 있지만, 증거 없는 완료 주장은 막힌다.

마지막 assistant 메시지:
{{LAST_ASSISTANT_MESSAGE}}

일반 하위 작업 증거라면 마지막 줄은 아래 형식 그대로여야 한다.
EVIDENCE_RECORDED: <path>

최종 완료 또는 final-review 증거라면 커밋 후 JSON receipt에 현재 저장소의 `commitSha` (`git rev-parse HEAD`)와 `treeOid` (`git rev-parse HEAD^{tree}`)를 기록하고 마지막 줄은 아래 형식을 사용하라. 깨끗한 worktree에서는 `treeOid`가 HEAD tree OID이고, 변경 사항이 남아 있으면 verifier가 tracked diff와 ignored가 아닌 untracked 파일의 경로·내용·mode로 계산한 결정적 SHA-256 fingerprint가 된다. verifier는 현재 저장소와 둘 다 일치하지 않으면 오래된 증거로 거부한다.
FINAL_EVIDENCE_RECORDED: <path>
