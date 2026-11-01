import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { ModelSpec } from "@xcode/ai";
import { MockProvider, ModelRegistry } from "@xcode/ai";
import {
  classifyHeuristic,
  classifyTask,
  detectCheckCommand,
  detectTestCommand,
  emptyWorkingMemory,
  evaluate,
  guardWorkingMemory,
  ProjectTrust,
  parseTestCounts,
  renderWorkingMemory,
} from "../src/index.ts";

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xcode-cv-"));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const SPEC: ModelSpec = {
  id: "mock-1",
  provider: "mock",
  contextWindow: 128_000,
  maxOutputTokens: 4096,
  supportsTools: true,
  supportsThinking: false,
};

// ---------------------------------------------------------------- classify

test("위험 신호는 human_gate 로 간다", () => {
  const cases = [
    "DB 마이그레이션 추가해줘",
    "프로덕션에 배포해줘",
    "인증 미들웨어를 고쳐줘",
    "이 테이블 drop 해줘",
  ];
  for (const task of cases) {
    const result = classifyHeuristic(task);
    assert.ok(result, `분류 실패: ${task}`);
    assert.equal(result.risk, "high", task);
    assert.equal(result.route, "human_gate", task);
  }
});

test("사소한 수정은 조사 없이 바로 실행으로 간다", () => {
  const result = classifyHeuristic("README 오타 고쳐줘");
  assert.ok(result);
  assert.equal(result.complexity, "simple");
  assert.equal(result.route, "execute");
});

test("복합 신호는 research 로 간다", () => {
  const result = classifyHeuristic("UserService 를 리팩토링하고 테스트도 추가해줘");
  assert.ok(result);
  assert.equal(result.complexity, "complex");
  assert.equal(result.route, "research");
});

test("애매하면 휴리스틱이 포기하고 LLM 에 넘긴다", async () => {
  assert.equal(classifyHeuristic("이거 좀 봐줘"), null);

  const provider = new MockProvider({
    turns: [
      { text: '{"complexity":"complex","risk":"low","reasons":["범위 불명"],"confidence":0.6}' },
    ],
    chunkSize: 0,
  });
  const models = new ModelRegistry([SPEC]).registerProvider(provider);
  const result = await classifyTask("이거 좀 봐줘", { models, modelId: "mock-1" });

  assert.equal(result.source, "llm");
  assert.equal(result.complexity, "complex");
  assert.equal(result.route, "research");
});

test("LLM 응답이 깨져도 보수적으로 복잡 처리한다", async () => {
  const provider = new MockProvider({ turns: [{ text: "JSON 아님" }], chunkSize: 0 });
  const models = new ModelRegistry([SPEC]).registerProvider(provider);
  const result = await classifyTask("이거 좀 봐줘", { models, modelId: "mock-1" });

  assert.equal(result.complexity, "complex");
  assert.equal(result.route, "research");
  assert.ok(result.confidence < 0.5);
});

// ------------------------------------------------------------------ verify

test("여러 러너의 출력에서 통과/실패를 뽑는다", () => {
  assert.deepEqual(parseTestCounts("Tests  24 passed (24)"), { passed: 24, failed: 0 });
  assert.deepEqual(parseTestCounts("Tests  3 failed | 21 passed (24)"), { passed: 21, failed: 3 });
  assert.deepEqual(parseTestCounts("12 passing\n  2 failing"), { passed: 12, failed: 2 });
  assert.deepEqual(parseTestCounts("ℹ pass 29\nℹ fail 0"), { passed: 29, failed: 0 });
  assert.deepEqual(parseTestCounts("아무것도 없음"), { passed: null, failed: null });
});

test("exit 0 이어도 실패 카운트가 있으면 fail 이다", () => {
  const result = evaluate({ command: "npm test", exitCode: 0, output: "3 failed | 21 passed" });
  assert.equal(result.status, "fail");
  assert.equal(result.failed, 3);
});

test("카운트를 못 읽으면 exit code 로 판단한다", () => {
  assert.equal(evaluate({ command: "npm test", exitCode: 0, output: "???" }).status, "pass");
  assert.equal(evaluate({ command: "npm test", exitCode: 1, output: "???" }).status, "fail");
});

test("테스트 명령이 없으면 skipped 이고 fail 이 아니다", () => {
  const result = evaluate({ command: null, exitCode: null, output: "" });
  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /테스트 명령/);
});

test("npm init 기본 test 스크립트는 테스트로 치지 않는다", () => {
  const dir = tempDir();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  );
  assert.equal(detectTestCommand(dir), null);

  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
  assert.equal(detectTestCommand(dir), "npm test");
});

