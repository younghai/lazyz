import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
	canonicalizeExistingOrNearestAncestor,
	createStandaloneMcpRequestContext,
	runWithRequestContext,
	type StandaloneMcpRequestContextInput,
} from "../../src/request-context.js";

export function withTempRequestContext<T>(
	fn: () => T,
	input: Omit<StandaloneMcpRequestContextInput, "env" | "homeDir"> = {},
): T {
	const env = requestContextEnv();
	assertTempWritePath(env["LSP_TOOLS_MCP_INSTALL_DECISIONS"]);
	const homeDir = mkdtempSync(join(tmpdir(), "lsp-tools-context-"));
	try {
		const result = runWithRequestContext(createStandaloneMcpRequestContext({ ...input, env, homeDir }), fn);
		if (isPromiseLike(result)) {
			return result.finally(() => rmSync(homeDir, { recursive: true, force: true })) as T;
		}
		rmSync(homeDir, { recursive: true, force: true });
		return result;
	} catch (error) {
		rmSync(homeDir, { recursive: true, force: true });
		throw error;
	}
}

function requestContextEnv(): Record<string, string | undefined> {
	return {
		LSP_TOOLS_MCP_PROJECT_CONFIG: process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"],
		LSP_TOOLS_MCP_USER_CONFIG: process.env["LSP_TOOLS_MCP_USER_CONFIG"],
		LSP_TOOLS_MCP_INSTALL_DECISIONS: process.env["LSP_TOOLS_MCP_INSTALL_DECISIONS"],
	};
}

function assertTempWritePath(path: string | undefined): void {
	if (path === undefined) return;
	if (!isAbsolute(path)) throw new Error(`Test install-decisions path must be absolute: ${path}`);
	const rel = relative(canonicalizeExistingOrNearestAncestor(resolve(tmpdir())), canonicalizeExistingOrNearestAncestor(resolve(path)));
	if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
	throw new Error(`Refusing non-temp test install-decisions path: ${path}`);
}

function isPromiseLike<T>(value: T): value is T & Promise<Awaited<T>> {
	return typeof value === "object" && value !== null && "then" in value;
}
