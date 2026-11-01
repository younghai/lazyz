/**
 * Secret scrubber — P1-CODE-001.
 *
 * Phase 1 완료 기준 중 유일하게 0 을 요구하는 항목이다: **secret 노출 0건.**
 *
 * 두 곳에서 샌다.
 *   · 툴 출력 — `cat .env`, `env`, `git config --list` 같은 명령
 *   · 세션 JSONL — 그 출력이 그대로 디스크에 남는다
 *
 * 그래서 스크러빙은 **툴 결과가 컨텍스트에 들어가기 전에** 한다.
 * 로그 출력 직전에 하면 이미 세션 파일에 원문이 쓰인 뒤다.
 *
 * 오탐(정상 문자열을 가림)은 감수한다. 미탐(키가 새어나감)이 훨씬 비싸다.
 */

import type { AgentTool, ToolContext } from "@xcode/agent-core";

export interface ScrubMatch {
  kind: string;
  /** 원문은 절대 담지 않는다. 진단은 종류와 위치까지만. */
  index: number;
  length: number;
}

export interface ScrubResult {
  text: string;
  matches: ScrubMatch[];
}

interface Rule {
  kind: string;
  re: RegExp;
  /** 매치 전체가 아니라 이 캡처 그룹만 가린다 (키 이름은 남겨야 읽을 수 있다). */
  group?: number;
  /** 값이 이 패턴에 걸리면 시크릿이 아니라고 본다. 코드 오탐을 막는 자리. */
  skipValue?: RegExp;
}

/*
 * 두 갈래로 잡는다.
 *  1) 형태가 뚜렷한 토큰 — 접두사로 특정된다. 오탐이 거의 없다.
 *  2) 대입문 — `KEY=value`, `"token": "value"`. 이름으로 판단한다.
 */
