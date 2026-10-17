import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodegraphSessionStartWorker } from "../src/session-start-worker.js";

describe("workspace confinement", () => {
	it("#given an external data link #when the session worker runs #then initialization never starts", async () => {
		// given
		const root = mkdtempSync(join(tmpdir(), "lazyz-cg-confinement-"));
		const cwd = join(root, "repo");
		const outside = join(root, "outside");
		mkdirSync(cwd);
		mkdirSync(outside);
		symlinkSync(outside, join(cwd, ".codegraph"));
		let commandCalls = 0;
		try {
			// when
			const result = await runCodegraphSessionStartWorker({
				cwd, env: { HOME: join(root, "home") }, nodeVersion: "22.14.0",
				config: { codegraph: { enabled: true }, sources: [], warnings: [] },
				deps: {
					resolveCommand: () => ({ command: "fixture-codegraph", argsPrefix: [], exists: true, source: "path" }),
					runCommand: async () => { commandCalls += 1; return { exitCode: 0, stdout: "", timedOut: false }; },
				},
			});
			// then
			expect(commandCalls).toBe(0);
			expect(result.action).toBe("failed");
			expect(readdirSync(outside)).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
