/**
 * 파일 체크포인트 — 세션 분기의 짝.
 *
 * 지키려는 성질 셋: 되돌리면 원래대로 온다 · 사람이 손댄 것은 건드리지 않는다 ·
 * 프로세스가 바뀌어도 되돌릴 수 있다.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { agentLoop } from "@xcode/agent-core";
import type { ModelSpec } from "@xcode/ai";
import { MockProvider, ModelRegistry } from "@xcode/ai";
import { createCodingAgent, FileCheckpoints, SessionManager } from "../src/index.ts";

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xcode-ckpt-"));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function checkpoints(cwd: string): FileCheckpoints {
  return new FileCheckpoints({ cwd, dir: join(cwd, ".snap") });
}

/** captureBefore → 수정 → record 의 실제 순서를 흉내낸다. */
function edit(ck: FileCheckpoints, cwd: string, path: string, content: string, entryId: string) {
  const before = ck.captureBefore(path);
  writeFileSync(join(cwd, path), content, "utf8");
  ck.record(path, before, entryId);
}

test("되돌리면 원래 내용으로 온다", () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "a.txt"), "원본");
  const ck = checkpoints(cwd);

  edit(ck, cwd, "a.txt", "고침1", "e1");
  edit(ck, cwd, "a.txt", "고침2", "e2");
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "고침2");

  const result = ck.restoreTo();
  assert.deepEqual(result.restored, ["a.txt"]);
  // 두 번 고쳤어도 **가장 오래된** 원본으로 온다.
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "원본");
});

test("지정한 지점 이후만 되돌린다", () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "a.txt"), "원본");
  const ck = checkpoints(cwd);

  edit(ck, cwd, "a.txt", "1차", "e1");
  edit(ck, cwd, "a.txt", "2차", "e2");

  ck.restoreTo("e1");
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "1차", "e1 자체까지는 유지돼야 한다");
});

test("에이전트가 만든 파일은 되돌리기가 곧 삭제다", () => {
  const cwd = tempDir();
  const ck = checkpoints(cwd);
  edit(ck, cwd, "new.txt", "새로 만든 것", "e1");
  assert.ok(existsSync(join(cwd, "new.txt")));

  const result = ck.restoreTo();
  assert.deepEqual(result.removed, ["new.txt"]);
  assert.ok(!existsSync(join(cwd, "new.txt")));
});

test("사람이 손댄 파일은 건드리지 않고 이유를 보고한다", () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "a.txt"), "원본");
  const ck = checkpoints(cwd);
  edit(ck, cwd, "a.txt", "에이전트가 고침", "e1");

  // 사람이 그 뒤에 손댔다. 이걸 조용히 덮어쓰는 것이 최악이다.
  writeFileSync(join(cwd, "a.txt"), "사람이 고침");

  const result = ck.restoreTo();
  assert.deepEqual(result.restored, []);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0]?.reason ?? "", /또 바뀌었다/);
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "사람이 고침");
});

test("프로세스가 바뀌어도 되돌릴 수 있다 — 로그가 디스크에 있다", () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "a.txt"), "원본");

  // 한 프로세스에서 고치고,
  edit(checkpoints(cwd), cwd, "a.txt", "고침", "e1");

  // 다른 프로세스(새 인스턴스)에서 되돌린다. `xcode --rollback` 이 이 경로다.
  const fresh = checkpoints(cwd);
  const result = fresh.restoreTo();
  assert.deepEqual(result.restored, ["a.txt"]);
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "원본");
});

test("되돌리기는 한 번만 먹는다 — 마커가 남는다", () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "a.txt"), "원본");
  edit(checkpoints(cwd), cwd, "a.txt", "고침", "e1");

  checkpoints(cwd).restoreTo();
  writeFileSync(join(cwd, "a.txt"), "그 뒤 사람이 쓴 것");

  // 새 인스턴스가 로그를 다시 읽어도 이미 되돌린 구간을 또 되돌리면 안 된다.
  const again = checkpoints(cwd).restoreTo();
  assert.deepEqual(again.restored, []);
  assert.equal(readFileSync(join(cwd, "a.txt"), "utf8"), "그 뒤 사람이 쓴 것");
});

/* --- 조립된 에이전트에서 --------------------------------------------------- */

const SPEC: ModelSpec = {
  id: "mock-1",
  provider: "mock",
  contextWindow: 128_000,
  maxOutputTokens: 4096,
  supportsTools: true,
  supportsThinking: false,
};

test("에이전트의 수정은 자동으로 되돌릴 수 있다", async () => {
  const cwd = tempDir();
  writeFileSync(join(cwd, "greet.mjs"), "export const greet = (n) => `Hi ${n}`;\n");

  const models = new ModelRegistry([SPEC]).registerProvider(
    new MockProvider({
      turns: [
        {
          text: "고칩니다.",
          toolCalls: [
            {
              id: "t1",
              name: "edit",
              input: { path: "greet.mjs", oldText: "`Hi ${n}`", newText: "`Hello ${n}`" },
            },
          ],
        },
        { text: "완료했습니다." },
      ],
      chunkSize: 0,
    }),
  );

  const coding = createCodingAgent({
    models,
    modelId: "mock-1",
    cwd,
    session: SessionManager.create({ cwd, filePath: join(cwd, "s.jsonl") }),
  });

  await agentLoop(coding.agent, "greet 를 Hello 로 고쳐줘");
  assert.match(readFileSync(join(cwd, "greet.mjs"), "utf8"), /Hello/);

  // 여기가 세션 분기의 짝이다 — 대화를 되감으면 파일도 따라와야 한다.
  const result = coding.checkpoints.restoreTo();
  assert.deepEqual(result.restored, ["greet.mjs"]);
  assert.match(readFileSync(join(cwd, "greet.mjs"), "utf8"), /Hi \$\{n\}/);
});
