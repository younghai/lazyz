import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { aroundEach } from "vitest";

import { createStandaloneMcpRequestContext, runWithRequestContext } from "../src/request-context.js";

aroundEach(async (runTest) => {
	const homeDir = mkdtempSync(join(tmpdir(), "lsp-tools-test-home-"));
	const context = createStandaloneMcpRequestContext({ env: {}, homeDir });
	try {
		await runWithRequestContext(context, runTest);
	} finally {
		rmSync(homeDir, { recursive: true, force: true });
	}
});
