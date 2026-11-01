/**
 * Audit log — P1-AGENT-003.
 *
 * 세션 JSONL 이 이미 append-only 원장이므로 **별도 로그를 만들지 않는다.**
 * 두 벌을 쓰면 반드시 어긋나고, 어긋난 감사 로그는 없느니만 못하다.
 *
 * 대신 그 원장을 질의할 수 있게 한다: 무엇을 언제 실행했고, 어떤 파일이 바뀌었고,
 * 어디서 실패했는가.
 */

import type { AgentMessage } from "@xcode/agent-core";
import type { SessionManager } from "./session-manager.ts";
import type { SessionEntry } from "./session-types.ts";

export interface AuditToolCall {
  entryId: string;
  timestamp: string;
  tool: string;
  summary: string;
  status: "ok" | "error";
  path?: string;
  tokens: number;
}

export interface AuditFileChange {
  path: string;
  writes: number;
  edits: number;
  firstAt: string;
  lastAt: string;
}

export interface AuditReport {
  sessionId: string;
  cwd: string;
  startedAt: string;
  lastAt: string;
  entries: number;
  turns: number;
  toolCalls: AuditToolCall[];
  failures: AuditToolCall[];
  fileChanges: AuditFileChange[];
  compactions: { entryId: string; timestamp: string; before: number; after: number }[];
  modelChanges: { timestamp: string; modelId: string }[];
  totalTokens: number;
}

const WRITE_TOOLS = new Set(["write", "edit"]);

export function auditSession(session: SessionManager, leafId?: string): AuditReport {
  const branch = session.getBranch(leafId ?? session.getLeafId());
  const toolCalls: AuditToolCall[] = [];
  const compactions: AuditReport["compactions"] = [];
  const modelChanges: AuditReport["modelChanges"] = [];
  const files = new Map<string, AuditFileChange>();
  let totalTokens = 0;
  let turns = 0;

  for (const entry of branch) {
    switch (entry.type) {
      case "message": {
        const message: AgentMessage = entry.message;
        if (message.role === "assistant") {
          // assistant 메시지 하나 = 턴 하나.
          turns++;
        }
        if (message.role !== "toolResult") break;

        const path = typeof message.details?.path === "string" ? message.details.path : undefined;
        const tokens = estimateEntryTokens(entry);
        totalTokens += tokens;

        toolCalls.push({
          entryId: entry.id,
          timestamp: entry.timestamp,
          tool: message.toolName,
          summary: firstLine(message.content),
          status: message.isError ? "error" : "ok",
          ...(path ? { path } : {}),
          tokens,
        });

        if (path && WRITE_TOOLS.has(message.toolName) && !message.isError) {
          const record = files.get(path) ?? {
            path,
            writes: 0,
            edits: 0,
            firstAt: entry.timestamp,
            lastAt: entry.timestamp,
          };
          if (message.toolName === "write") record.writes++;
          else record.edits++;
          record.lastAt = entry.timestamp;
          files.set(path, record);
        }
        break;
      }
      case "compaction":
        compactions.push({
          entryId: entry.id,
          timestamp: entry.timestamp,
          before: entry.tokensBefore,
          after: 0, // 세션 엔트리는 before 만 기록한다. after 는 다음 컨텍스트 구성에서 나온다.
        });
        break;
      case "model_change":
        modelChanges.push({ timestamp: entry.timestamp, modelId: entry.modelId });
        break;
      default:
        break;
    }
  }

  const first = branch[0];
  const last = branch[branch.length - 1];

  return {
    sessionId: session.header.id,
    cwd: session.header.cwd,
    startedAt: first?.timestamp ?? session.header.timestamp,
    lastAt: last?.timestamp ?? session.header.timestamp,
    entries: branch.length,
    turns,
    toolCalls,
    failures: toolCalls.filter((t) => t.status === "error"),
    fileChanges: [...files.values()],
    compactions,
    modelChanges,
    totalTokens,
  };
}

/** 사람이 읽는 형태. `xcode --audit` 이 이걸 찍는다. */
export function renderAudit(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`세션 ${report.sessionId}`);
  lines.push(`  cwd       ${report.cwd}`);
  lines.push(`  기간      ${report.startedAt} → ${report.lastAt}`);
  lines.push(
    `  엔트리    ${report.entries} · 턴 ${report.turns} · 툴 호출 ${report.toolCalls.length}`,
  );

  if (report.modelChanges.length) {
    lines.push(`  모델 변경 ${report.modelChanges.map((m) => m.modelId).join(" → ")}`);
  }
  if (report.compactions.length) {
    lines.push(`  컴팩션    ${report.compactions.length}회`);
  }

  if (report.fileChanges.length) {
    lines.push("", "변경된 파일:");
    for (const file of report.fileChanges) {
      const ops = [
        file.writes ? `write ×${file.writes}` : "",
        file.edits ? `edit ×${file.edits}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      lines.push(`  ${file.path}  (${ops})`);
    }
  }

  if (report.failures.length) {
    lines.push("", `실패한 툴 호출 ${report.failures.length}건:`);
    for (const failure of report.failures) {
      lines.push(`  ${failure.timestamp}  ${failure.tool}: ${failure.summary}`);
    }
  }

  return lines.join("\n");
}

function firstLine(text: string): string {
  const line = (text.split("\n")[0] ?? "").trim();
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

function estimateEntryTokens(entry: SessionEntry): number {
  if (entry.type !== "message") return 0;
  const message = entry.message;
  if (message.role === "toolResult") return Math.ceil(message.content.length / 3.6);
  return 0;
}
