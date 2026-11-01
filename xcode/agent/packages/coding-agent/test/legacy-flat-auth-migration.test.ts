/**
 * xcode 구형식 auth.json 이관 테스트.
 *
 * 포크 이전의 xcode 는 `{"deepseek": "sk-..."}` 처럼 값을 평문 문자열로 저장했다.
 * 이 파일이 있으면 pi 의 인증 해석이 **환경변수 폴백까지 포함해** 조용히 실패한다 —
 * 실측으로 찾은 문제라 회귀 테스트로 못 박는다.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { migrateLegacyFlatAuthJson } from "../src/migrations.ts";

describe("legacy flat auth.json migration", () => {
	const tempDirs: string[] = [];
	let previousAgentDir: string | undefined;

	function createAgentDir(auth: unknown): string {
		const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "xcode-flat-auth-test-"));
		tempDirs.push(agentDir);
		if (auth !== undefined) {
			const body = typeof auth === "string" ? auth : JSON.stringify(auth, null, 2);
			fs.writeFileSync(path.join(agentDir, "auth.json"), body, { mode: 0o600 });
		}
		previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = agentDir;
		return agentDir;
	}

	afterEach(() => {
		if (previousAgentDir === undefined) {
			delete process.env[ENV_AGENT_DIR];
		} else {
			process.env[ENV_AGENT_DIR] = previousAgentDir;
		}
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	function readAuth(agentDir: string): Record<string, unknown> {
		return JSON.parse(fs.readFileSync(path.join(agentDir, "auth.json"), "utf-8"));
	}

	it("문자열 값을 type 태그가 붙은 자격증명으로 바꾼다", () => {
		const agentDir = createAgentDir({ deepseek: "sk-test-1234567890" });

		const migrated = migrateLegacyFlatAuthJson();

		expect(migrated).toEqual(["deepseek"]);
		expect(readAuth(agentDir)).toEqual({
			deepseek: { type: "api_key", key: "sk-test-1234567890" },
		});
	});

	it("이미 pi 형식인 항목은 건드리지 않는다 — 섞인 파일도 안전하다", () => {
		const agentDir = createAgentDir({
			deepseek: "sk-flat-key",
			anthropic: { type: "api_key", key: "sk-already-typed" },
			openai: { type: "oauth", refresh: "r", access: "a", expires: 1 },
		});

		const migrated = migrateLegacyFlatAuthJson();

		expect(migrated).toEqual(["deepseek"]);
		expect(readAuth(agentDir)).toEqual({
			deepseek: { type: "api_key", key: "sk-flat-key" },
			anthropic: { type: "api_key", key: "sk-already-typed" },
			openai: { type: "oauth", refresh: "r", access: "a", expires: 1 },
		});
	});

	it("멱등이다 — 두 번 돌려도 두 번째는 아무것도 하지 않는다", () => {
		const agentDir = createAgentDir({ deepseek: "sk-flat-key" });

		expect(migrateLegacyFlatAuthJson()).toEqual(["deepseek"]);
		const afterFirst = fs.statSync(path.join(agentDir, "auth.json")).mtimeMs;
		expect(migrateLegacyFlatAuthJson()).toEqual([]);
		// 쓸 것이 없으면 파일을 다시 쓰지 않는다.
		expect(fs.statSync(path.join(agentDir, "auth.json")).mtimeMs).toBe(afterFirst);
	});

	it("권한 0600 을 유지한다 — 자격증명 파일이다", () => {
		const agentDir = createAgentDir({ deepseek: "sk-flat-key" });

		migrateLegacyFlatAuthJson();

		const mode = fs.statSync(path.join(agentDir, "auth.json")).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("파일이 없으면 아무것도 하지 않는다", () => {
		const agentDir = createAgentDir(undefined);
		expect(migrateLegacyFlatAuthJson()).toEqual([]);
		expect(fs.existsSync(path.join(agentDir, "auth.json"))).toBe(false);
	});

	it("깨진 JSON 은 건드리지 않는다 — 진짜 에러는 읽는 쪽이 낸다", () => {
		const agentDir = createAgentDir("{broken");
		expect(migrateLegacyFlatAuthJson()).toEqual([]);
		expect(fs.readFileSync(path.join(agentDir, "auth.json"), "utf-8")).toBe("{broken");
	});
});
