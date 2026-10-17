import type { Readable, Writable } from "node:stream";
import { type McpLifecycleLog, type ParentWatchdogConfig } from "@oh-my-opencode/mcp-stdio-core";
import { type HandleLspMcpRequestOptions, type JsonRpcResponse } from "@oh-my-opencode/lsp-core/mcp";
import { type StandaloneMcpRequestContextInput } from "@oh-my-opencode/lsp-core/request-context";
export * from "@oh-my-opencode/lsp-core/mcp";
export interface LspMcpStdioServerOptions {
    readonly parentWatchdog?: ParentWatchdogConfig;
    readonly idleTimeoutMs?: number;
    readonly log?: McpLifecycleLog;
    readonly requestContext?: StandaloneMcpRequestContextInput;
}
export declare function handleLspMcpRequest(input: unknown, options?: HandleLspMcpRequestOptions): Promise<JsonRpcResponse | undefined>;
export declare function runMcpStdioServer(input?: Readable, output?: Writable, options?: LspMcpStdioServerOptions): Promise<void>;
