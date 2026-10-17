import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { disposeDefaultLspManager } from "../src/lsp/manager.js";
import { handleLspMcpRequest, type JsonRpcResponse, runMcpStdioServer } from "../src/mcp.js";
import { withTempRequestContext } from "./helpers/request-context.js";
import { fakeLspServerSource } from "./helpers/fake-lsp-server-source.js";

type LogEntry = {
	readonly event: string;
	readonly fields?: Record<string, boolean | number | string | null>;
};

describe("lsp MCP Codex runtime", () => {
	it("#given Codex startup probes and a configured LSP server #when diagnostics follows the handshake #then resources and diagnostics succeed", async () => {
		// given
		const fixture = createConfiguredFakeLspFixture();

		try {
			// when
			const [initialize, resources, resourceTemplates, diagnostics] = await withTempRequestContext(
				() =>
					Promise.all([
						handleLspMcpRequest({
							jsonrpc: "2.0",
							id: 1,
							method: "initialize",
							params: {
								protocolVersion: "2024-11-05",
								capabilities: {},
								clientInfo: { name: "codex", version: "0.0.0" },
							},
						}),
						handleLspMcpRequest({ jsonrpc: "2.0", id: 2, method: "resources/list" }),
						handleLspMcpRequest({ jsonrpc: "2.0", id: 3, method: "resources/templates/list" }),
						handleLspMcpRequest({
							jsonrpc: "2.0",
							id: 4,
							method: "tools/call",
							params: { name: "diagnostics", arguments: { filePath: fixture.filePath, severity: "error" } },
						}),
					]),
				{ cwd: fixture.root },
			);

			// then
			expect(initialize?.result?.serverInfo?.["name"]).toBe("lsp");
			expect(resources).toEqual({ jsonrpc: "2.0", id: 2, result: { resources: [] } });
			expect(resourceTemplates).toEqual({ jsonrpc: "2.0", id: 3, result: { resourceTemplates: [] } });
			expect(diagnostics).toMatchObject({
				jsonrpc: "2.0",
				id: 4,
				result: { isError: false },
			});
			expect(diagnostics?.result?.content?.[0]?.text).toBe("No diagnostics found");
		} finally {
			await fixture.dispose();
		}
	});

	it("#given an unavailable LSP dependency #when diagnostics runs over stdio #then logs actionable guidance before staying alive", async () => {
		// given
		const fixture = createMissingServerFixture();
		const input = new PassThrough();
		const output = new PassThrough();
		const logs: LogEntry[] = [];
		const received: string[] = [];
		output.on("data", (chunk) => received.push(String(chunk)));

		const server = runMcpStdioServer(input, output, {
			idleTimeoutMs: 0,
			requestContext: {
				cwd: fixture.root,
				homeDir: fixture.root,
				env: {
					LSP_TOOLS_MCP_PROJECT_CONFIG: process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"],
					LSP_TOOLS_MCP_USER_CONFIG: process.env["LSP_TOOLS_MCP_USER_CONFIG"],
					LSP_TOOLS_MCP_INSTALL_DECISIONS: join(fixture.root, "lsp-install-decisions.json"),
				},
			},
			log: (event, fields) => {
				logs.push(fields === undefined ? { event } : { event, fields });
			},
		});

		try {
			// when
			input.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: 7,
					method: "tools/call",
					params: { name: "diagnostics", arguments: { filePath: fixture.filePath, severity: "error" } },
				})}\n`,
			);
			await new Promise<void>((resolve) => output.once("data", () => resolve()));
			input.end();
			await server;

			// then
			const response = parseJsonRpcResponse(received.join("").trim());
			const message = response.result?.content?.[0]?.text;
			expect(message).toContain("'missing'");
			expect(message).toContain("NOT INSTALLED");
			expect(message).toContain("Command not found: definitely-missing-lsp");
			expect(logs).toContainEqual(
				expect.objectContaining({
					event: "tool_error",
					fields: expect.objectContaining({
						id: "7",
						method: "tools/call",
						message: expect.stringContaining("NOT INSTALLED"),
					}),
				}),
			);
		} finally {
			await fixture.dispose();
		}
	});
});

function createConfiguredFakeLspFixture(): RuntimeFixture {
	const root = mkdtempSync(join(tmpdir(), "lsp-mcp-startup-"));
	const serverPath = join(root, "fake-lsp-server.mjs");
	const configPath = join(root, "lsp-client.json");
	const filePath = join(root, "sample.fake");
	mkdirSync(join(root, ".codex"), { recursive: true });
	writeFileSync(serverPath, fakeLspServerSource());
	writeFileSync(filePath, "fake diagnostic target\n");
	writeFileSync(
		configPath,
		JSON.stringify({
			lsp: {
				fake: {
					command: [process.execPath, serverPath],
					extensions: [".fake"],
				},
			},
		}),
	);
	return createFixture(root, configPath, filePath);
}

function createMissingServerFixture(): RuntimeFixture {
	const root = mkdtempSync(join(tmpdir(), "lsp-mcp-missing-"));
	const configPath = join(root, "lsp-client.json");
	const filePath = join(root, "sample.missing");
	writeFileSync(filePath, "missing dependency target\n");
	writeFileSync(
		configPath,
		JSON.stringify({
			lsp: {
				missing: {
					command: ["definitely-missing-lsp", "--stdio"],
					extensions: [".missing"],
				},
			},
		}),
	);
	return createFixture(root, configPath, filePath);
}

function createFixture(
	root: string,
	configPath: string,
	filePath: string,
): RuntimeFixture {
	const originalProjectConfig = process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"];
	const originalUserConfig = process.env["LSP_TOOLS_MCP_USER_CONFIG"];
	process.env["LSP_TOOLS_MCP_PROJECT_CONFIG"] = join(root, "missing-project-config.json");
	process.env["LSP_TOOLS_MCP_USER_CONFIG"] = configPath;
	return {
		root,
		filePath,
		dispose: async () => {
			restoreEnv("LSP_TOOLS_MCP_PROJECT_CONFIG", originalProjectConfig);
			restoreEnv("LSP_TOOLS_MCP_USER_CONFIG", originalUserConfig);
			await disposeDefaultLspManager();
			rmSync(root, { recursive: true, force: true });
		},
	};
}

interface RuntimeFixture {
	readonly root: string;
	readonly filePath: string;
	readonly dispose: () => Promise<void>;
}

function parseJsonRpcResponse(raw: string): JsonRpcResponse {
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed) || parsed["jsonrpc"] !== "2.0" || !("id" in parsed)) {
		throw new TypeError(`Invalid JSON-RPC response: ${raw}`);
	}
	return parsed;
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}

function isRecord(value: unknown): value is JsonRpcResponse {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
