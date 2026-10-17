import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function hasOnlyExhaustedExecutorTasks(cwd: string, sessionId: string, workId: string | null): boolean {
	if (workId === null) return false;
	const directory = join(cwd, ".omo", "lazycodex-executor-verify", "tasks", digest(sessionId));
	if (!existsSync(directory)) return false;
	try {
		const states = readdirSync(directory)
			.filter((entry) => entry.endsWith(".json"))
			.flatMap((entry) => {
				const state = parseState(readFileSync(join(directory, entry), "utf8"));
				return state?.workId === workId ? [state] : [];
			});
		const unresolved = states.filter((state) => !state.passed);
		return unresolved.length > 0 && unresolved.every((state) => state.exhausted);
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

function parseState(
	raw: string,
): { readonly workId: string; readonly passed: boolean; readonly exhausted: boolean } | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!isRecord(value) || !isRecord(value["contract"]) || !Array.isArray(value["runs"])) return null;
		const workId = value["contract"]["workId"];
		if (typeof workId !== "string" || typeof value["exhausted"] !== "boolean") return null;
		const passed = value["runs"].some((run) => isRecord(run) && run["status"] === "passed");
		return { workId, passed, exhausted: value["exhausted"] };
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
