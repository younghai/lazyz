import type { Readable, Writable } from "node:stream";

import {
	isPlainRecord,
	jsonRpcId,
	runJsonRpcStdioServer,
	successResponse,
	type McpLifecycleLog,
	type ParentWatchdogConfig,
} from "@oh-my-opencode/mcp-stdio-core";
import {
	handleLspMcpRequest as handleCoreLspMcpRequest,
	type HandleLspMcpRequestOptions,
	type JsonRpcResponse,
} from "@oh-my-opencode/lsp-core/mcp";
import {
	createStandaloneMcpRequestContext,
	runWithRequestContext,
	type StandaloneMcpRequestContextInput,
} from "@oh-my-opencode/lsp-core/request-context";

export * from "@oh-my-opencode/lsp-core/mcp";

export interface LspMcpStdioServerOptions {
	readonly parentWatchdog?: ParentWatchdogConfig;
	readonly idleTimeoutMs?: number;
	readonly log?: McpLifecycleLog;
	readonly requestContext?: StandaloneMcpRequestContextInput;
}

export async function handleLspMcpRequest(
	input: unknown,
	options: HandleLspMcpRequestOptions = {},
): Promise<JsonRpcResponse | undefined> {
	if (isPlainRecord(input)) {
		const id = jsonRpcId(input["id"]);
		if (input["method"] === "resources/list") return successResponse(id, { resources: [] });
		if (input["method"] === "resources/templates/list") {
			return successResponse(id, { resourceTemplates: [] });
		}
	}
	return handleCoreLspMcpRequest(input, options);
}

export async function runMcpStdioServer(
	input: Readable = process.stdin,
	output: Writable = process.stdout,
	options: LspMcpStdioServerOptions = {},
): Promise<void> {
	const requestContext = createStandaloneMcpRequestContext(options.requestContext);
	await runJsonRpcStdioServer({
		input,
		output,
		idleTimeoutMs: options.idleTimeoutMs ?? 0,
		parentWatchdog: options.parentWatchdog ?? {},
		...(options.log === undefined ? {} : { log: options.log }),
		handler: async (request) => {
			const response = await runWithRequestContext(requestContext, () => handleLspMcpRequest(request));
			logToolError(request, response, options.log);
			return response;
		},
		handlerOptions: undefined,
	});
}

function logToolError(input: unknown, response: JsonRpcResponse | undefined, log: McpLifecycleLog | undefined): void {
	if (log === undefined || !isPlainRecord(input) || input["method"] !== "tools/call") return;
	if (!isPlainRecord(response?.result)) return;
	const details = response.result["details"];
	const isMissingDependency = isPlainRecord(details) && details["errorKind"] === "missing_dependency";
	if (response.result["isError"] !== true && !isMissingDependency) return;
	const content = response.result["content"];
	const first = Array.isArray(content) ? content[0] : undefined;
	const message = isPlainRecord(first) && typeof first["text"] === "string" ? first["text"] : "LSP tool failed";
	const id = jsonRpcId(input["id"]);
	log("tool_error", { id: id === null ? null : String(id), method: "tools/call", message });
}
