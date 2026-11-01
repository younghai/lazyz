import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "../core/extensions/types.ts";

const RISK_RULES = [
	{ re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/, why: "재귀·강제 삭제" },
	{ re: /\bgit\s+push\b[^\n]*--force/, why: "강제 push — 남의 커밋을 지운다" },
	{ re: /\bgit\s+reset\b[^\n]*--hard/, why: "하드 리셋 — 로컬 변경이 사라진다" },
	{ re: /\bmkfs\b|\bdd\s+if=/, why: "디스크를 직접 쓴다" },
	{ re: /:\(\)\s*\{.*\};:/, why: "fork 폭탄" },
	{ re: /\bsudo\b/, why: "권한 상승" },
	{ re: /\b(chmod|chown)\b[^\n]*777/, why: "권한을 모두에게 개방" },
	{ re: /\b(drop|truncate)\s+(table|database)\b/i, why: "테이블·DB 삭제" },
	{ re: /\bcurl\b[^\n]*\|\s*(ba)?sh/, why: "받아서 바로 실행" },
	{ re: /\bnpm\s+publish\b|\bdocker\s+push\b|\bkubectl\s+(apply|delete)\b/, why: "배포" },
] as const;

const RISKY_PATHS = [
	{ re: /(^|\/)\.env(\.|$)/, why: "자격 증명 파일" },
	{ re: /(^|\/)(migrations?|migrate)\//i, why: "스키마 마이그레이션" },
	{ re: /\.sql$/i, why: "SQL — 스키마·데이터를 바꾼다" },
	{ re: /(^|\/)\.github\/workflows\//, why: "CI 워크플로 — 실행 권한을 갖는다" },
	{ re: /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/i, why: "배포 이미지 정의" },
	{ re: /(^|\/)(auth|credential)[^/]*\.[jt]s$/i, why: "인증 경로" },
	{ re: /(^|\/)\.xcode\//, why: "에이전트 자신의 설정 — 다음 실행의 권한을 바꾼다" },
] as const;

type Finding = {
	readonly why: string;
	readonly detail: string;
};

function inspect(event: ToolCallEvent): Finding | undefined {
	if (event.toolName === "bash") {
		const command = String(event.input.command ?? "");
		for (const rule of RISK_RULES) {
			if (rule.re.test(command)) return { why: rule.why, detail: command };
		}
		return undefined;
	}

	if (event.toolName === "edit" || event.toolName === "write") {
		const path = String(event.input.path ?? "");
		for (const rule of RISKY_PATHS) {
			if (rule.re.test(path)) return { why: rule.why, detail: path };
		}
	}
	return undefined;
}

export default function humanGateExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx): Promise<ToolCallEventResult | undefined> => {
		const finding = inspect(event);
		if (!finding) return undefined;

		if (!ctx.hasUI) {
			return {
				block: true,
				reason:
					`위험 작업으로 판단해 차단했다 (${finding.why}).\n` +
					"비대화형 실행이라 승인할 사람이 없다. 대화형으로 다시 실행하거나, " +
					"이 작업이 필요한 이유를 사람에게 설명하고 멈춰라.",
			};
		}

		const allow = await ctx.ui.confirm(
			`위험 작업 — ${finding.why}`,
			`${event.toolName}\n\n  ${finding.detail}\n\n진행할까?`,
		);
		if (!allow) {
			ctx.ui.notify(`차단했다 — ${finding.why}`, "warning");
			return {
				block: true,
				reason:
					`사람이 거부했다 (${finding.why}: ${finding.detail}).\n` +
					"다시 시도하지 마라. 다른 방법이 있으면 그것을 제안하고, 없으면 왜 이 작업이 " +
					"필요한지 설명하고 멈춰라.",
			};
		}

		ctx.ui.notify(`승인 — ${finding.why} (이 작업에만 적용)`, "info");
		return undefined;
	});
}
