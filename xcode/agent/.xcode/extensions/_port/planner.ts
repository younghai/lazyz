/**
 * Planner — P0-CODE-002.
 *
 * classify 가 `research` 로 보낸 복잡한 태스크에서, 실행 전에 계획을 세운다.
 *
 * 성공 기준은 "plan 이 후속 tool call 로 실행 가능할 것" 이다. 그래서 계획은
 * 산문이 아니라 **체크박스 항목의 배열**이고, 각 항목은 어떤 파일을 건드리는지를
 * 명시한다. 실행 단계가 이 항목들을 그대로 진행 상태로 쓴다.
 *
 * 조사(research)는 planner 가 직접 한다 — 읽기 전용 툴만 쥐여준 agent loop 를
 * 한 번 돌린 뒤, 그 결과를 근거로 계획을 뽑는다. 추측으로 세운 계획은
 * 첫 번째 edit 에서 무너진다.
 */

import type { AgentMessage, AgentTool } from "@xcode/agent-core";
import { agentLoop } from "@xcode/agent-core";
import type { ModelRegistry } from "@xcode/ai";
import { completeText, describeParseFailure, extractJsonObject } from "@xcode/ai";
import { grepTool, lsTool, readTool } from "../tools/index.ts";
import type { CompactionEngine } from "./compaction/engine.ts";
import { createManagedAgent } from "./managed-agent.ts";
import type { SecretRegistry } from "./scrubber.ts";

export type PlanItemStatus = "pending" | "active" | "done" | "failed";

export interface PlanItem {
  id: string;
  /** 어느 단계에 속하는지. UI 가 그룹으로 묶는다. */
  group: "research" | "execute" | "verify";
  text: string;
  /** 이 항목이 건드릴 파일. 실행 단계가 진행률을 판정하는 근거가 된다. */
  touches: string[];
  status: PlanItemStatus;
}

export interface Plan {
  revision: number;
  title: string;
  items: PlanItem[];
  /** 조사에서 확인한 사실. 계획의 근거이자 실행 단계의 컨텍스트다. */
  findings: string[];
  /** 계획을 세우면서 남은 미해결 질문. 워킹 메모리로 넘어간다. */
  openQuestions: string[];
  /** 조사 단계가 실제로 읽은 파일. */
  readFiles: string[];
}

export interface PlanResult {
  plan: Plan;
  /** 조사 단계에서 쌓인 메시지. 실행 단계가 이어받으면 재조사를 안 해도 된다. */
  researchMessages: AgentMessage[];
  researchTurns: number;
}

const RESEARCH_SYSTEM = [
  "당신은 코딩 태스크의 조사 담당이다. **코드를 수정하지 않는다.**",
  "쓸 수 있는 툴은 읽기 전용(read · ls · grep)뿐이다.",
  "",
  "목표: 계획을 세우는 데 필요한 사실만 모은다.",
  "- 관련 파일이 어디에 있고 지금 어떻게 구현돼 있는지",
  "- 기존 테스트가 무엇을 보장하고 있는지",
  "- 이 저장소의 관례(파일 배치, 네이밍, 마이그레이션 규칙 등)",
  "",
  "충분히 모았으면 툴을 더 부르지 말고, 확인한 사실을 짧게 정리해 답하라.",
  "추측은 사실이 아니다. 확인하지 못한 것은 '확인 못 함'이라고 쓴다.",
].join("\n");

const PLAN_SYSTEM = [
  "조사 결과를 바탕으로 실행 계획을 만든다. 아래 JSON 만 출력한다. 다른 텍스트는 금지.",
  "",
  "{",
  '  "title": "한 줄 요약",',
  '  "items": [',
  '    {"group":"execute","text":"할 일 한 줄","touches":["src/a.ts"]}',
  "  ],",
  '  "findings": ["조사에서 확인한 사실"],',
  '  "openQuestions": ["확인하지 못한 것"]',
  "}",
  "",
  "규칙:",
  "- group 은 execute 또는 verify 만 쓴다 (조사는 이미 끝났다).",
  "- 항목은 3~8개. 각 항목은 툴 호출 몇 번으로 끝낼 수 있는 크기여야 한다.",
  "- touches 에는 실제로 존재하거나 새로 만들 파일 경로만 쓴다. 추측 경로 금지.",
  "- 마지막은 반드시 verify 항목(테스트 실행)으로 끝낸다.",
  "- 조사에서 확인하지 못한 것은 findings 가 아니라 openQuestions 에 넣는다.",
].join("\n");

