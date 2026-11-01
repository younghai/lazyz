/**
 * Working Memory — P1-AGENT-001.
 *
 * 덧붙이는 게 아니라 매 리비전 **다시 쓴다**.
 *
 * 안전장치는 checksum 동일성이 아니라 **보호 필드 단조성**이다.
 * decisions[] 는 자라기 때문에 단순 checksum 은 성립하지 않는다.
 * (프로토타입 authoring 에서 확정 — xcode/prototype/README.md 참고)
 */

export interface WmDecision {
  id: string;
  text: string;
  rationale?: string;
}

export interface WmFailure {
  id: string;
  attempt: number;
  what: string;
  whyFailed: string;
  evidence?: string;
}

export interface WmStep {
  id: string;
  text: string;
  done?: boolean;
}

export interface WmQuestion {
  id: string;
  text: string;
  resolvedBy?: string;
  promotedTo?: string;
}

export interface WorkingMemory {
  rev: number;
  source: "agent" | "user" | "compaction_agent";
  goal: string;
  decisions: WmDecision[];
  modifiedFiles: { path: string; status: "created" | "modified" }[];
  failedAttempts: WmFailure[];
  nextSteps: WmStep[];
  openQuestions: WmQuestion[];
  references: string[];
}

export const PROTECTED_FIELDS = ["goal", "decisions", "failedAttempts"] as const;

export function emptyWorkingMemory(goal: string): WorkingMemory {
  return {
    rev: 0,
    source: "agent",
    goal,
    decisions: [],
    modifiedFiles: [],
    failedAttempts: [],
    nextSteps: [],
    openQuestions: [],
    references: [],
  };
}

export interface GuardResult {
  ok: boolean;
  dropped: { field: string; id: string; text: string }[];
  carried: { decisions: number; failedAttempts: number; goal: boolean };
}

/**
 * 보호 필드는 늘어날 수는 있어도 id 를 잃으면 안 된다.
 * 승격된 open question 은 손실이 아니다 — decisions 로 옮겨간 것이므로.
 */
export function guardWorkingMemory(
  before: WorkingMemory | null,
  after: WorkingMemory,
): GuardResult {
  const dropped: GuardResult["dropped"] = [];

  if (before) {
    if (before.goal && before.goal !== after.goal) {
      dropped.push({ field: "goal", id: "goal", text: before.goal });
    }
    const decisionIds = new Set(after.decisions.map((d) => d.id));
    for (const d of before.decisions) {
      if (!decisionIds.has(d.id)) dropped.push({ field: "decisions", id: d.id, text: d.text });
    }
    const failureIds = new Set(after.failedAttempts.map((f) => f.id));
    for (const f of before.failedAttempts) {
      if (!failureIds.has(f.id)) dropped.push({ field: "failedAttempts", id: f.id, text: f.what });
    }
  }

  return {
    ok: dropped.length === 0,
    dropped,
    carried: {
      decisions: after.decisions.length,
      failedAttempts: after.failedAttempts.length,
      goal: Boolean(after.goal),
    },
  };
}

export interface ReconcileResult {
  wm: WorkingMemory;
  guard: GuardResult;
  /** 되살린 항목 수. 0 이 아니면 새 리비전이 무언가를 잃을 뻔했다는 뜻이다. */
  restored: number;
}

/**
 * 가드가 손실을 발견하면 **보고만 하고 끝내지 않는다 — 되살린다.**
 *
 * 검출만 하는 가드는 실제로는 아무것도 지키지 못한다. 리비전을 쓰는 주체가
 * 에이전트든 컴팩션 에이전트든, 잃어버린 결정은 다음 리비전에서도 잃어버린 채로
 * 남고 경고만 쌓인다.
 *
 * 목표가 바뀐 경우는 손실이 아니라 **변경**이다. 새 목표를 채택하되 이전 목표를
 * decisions 에 기록으로 남긴다 — 그래야 "왜 방향이 바뀌었나"를 나중에 답할 수 있다.
 */
export function reconcileWorkingMemory(
  before: WorkingMemory | null,
  after: WorkingMemory,
): ReconcileResult {
  const guard = guardWorkingMemory(before, after);
  if (!before || guard.ok) return { wm: after, guard, restored: 0 };

  const wm: WorkingMemory = { ...after };
  let restored = 0;

  if (!wm.goal && before.goal) {
    wm.goal = before.goal;
    restored++;
  }

  const carriedDecisions: WmDecision[] = [];
  if (before.goal && wm.goal && before.goal !== wm.goal) {
    carriedDecisions.push({
      id: `goal_rev_${before.rev}`,
      text: `목표 변경: ${before.goal}`,
      rationale: `rev${before.rev} 의 목표를 기록으로 남긴다`,
    });
    restored++;
  }

  const seenDecisions = new Set(after.decisions.map((d) => d.id));
  for (const d of before.decisions) {
    if (!seenDecisions.has(d.id)) {
      carriedDecisions.push(d);
      restored++;
    }
  }
  if (carriedDecisions.length) wm.decisions = [...carriedDecisions, ...after.decisions];

  const seenFailures = new Set(after.failedAttempts.map((f) => f.id));
  const carriedFailures = before.failedAttempts.filter((f) => !seenFailures.has(f.id));
  if (carriedFailures.length) {
    wm.failedAttempts = [...carriedFailures, ...after.failedAttempts];
    restored += carriedFailures.length;
  }

  return { wm, guard, restored };
}

