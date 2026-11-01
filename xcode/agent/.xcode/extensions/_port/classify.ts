/**
 * Simple classify — P0-CODE-003.
 *
 * 단순 / 복잡 / 위험 3-way. 성공 기준은 정확도 ≥80%.
 *
 * Phase 1 은 휴리스틱 + LLM 두 단계다. 휴리스틱이 확신하면 LLM 을 부르지 않는다 —
 * "README 에 한 줄 추가해줘" 에 추론 모델을 태울 이유가 없다.
 */

import type { CompleteTextResult, ModelRegistry } from "@xcode/ai";
import { completeText, describeParseFailure, extractJsonObject, ProviderError } from "@xcode/ai";

export type Complexity = "simple" | "complex";
export type Risk = "low" | "medium" | "high";
export type Route = "execute" | "research" | "human_gate";

export interface Classification {
  complexity: Complexity;
  risk: Risk;
  route: Route;
  reasons: string[];
  confidence: number;
  source: "heuristic" | "llm";
}

/** 되돌리기 어렵거나 프로덕션에 영향을 주는 신호. 걸리면 사람에게 넘긴다. */
const RISKY = [
  { re: /마이그레이션|migration|schema|스키마/i, why: "스키마 마이그레이션 포함" },
  { re: /\bdrop\b|\btruncate\b|삭제|지워/i, why: "파괴적 작업 가능성" },
  { re: /배포|deploy|release|릴리스|프로덕션|production/i, why: "배포/프로덕션 영향" },
  { re: /인증|auth|권한|permission|secret|토큰|token|비밀번호/i, why: "인증/권한 경로" },
  { re: /api 계약|breaking|호환성|contract/i, why: "공개 계약 변경" },
  { re: /\.env|credential|자격 증명/i, why: "자격 증명 취급" },
];

/** 조사 없이 바로 실행해도 되는 신호. */
const SIMPLE = [
  { re: /오타|typo|주석|comment/i, why: "사소한 텍스트 수정" },
  { re: /README|문서|docs?\b/i, why: "문서 수정" },
  { re: /이름\s*(을)?\s*(바꿔|변경)|rename/i, why: "단순 리네임" },
  { re: /버전\s*(을)?\s*(올려|업)|bump/i, why: "버전 범프" },
];

/** 여러 곳을 건드릴 신호. */
const COMPLEX = [
  { re: /리팩토링|refactor|재설계|restructure/i, why: "구조 변경" },
  { re: /추가해|구현해|만들어|implement|add\s+\w+\s+(endpoint|feature)/i, why: "신규 기능 구현" },
  { re: /테스트.*(추가|작성)|test.*(add|write)/i, why: "테스트 작성 동반" },
  { re: /디버그|원인.*찾|왜.*실패|debug|why.*fail/i, why: "원인 분석 필요" },
  { re: /전체|모든|across|everywhere/i, why: "광범위 변경" },
];

function match(text: string, rules: { re: RegExp; why: string }[]): string[] {
  return rules.filter((r) => r.re.test(text)).map((r) => r.why);
}

export function classifyHeuristic(task: string): Classification | null {
  const riskyReasons = match(task, RISKY);
  const complexReasons = match(task, COMPLEX);
  const simpleReasons = match(task, SIMPLE);

  if (riskyReasons.length > 0) {
    return {
      complexity: complexReasons.length > 0 || riskyReasons.length > 1 ? "complex" : "simple",
      risk: "high",
      route: "human_gate",
      reasons: riskyReasons,
      confidence: Math.min(0.95, 0.7 + riskyReasons.length * 0.1),
      source: "heuristic",
    };
  }

  // 단순 신호만 있고 복잡 신호가 없을 때만 바로 실행으로 보낸다.
  if (simpleReasons.length > 0 && complexReasons.length === 0 && task.length < 160) {
    return {
      complexity: "simple",
      risk: "low",
      route: "execute",
      reasons: simpleReasons,
      confidence: 0.82,
      source: "heuristic",
    };
  }

  if (complexReasons.length >= 2) {
    return {
      complexity: "complex",
      risk: "medium",
      route: "research",
      reasons: complexReasons,
      confidence: 0.78,
      source: "heuristic",
    };
  }

  return null; // 애매하다 — LLM 에게 물어본다
}

const SYSTEM = [
  "코딩 태스크를 분류한다. 정확히 아래 JSON 만 출력한다. 다른 텍스트는 금지.",
  "",
  '{"complexity":"simple|complex","risk":"low|medium|high","reasons":["..."],"confidence":0.0}',
  "",
  "판단 기준:",
  "- simple: 파일 1~2개, 조사 없이 바로 고칠 수 있음",
  "- complex: 여러 파일, 먼저 코드베이스를 읽어야 함",
  "- risk high: 되돌리기 어렵거나(마이그레이션·삭제·배포) 공개 계약/인증을 건드림",
].join("\n");

export async function classifyTask(
  task: string,
  options: { models: ModelRegistry; modelId: string; signal?: AbortSignal },
): Promise<Classification> {
  const heuristic = classifyHeuristic(task);
  if (heuristic) return heuristic;

  const resolved = options.models.resolve(options.modelId);

  let result: CompleteTextResult;
  try {
    result = await completeText({
      provider: resolved.provider,
      spec: resolved.spec,
      system: SYSTEM,
      prompt: task,
      maxTokens: 400,
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    /*
     * 설정 오류(잘못된 모델 id, 만료된 키, 권한 없음)는 폴백하면 안 된다.
     * live 검증에서 실제로 겪은 실패다 — 잘못된 모델 이름으로 400 이 났는데
     * classify 가 조용히 삼키고 진행해서, 정작 원인은 세 단계 뒤에야 드러났다.
     * 재시도해도 안 되는 실패는 여기서 즉시 세운다.
     */
    if (isConfigurationError(error)) throw error;
    return fallback(task, "LLM 분류 실패 — 보수적으로 복잡으로 처리");
  }

  const parsed = extractJsonObject<RawClassification>(result.text);
  if (!parsed) return fallback(task, `분류 응답을 해석하지 못함 — ${describeParseFailure(result)}`);

  const risk: Risk = parsed.risk === "high" ? "high" : parsed.risk === "medium" ? "medium" : "low";
  const complexity: Complexity = parsed.complexity === "simple" ? "simple" : "complex";
  return {
    complexity,
    risk,
    route: risk === "high" ? "human_gate" : complexity === "complex" ? "research" : "execute",
    reasons: parsed.reasons ?? [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
    source: "llm",
  };
}

/**
 * 재시도해도 소용없는 실패인가.
 *
 * 429(rate limit)와 5xx 는 일시적이므로 폴백해도 된다.
 * 그 외 4xx 는 사람이 설정을 고쳐야 하는 실패다 — 삼키면 원인이 묻힌다.
 */
export function isConfigurationError(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  if (error.status === undefined) return false;
  if (error.status === 429 || error.status >= 500) return false;
  return error.status >= 400;
}

/** 애매하면 복잡·조사 경로로 보낸다. 과소평가가 과대평가보다 비싸다. */
function fallback(_task: string, why: string): Classification {
  return {
    complexity: "complex",
    risk: "medium",
    route: "research",
    reasons: [why],
    confidence: 0.4,
    source: "heuristic",
  };
}

interface RawClassification {
  complexity?: string;
  risk?: string;
  reasons?: string[];
  confidence?: number;
}