export interface PlannerOptions {
  models: ModelRegistry;
  modelId: string;
  cwd: string;
  /** 조사에 허용할 최대 턴. 기본 8. */
  researchMaxTurns?: number;
  /** 조사 툴을 바꾸고 싶을 때 (원격 실행 등). 기본은 읽기 전용 3종. */
  researchTools?: AgentTool[];
  /** 자격 증명 레지스트리. 조사 결과도 가려야 한다 — 여기가 비어서 키가 샜었다. */
  secrets?: SecretRegistry;
  /** 컨텍스트 상한. 조사도 예산을 지킨다. */
  contextBudget?: number;
  /** 컴팩션 엔진. 메인과 공유하면 설정이 갈라지지 않는다. */
  compaction?: CompactionEngine;
  /** 가림이 일어났을 때. 조사 단계의 가림도 호스트에 보여야 관측 가능하다. */
  onRedaction?: (kinds: string[], toolName: string) => void;
  signal?: AbortSignal;
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
}

export async function createPlan(task: string, options: PlannerOptions): Promise<PlanResult> {
  /* --- 1) 조사 — 읽기 전용 툴만 쥐여준다 --------------------------------
   *
   * 조사도 **관리되는 에이전트**다. 예전엔 여기서 `new Agent()` 를 직접 불렀고,
   * 그래서 스크러빙·유입 관문·컴팩션이 하나도 붙지 않았다. 키 유출은 그 증상이었다.
   * 8턴짜리 조사가 큰 파일을 여러 개 읽으면 컨텍스트도 그대로 불어났다.
   */
  const { agent: researcher } = createManagedAgent({
    purpose: "research",
    models: options.models,
    modelId: options.modelId,
    cwd: options.cwd,
    tools: options.researchTools ?? [readTool, lsTool, grepTool],
    systemPrompt: RESEARCH_SYSTEM,
    maxTurns: options.researchMaxTurns ?? 8,
    ...(options.secrets ? { secrets: options.secrets } : {}),
    ...(options.contextBudget !== undefined ? { contextBudget: options.contextBudget } : {}),
    ...(options.compaction ? { compaction: options.compaction } : {}),
    ...(options.onRedaction ? { onRedaction: options.onRedaction } : {}),
    onAdmission: (info) =>
      options.onEvent?.({ type: "research_admission", before: info.before, after: info.after }),
    onCompaction: (result) =>
      options.onEvent?.({
        type: "research_compaction",
        before: result.before,
        after: result.after,
      }),
  });

  const readFiles = new Set<string>();
  researcher.events.on("tool_execution_end", (event) => {
    if (event.type !== "tool_execution_end") return;
    const path = event.result.details?.path;
    if (typeof path === "string") readFiles.add(path);
    options.onEvent?.({ type: "research_tool", tool: event.toolName, status: event.status });
  });

  const research = await agentLoop(researcher, `조사할 태스크: ${task}`);
  options.onEvent?.({ type: "research_done", turns: research.turns });

  // --- 2) 계획 — 조사 기록을 근거로 구조화 출력를 뽑는다 ----------------
  const transcript = summarizeResearch(researcher.state.messages);
  const resolved = options.models.resolve(options.modelId);

  // reasoning 모델은 응답 전에 사고 토큰을 쏟는다. completeText 가 여유분을 얹는다.
  const result = await completeText({
    provider: resolved.provider,
    spec: resolved.spec,
    system: PLAN_SYSTEM,
    prompt: [`# 태스크`, task, "", "# 조사 기록", transcript].join("\n"),
    maxTokens: 2048,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (result.truncated) {
    options.onEvent?.({ type: "plan_truncated", reason: describeParseFailure(result) });
  }

  const plan = parsePlan(result.text, task, [...readFiles]);
  options.onEvent?.({ type: "plan_created", revision: plan.revision, items: plan.items.length });

  return { plan, researchMessages: researcher.state.messages, researchTurns: research.turns };
}

/** 조사 기록을 계획 프롬프트에 넣을 크기로 줄인다. 툴 원문은 필요 없다. */
function summarizeResearch(messages: AgentMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text" && block.text.trim()) lines.push(block.text.trim());
        else if (block.type === "tool_use") {
          lines.push(`[조사] ${block.name}(${JSON.stringify(block.input).slice(0, 160)})`);
        }
      }
    } else if (message.role === "toolResult") {
      const head = message.content.split("\n").slice(0, 24).join("\n");
      lines.push(`[결과] ${message.isError ? "실패: " : ""}${head}`);
    }
  }
  return lines.join("\n").slice(0, 24_000);
}