/* --- 컴팩션 요약 → 워킹 메모리 승격 ------------------------------------- */

/** 같은 문장은 같은 id 를 갖는다 — 컴팩션이 두 번 돌아도 결정이 중복되지 않는다. */
function stableId(prefix: string, text: string): string {
  let hash = 0x811c9dc5;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}_${hash.toString(16).padStart(8, "0")}`;
}

function sectionLines(summary: string, heading: string): string[] {
  const lines = summary.split("\n");
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase(),
  );
  if (start === -1) return [];

  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trimStart().startsWith("## ")) break;
    const text = line.replace(/^\s*[-*·]\s*/, "").trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * 컴팩션 에이전트가 쓴 요약에서 결정과 다음 단계를 끌어올린다.
 *
 * 요약 프롬프트는 이미 "미해결 질문이 해소됐다면 Key Decisions 로 승격하라"고 지시한다.
 * 그런데 그 결과가 산문 안에만 남으면 **다음 컴팩션에서 다시 지워질 수 있다** —
 * 보호되는 것은 워킹 메모리의 decisions 뿐이기 때문이다.
 * 그래서 요약을 구조로 되돌려 놓는다. 이 함수가 프로토타입의 rev3 → rev4 다.
 *
 * LLM 을 한 번 더 부르지 않는다. 요약 한 번으로 산문과 구조를 동시에 얻는다.
 */
export function promoteFromSummary(before: WorkingMemory, summary: string): WorkingMemory {
  const known = new Set(before.decisions.map((d) => d.id));
  const promoted: WmDecision[] = [];

  for (const text of sectionLines(summary, "Key Decisions")) {
    const id = stableId("d", text);
    if (known.has(id)) continue;
    known.add(id);
    promoted.push({ id, text, rationale: "컴팩션 요약에서 승격" });
  }

  const decisions = [...before.decisions, ...promoted];

  // 질문이 결정 안에서 답을 얻었다면 그 사실을 남긴다. 못 찾으면 질문은 그대로 열려 있다.
  const openQuestions = before.openQuestions.map((q) => {
    if (q.promotedTo) return q;
    const needle = q.text.trim().toLowerCase().slice(0, 12);
    if (needle.length < 6) return q;
    const hit = promoted.find((d) => d.text.toLowerCase().includes(needle));
    return hit ? { ...q, promotedTo: hit.id } : q;
  });

  const nextSteps = sectionLines(summary, "Next Steps").map((text) => ({
    id: stableId("s", text),
    text,
  }));

  return {
    ...before,
    rev: before.rev + 1,
    source: "compaction_agent",
    decisions,
    openQuestions,
    nextSteps: nextSteps.length ? nextSteps : before.nextSteps,
  };
}

/** 시스템 프롬프트에 붙일 형태. 컴팩션이 무엇을 지웠든 이건 남는다. */
export function renderWorkingMemory(wm: WorkingMemory): string {
  const lines: string[] = ["<working_memory>", `## Goal`, wm.goal];

  if (wm.decisions.length) {
    lines.push("", "## Key Decisions");
    for (const d of wm.decisions) {
      lines.push(`- ${d.text}${d.rationale ? ` (${d.rationale})` : ""}`);
    }
  }
  if (wm.failedAttempts.length) {
    lines.push("", "## Failed Attempts (반복하지 말 것)");
    for (const f of wm.failedAttempts) {
      lines.push(`- 시도 ${f.attempt}: ${f.what} → ${f.whyFailed}`);
      if (f.evidence) lines.push(`  근거: ${f.evidence}`);
    }
  }
  if (wm.modifiedFiles.length) {
    lines.push("", "## Modified Files");
    for (const f of wm.modifiedFiles) lines.push(`- ${f.path} (${f.status})`);
  }
  const pending = wm.nextSteps.filter((s) => !s.done);
  if (pending.length) {
    lines.push("", "## Next Steps");
    for (const s of pending) lines.push(`- ${s.text}`);
  }
  if (wm.openQuestions.length) {
    lines.push("", "## Open Questions");
    for (const q of wm.openQuestions) lines.push(`- ${q.text}`);
  }

  lines.push("</working_memory>");
  return lines.join("\n");
}