test("정합성 검사 명령을 우선순위대로 찾는다 — lint·타입 게이트", () => {
  const dir = tempDir();
  // 아무 검사도 없으면 null (게이트 없음).
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
  assert.equal(detectCheckCommand(dir), null);

  // check > typecheck > lint 순. format 은 자동수정이라 게이트가 아니다.
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { format: "biome --write", lint: "biome", typecheck: "tsc" } }),
  );
  assert.equal(
    detectCheckCommand(dir),
    "npm run typecheck",
    "typecheck 가 lint 보다 우선이어야 한다",
  );

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { check: "bash scripts/check.sh", typecheck: "tsc" } }),
  );
  assert.equal(detectCheckCommand(dir), "npm run check", "종합 check 가 최우선이어야 한다");
});

// ------------------------------------------------------------- project trust

test("승인할 리소스가 없으면 묻지 않고 통과한다", async () => {
  const dir = tempDir();
  const trust = new ProjectTrust({ cwd: dir, trustFilePath: join(dir, "trust.json") });
  assert.equal(await trust.isTrusted(), true);
});

test("미승인 프로젝트 로컬 리소스는 로드가 차단된다", async () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".xcode", "extensions"), { recursive: true });
  const trust = new ProjectTrust({ cwd: dir, trustFilePath: join(dir, "trust.json") });

  assert.deepEqual(trust.discoverResources(), [".xcode/extensions"]);
  assert.equal(await trust.isTrusted(), false, "프롬프트가 없으면 거부가 기본값");
  await assert.rejects(
    () => trust.assertLoadable(join(dir, ".xcode", "extensions", "a.ts")),
    /승인되지 않아 로드를 차단/,
  );
});

test("--approve 는 프롬프트 없이 승인한다", async () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".xcode", "skills"), { recursive: true });
  const trust = new ProjectTrust({
    cwd: dir,
    trustFilePath: join(dir, "trust.json"),
    approve: true,
  });
  assert.equal(await trust.isTrusted(), true);
  await trust.assertLoadable(join(dir, ".xcode", "skills", "s.md"));
});

test("프로젝트 밖 경로는 신뢰 검사 대상이 아니다", async () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".xcode", "extensions"), { recursive: true });
  const trust = new ProjectTrust({ cwd: dir, trustFilePath: join(dir, "trust.json") });

  assert.equal(trust.requiresTrust("/etc/hosts"), false);
  assert.equal(trust.requiresTrust(join(dir, "src", "a.ts")), false);
  assert.equal(trust.requiresTrust(join(dir, ".xcode", "settings.json")), true);
  // 검사 대상이 아니면 차단하지 않는다
  await trust.assertLoadable(join(dir, "src", "a.ts"));
});

test("always 로 기억하면 다음부터 통과한다", async () => {
  const dir = tempDir();
  const trustFile = join(dir, "trust.json");
  mkdirSync(join(dir, ".xcode", "extensions"), { recursive: true });

  const first = new ProjectTrust({ cwd: dir, trustFilePath: trustFile });
  first.remember("always");

  const second = new ProjectTrust({ cwd: dir, trustFilePath: trustFile });
  assert.equal(second.level(), "always");
  assert.equal(await second.isTrusted(), true);
});

test("never 는 프롬프트 없이 거부한다", async () => {
  const dir = tempDir();
  const trustFile = join(dir, "trust.json");
  mkdirSync(join(dir, ".xcode", "extensions"), { recursive: true });

  const trust = new ProjectTrust({
    cwd: dir,
    trustFilePath: trustFile,
    prompt: async () => true,
  });
  trust.remember("never");
  assert.equal(await trust.isTrusted(), false);
});

// ------------------------------------------------------------ working memory

test("보호 필드가 유실되면 가드가 잡는다", () => {
  const before = emptyWorkingMemory("커서 페이지네이션");
  before.decisions = [{ id: "dec_1", text: "불투명 커서" }];
  before.failedAttempts = [
    { id: "fail_1", attempt: 1, what: "단일 컬럼 커서", whyFailed: "created_at 이 unique 가 아님" },
  ];

  const good = {
    ...before,
    rev: 1,
    decisions: [...before.decisions, { id: "dec_2", text: "복합 키" }],
  };
  assert.equal(guardWorkingMemory(before, good).ok, true);

  const bad = { ...before, rev: 1, failedAttempts: [] };
  const result = guardWorkingMemory(before, bad);
  assert.equal(result.ok, false);
  assert.equal(result.dropped[0]?.id, "fail_1");
});

test("워킹 메모리 렌더에 실패 기록이 반드시 들어간다", () => {
  const wm = emptyWorkingMemory("목표");
  wm.failedAttempts = [
    {
      id: "fail_1",
      attempt: 1,
      what: "단일 컬럼 커서",
      whyFailed: "created_at 이 unique 가 아님",
      evidence: "test:64",
    },
  ];
  const rendered = renderWorkingMemory(wm);
  assert.match(rendered, /Failed Attempts/);
  assert.match(rendered, /단일 컬럼 커서/);
  assert.match(rendered, /test:64/);
});
