import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	getInstallDecisionsPath,
	loadInstallDecision,
	loadInstallDecisions,
	recordInstallDecision,
} from "../src/lsp/server-install-state.js";
import { contextEnv } from "../src/request-context.js";
import { withTempRequestContext } from "./helpers/request-context.js";

const ENV = "LSP_TOOLS_MCP_INSTALL_DECISIONS";
const tempDirectories: string[] = [];
let previousEnv: string | undefined;

function useDecisionsFile(): string {
	const dir = mkdtempSync(join(tmpdir(), "lsp-install-decisions-"));
	tempDirectories.push(dir);
	const path = join(dir, "nested", "lsp-install-decisions.json");
	process.env[ENV] = path;
	return path;
}

beforeEach(() => {
	previousEnv = process.env[ENV];
});

afterEach(() => {
	if (previousEnv === undefined) {
		delete process.env[ENV];
	} else {
		process.env[ENV] = previousEnv;
	}
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("server install state", () => {
	it("#given a recorded decision #when loading it back #then returns the decision and creates parent dirs", () => {
		// given
		const path = useDecisionsFile();

		// when
		const record = withTempRequestContext(() => {
			recordInstallDecision("rust", "declined", "2026-06-10T00:00:00.000Z");
			return loadInstallDecision("rust");
		});

		// then
		expect(record).toEqual({ decision: "declined", decidedAt: "2026-06-10T00:00:00.000Z" });
		expect(existsSync(path)).toBe(true);
		expect(existsSync(dirname(path))).toBe(true);
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		expect(parsed).toMatchObject({ rust: { decision: "declined" } });
	});

	it("#given an unknown server #when loading its decision #then returns undefined", () => {
		// given
		useDecisionsFile();
		withTempRequestContext(() => recordInstallDecision("rust", "declined"));

		// when / then
		expect(withTempRequestContext(() => loadInstallDecision("gopls"))).toBeUndefined();
	});

	it("#given no decisions file #when loading #then treats it as empty", () => {
		// given
		useDecisionsFile();

		// when / then
		expect(withTempRequestContext(() => loadInstallDecisions())).toEqual({});
		expect(withTempRequestContext(() => loadInstallDecision("rust"))).toBeUndefined();
	});

	it("#given a corrupt decisions file #when loading #then tolerates it as empty", () => {
		// given
		const path = useDecisionsFile();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, "{ this is not json", "utf8");

		// when / then
		expect(withTempRequestContext(() => loadInstallDecisions())).toEqual({});
		expect(withTempRequestContext(() => loadInstallDecision("rust"))).toBeUndefined();
	});

	it("#given an existing decision #when recording a new one #then overwrites with the latest", () => {
		// given
		useDecisionsFile();
		withTempRequestContext(() => recordInstallDecision("rust", "declined", "2026-06-10T00:00:00.000Z"));

		// when
		withTempRequestContext(() => recordInstallDecision("rust", "allowed", "2026-06-10T01:00:00.000Z"));

		// then
		expect(withTempRequestContext(() => loadInstallDecision("rust"))).toEqual({
			decision: "allowed",
			decidedAt: "2026-06-10T01:00:00.000Z",
		});
	});

	it("#given a recorded decision #when writing atomically #then leaves no temp artifact behind", () => {
		// given
		const path = useDecisionsFile();

		// when
		withTempRequestContext(() => recordInstallDecision("rust", "allowed"));

		// then
		const entries = readdirSync(dirname(path));
		expect(entries).toContain("lsp-install-decisions.json");
		expect(entries.some((entry) => entry.endsWith(".tmp"))).toBe(false);
	});

	it("#given an absolute env override #when resolving the path #then returns it unchanged", () => {
		// given
		const path = join(tmpdir(), "explicit-install-decisions.json");
		process.env[ENV] = path;

		// when / then
		expect(withTempRequestContext(() => getInstallDecisionsPath())).toBe(path);
	});

	it("#given no env override #when resolving the path #then defaults beside the user config", () => {
		// given
		delete process.env[ENV];

		// when
		const path = getInstallDecisionsPath();

		// then
		const userConfig = contextEnv("LSP_TOOLS_MCP_USER_CONFIG");
		expect(userConfig).toBeDefined();
		expect(dirname(path)).toBe(dirname(userConfig ?? ""));
		expect(path).not.toContain(`${sep}.pi${sep}`);
	});
});