const RULES: Rule[] = [
  // --- 뚜렷한 형태 ---------------------------------------------------------
  { kind: "openai", re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { kind: "anthropic", re: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { kind: "github", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: "gitlab", re: /\bglpat-[A-Za-z0-9_-]{16,}/g },
  { kind: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "google", re: /\bAIza[A-Za-z0-9_-]{30,}/g },
  { kind: "aws-access-key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { kind: "stripe", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  {
    kind: "private-key",
    re: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: "bearer", re: /\b(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{16,})/gi, group: 1 },

  /* --- 이름으로 판단 -------------------------------------------------------
   * KEY=value / KEY: value (셸 · dotenv · yaml)
   *
   * **값이 코드처럼 생겼으면 가리지 않는다.** dogfooding 에서 이 규칙이
   * `contextTokens: currentContextTokens(agent)` 를 가려버렸다 — 이름에 TOKEN 이
   * 들어 있다는 이유로. 에이전트는 가려진 텍스트를 그대로 oldText 로 써서 edit 가 실패했고,
   * 더 나쁘게는 **코드에 대한 인식 자체가 틀어졌다.**
   *
   * `tokenCount` · `accessKeyId` · `refreshToken` 을 쓰는 모든 코드베이스에서 성립한다.
   * 그래서 값에 코드 문자(괄호·연산자·점)가 있으면 시크릿이 아니라고 본다.
   * 미탐이 조금 늘더라도, 코드를 망가뜨리는 오탐이 훨씬 비싸다 —
   * 진짜 자격 증명은 접두사 규칙(sk- · ghp_ · AKIA…)이 이미 잡는다.
   */
  {
    kind: "assignment",
    re: /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL)[A-Za-z0-9_]*)\s*[=:]\s*["']?([^\s"'&,;]{8,})/gi,
    group: 2,
    // 함수 호출 · 프로퍼티 접근 · 연산자가 보이면 코드다.
    skipValue: /[()[\]{}<>]|=>|\.\w|\+\+|`/,
  },
  // "token": "value" (JSON)
  {
    kind: "json-field",
    re: /"([A-Za-z0-9_]*(?:secret|password|token|api[_-]?key|access[_-]?key|credential)[A-Za-z0-9_]*)"\s*:\s*"([^"]{8,})"/gi,
    group: 2,
  },
  // URL 안의 자격 증명: https://user:pass@host
  { kind: "url-credential", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]{4,})@/gi, group: 1 },
];

/** 가림 표시. 길이를 보존하지 않는다 — 길이도 정보다. */
function mask(kind: string): string {
  return `[REDACTED:${kind}]`;
}

/**
 * 텍스트에서 자격 증명을 가린다.
 *
 * 규칙을 순서대로 적용하되, 이미 가려진 구간은 다시 건드리지 않는다.
 * (그러지 않으면 `[REDACTED:openai]` 안의 문자열이 다른 규칙에 또 걸린다.)
 */
export function scrub(text: string): ScrubResult {
  if (!text) return { text, matches: [] };

  const matches: ScrubMatch[] = [];
  let result = text;

  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    result = result.replace(re, (full, ...groups) => {
      // 이미 가려진 것은 건너뛴다.
      if (full.includes("[REDACTED:")) return full;

      if (rule.group === undefined) {
        matches.push({ kind: rule.kind, index: 0, length: full.length });
        return mask(rule.kind);
      }
      const captured = groups[rule.group - 1];
      if (typeof captured !== "string" || captured.includes("[REDACTED:")) return full;
      // 값이 코드처럼 생겼으면 시크릿이 아니다.
      if (rule.skipValue?.test(captured)) return full;
      matches.push({ kind: rule.kind, index: 0, length: captured.length });
      return full.replace(captured, mask(rule.kind));
    });
  }

  return { text: result, matches };
}

export function hasSecret(text: string): boolean {
  return scrub(text).matches.length > 0;
}

/**
 * 알려진 값을 정확히 가린다.
 *
 * 패턴으로 못 잡는 키(형태가 평범한 사내 토큰 등)를 위한 안전망이다.
 * AuthResolver 가 실제로 해석한 키를 여기 등록해 두면, 그 값이 어디서
 * 튀어나오든 잡힌다.
 */
export class SecretRegistry {
  private readonly values = new Set<string>();

  /** 너무 짧은 값은 등록하지 않는다 — 본문을 걸레로 만든다. */
  add(value: string | undefined | null, minLength = 12): this {
    if (value && value.length >= minLength) this.values.add(value);
    return this;
  }

  get size(): number {
    return this.values.size;
  }

  scrub(text: string): ScrubResult {
    let result = text;
    const matches: ScrubMatch[] = [];

    // 긴 것부터 지운다 — 짧은 값이 긴 값의 부분 문자열일 수 있다.
    for (const value of [...this.values].sort((a, b) => b.length - a.length)) {
      if (!result.includes(value)) continue;
      matches.push({ kind: "known-secret", index: result.indexOf(value), length: value.length });
      result = result.split(value).join(mask("known-secret"));
    }

    const pattern = scrub(result);
    return { text: pattern.text, matches: [...matches, ...pattern.matches] };
  }
}

/**
 * 툴을 감싸 결과가 **반환되는 순간** 가린다.
 *
 * 이걸 이벤트 구독자로 하면 두 가지가 샌다 —
 *   · 구독 순서에 따라 원문이 먼저 스트림으로 나간다 (호스트 stdout 이 그렇다)
 *   · 다른 에이전트(조사용 planner, 앞으로의 sub-agent)는 그 구독자를 갖지 않는다
 * 벤치에서 실제로 두 번째 경우가 잡혔다: 세션 JSONL 은 깨끗한데 stdout 으로 새어나갔다.
 *
 * 툴 경계에 두면 누가 그 툴을 쥐든 결과가 이미 가려져 있다.
 */
export function scrubTools(
  tools: AgentTool[],
  registry: SecretRegistry,
  onRedact?: (kinds: string[], toolName: string) => void,
): AgentTool[] {
  return tools.map((tool) => ({
    ...tool,
    async execute(args: unknown, context: ToolContext) {
      const result = await tool.execute(args as never, context);
      const scrubbed = registry.scrub(result.content);
      if (scrubbed.matches.length === 0) return result;
      onRedact?.([...new Set(scrubbed.matches.map((m) => m.kind))], tool.name);
      return { ...result, content: scrubbed.text };
    },
  })) as AgentTool[];
}