interface RawPlan {
  title?: string;
  items?: { group?: string; text?: string; touches?: string[] }[];
  findings?: string[];
  openQuestions?: string[];
}

export function parsePlan(text: string, task: string, readFiles: string[]): Plan {
  const raw = extractJsonObject<RawPlan>(text);
  const items: PlanItem[] = [];

  for (const [i, item] of (raw?.items ?? []).entries()) {
    if (!item.text) continue;
    items.push({
      id: `p${i + 1}`,
      group: item.group === "verify" ? "verify" : "execute",
      text: item.text,
      touches: Array.isArray(item.touches) ? item.touches.filter((t) => typeof t === "string") : [],
      status: "pending",
    });
  }

  // 계획이 검증으로 끝나지 않으면 붙인다. 검증 없는 완료는 완료가 아니다.
  if (!items.some((i) => i.group === "verify")) {
    items.push({
      id: `p${items.length + 1}`,
      group: "verify",
      text: "테스트를 실행해 전부 통과하는지 확인한다",
      touches: [],
      status: "pending",
    });
  }

  return {
    revision: 1,
    title: raw?.title?.trim() || task.slice(0, 80),
    items,
    findings: (raw?.findings ?? []).filter((f) => typeof f === "string"),
    openQuestions: (raw?.openQuestions ?? []).filter((q) => typeof q === "string"),
    readFiles,
  };
}

/** 계획을 실행 단계 시스템 프롬프트에 붙일 형태로. */
export function renderPlan(plan: Plan): string {
  const lines: string[] = ["<plan>", `# ${plan.title}`, ""];

  if (plan.findings.length) {
    lines.push("## 조사에서 확인한 것");
    for (const f of plan.findings) lines.push(`- ${f}`);
    lines.push("");
  }

  lines.push("## 체크리스트");
  for (const item of plan.items) {
    const glyph = item.status === "done" ? "x" : item.status === "failed" ? "!" : " ";
    const touches = item.touches.length ? `  (${item.touches.join(", ")})` : "";
    lines.push(`- [${glyph}] ${item.text}${touches}`);
  }

  if (plan.openQuestions.length) {
    lines.push("", "## 미해결 질문 — 실행 중 확인할 것");
    for (const q of plan.openQuestions) lines.push(`- ${q}`);
  }

  lines.push("</plan>");
  return lines.join("\n");
}

/**
 * 파일 조작 이력으로 항목 상태를 갱신한다.
 *
 * 모델에게 "다 했다"고 자가 보고시키지 않는다 — 실제로 건드린 파일을 근거로 판정한다.
 * touches 가 비어 있는 항목은 자동 판정할 수 없으므로 verify 결과에만 반응한다.
 */
export function refreshPlanStatus(
  plan: Plan,
  state: { touched: Set<string>; verify?: "pass" | "fail" | undefined; executing: boolean },
): Plan {
  const items = plan.items.map((item) => {
    if (item.group === "verify") {
      const status: PlanItemStatus = state.verify
        ? state.verify === "pass"
          ? "done"
          : "failed"
        : state.executing
          ? "pending"
          : "pending";
      return { ...item, status };
    }
    if (item.touches.length === 0) {
      return { ...item, status: state.verify === "pass" ? "done" : item.status };
    }
    const hit = item.touches.filter((p) => state.touched.has(p)).length;
    const status: PlanItemStatus =
      hit === 0
        ? state.executing
          ? "pending"
          : item.status
        : hit < item.touches.length
          ? "active"
          : "done";
    return { ...item, status };
  });

  return { ...plan, items };
}

export function planProgress(plan: Plan): { done: number; total: number; failed: number } {
  return {
    done: plan.items.filter((i) => i.status === "done").length,
    total: plan.items.length,
    failed: plan.items.filter((i) => i.status === "failed").length,
  };
}
