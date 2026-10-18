import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const delayedStdioPath = fileURLToPath(new URL("./fixtures/delayed-stdio.mjs", import.meta.url));

describe("CLI output drain", () => {
	it("#given buffered stdout #when help finishes #then the CLI preserves its complete output", async () => {
		const { stdout, stderr } = await execFileAsync(process.execPath, ["--import", delayedStdioPath, cliPath, "--help"]);
		expect(stdout).toContain("Usage:");
		expect(stdout).toMatch(/Run `lazyz ulw-loop help` for ulw-loop subcommands\.\n$/);
		expect(stderr).toBe("");
	});

	it("#given buffered stderr #when a command fails #then the CLI keeps its error and exit code", async () => {
		await expect(execFileAsync(process.execPath, ["--import", delayedStdioPath, cliPath, "unknown-output-drain-test"]))
			.rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("unknown command: unknown-output-drain-test") });
	});
});
