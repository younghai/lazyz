import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getMergedServers } from "../src/lsp/config-loader.js";
import {
	contextCwd,
	contextEnv,
	createStandaloneMcpRequestContext,
	runWithRequestContext,
} from "../src/request-context.js";
import { withTempRequestContext } from "./helpers/request-context.js";

const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("request context", () => {
	it("#given the standalone test context #when contextCwd #then returns process cwd", () => {
		expect(contextCwd()).toBe(process.cwd());
	});

	it("#given active context #when contextCwd #then returns context cwd", () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-context-root-"));
		tempDirectories.push(root);
		const result = runWithRequestContext(createStandaloneMcpRequestContext({ cwd: root, env: {}, homeDir: root }), () => contextCwd());
		expect(result).toBe(realpathSync(root));
	});

	it("#given context env map #when key missing #then resolves undefined without process fallback", () => {
		process.env["LSP_CTX_TEST_KEY"] = "from-process";
		try {
			const result = runWithRequestContext(createStandaloneMcpRequestContext({ env: {} }), () =>
				contextEnv("LSP_CTX_TEST_KEY"),
			);
			expect(result).toBeUndefined();
		} finally {
			delete process.env["LSP_CTX_TEST_KEY"];
		}
	});

	it("#given an installed context #when contextEnv reads an unrelated key #then process env is not exposed", () => {
		process.env["LSP_CTX_TEST_KEY"] = "from-process";
		try {
			expect(contextEnv("LSP_CTX_TEST_KEY")).toBeUndefined();
		} finally {
			delete process.env["LSP_CTX_TEST_KEY"];
		}
	});

	it("#given project config only reachable via context cwd #when getMergedServers #then honors context", () => {
		const root = mkdtempSync(join(tmpdir(), "lsp-ctx-project-"));
		tempDirectories.push(root);
		mkdirSync(join(root, ".codex"), { recursive: true });
		writeFileSync(
			join(root, ".codex", "lsp-client.json"),
			JSON.stringify({ lsp: { typescript: { extensions: [".mts"], priority: 7 } } }),
		);

		const defaultContext = getMergedServers().find((server) => server.id === "typescript");
		const withContext = runWithRequestContext(createStandaloneMcpRequestContext({ cwd: root, env: {}, homeDir: root }), () =>
			getMergedServers().find((server) => server.id === "typescript"),
		);

		expect(withContext?.source).toBe("project");
		expect(withContext?.extensions).toContain(".mts");
		expect(defaultContext?.source).not.toBe("project");
	});

	it("#given a non-temp decisions path #when installing a test context #then refuses before running", () => {
		const previous = process.env["LSP_TOOLS_MCP_INSTALL_DECISIONS"];
		process.env["LSP_TOOLS_MCP_INSTALL_DECISIONS"] = join(dirname(tmpdir()), "outside-test-decisions.json");
		try {
			expect(() => withTempRequestContext(() => undefined)).toThrow(/Refusing non-temp/u);
		} finally {
			if (previous === undefined) delete process.env["LSP_TOOLS_MCP_INSTALL_DECISIONS"];
			else process.env["LSP_TOOLS_MCP_INSTALL_DECISIONS"] = previous;
		}
	});
});
