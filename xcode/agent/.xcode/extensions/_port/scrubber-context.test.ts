import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  CONTEXT_FILE_NAMES,
  discoverContextFiles,
  hasSecret,
  loadContextFiles,
  renderContextFiles,
  SecretRegistry,
  scrub,
} from "../src/index.ts";

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "xcode-p1-"));
  temps.push(dir);
  return dir;
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/* ================================================================= 스크러버 */

test("접두사가 뚜렷한 토큰을 가린다", () => {
  const cases: [string, string][] = [
    ["sk-abcdefghijklmnopqrstuvwxyz123456", "openai"],
    ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz", "anthropic"],
    ["ghp_abcdefghijklmnopqrstuvwxyz1234", "github"],
    ["glpat-abcdefghijklmnopqrst", "gitlab"],
    ["xoxb-1234567890-abcdefghij", "slack"],
    ["AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456", "google"],
    ["AKIAIOSFODNN7EXAMPLE", "aws-access-key"],
    ["sk_live_abcdefghijklmnop1234", "stripe"],
  ];
  for (const [secret, kind] of cases) {
    const result = scrub(`키는 ${secret} 입니다`);
    assert.ok(!result.text.includes(secret), `가려지지 않음: ${kind}`);
    assert.match(result.text, /\[REDACTED:/, kind);
    assert.ok(result.matches.length > 0, kind);
  }
});

test("이름으로 판단하는 대입문도 가린다 — 값만, 이름은 남긴다", () => {
  const result = scrub("DATABASE_PASSWORD=hunter2supersecret\nDB_HOST=localhost");

  assert.ok(!result.text.includes("hunter2supersecret"));
  assert.match(result.text, /DATABASE_PASSWORD=\[REDACTED:assignment\]/);
  // 비밀이 아닌 값은 건드리지 않는다.
  assert.match(result.text, /DB_HOST=localhost/);
});

test("JSON 필드와 URL 자격 증명을 가린다", () => {
  const json = scrub('{"api_key": "abcdefghijklmnop", "name": "friendly"}');
  assert.ok(!json.text.includes("abcdefghijklmnop"));
  assert.match(json.text, /"name": "friendly"/);

  const url = scrub("git remote: https://user:s3cr3tpassword@github.com/o/r.git");
  assert.ok(!url.text.includes("s3cr3tpassword"));
});

test("Bearer 토큰은 스킴을 남기고 값만 가린다", () => {
  const result = scrub("Authorization: Bearer abcdefghijklmnopqrstuvwx");
  assert.match(result.text, /Bearer \[REDACTED:bearer\]/);
});

test("개인 키 블록 전체를 가린다", () => {
  const key = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK\nabc\n-----END RSA PRIVATE KEY-----";
  const result = scrub(`파일 내용:\n${key}\n끝`);
  assert.ok(!result.text.includes("MIIEpAIBAAK"));
  assert.match(result.text, /\[REDACTED:private-key\]/);
});

test("가려진 자리를 다시 가리지 않는다", () => {
  const once = scrub("sk-abcdefghijklmnopqrstuvwxyz123456");
  const twice = scrub(once.text);
  assert.equal(twice.text, once.text);
  assert.equal(twice.matches.length, 0);
});

test("평범한 텍스트는 건드리지 않는다", () => {
  const text = "이 함수는 사용자 이름을 반환한다. return `Hello ${name}`;";
  const result = scrub(text);
  assert.equal(result.text, text);
  assert.equal(hasSecret(text), false);
});

test("등록된 키는 형태와 무관하게 잡는다", () => {
  // 형태가 평범한 사내 토큰 — 패턴으로는 못 잡는다.
  const registry = new SecretRegistry().add("plain-internal-token-value");
  assert.equal(scrub("값: plain-internal-token-value").matches.length, 0, "패턴만으로는 못 잡는다");

  const result = registry.scrub("값: plain-internal-token-value");
  assert.ok(!result.text.includes("plain-internal-token-value"));
  assert.match(result.text, /\[REDACTED:known-secret\]/);
});

test("너무 짧은 값은 등록하지 않는다 — 본문이 걸레가 된다", () => {
  const registry = new SecretRegistry().add("abc").add(undefined).add("");
  assert.equal(registry.size, 0);
});

test("긴 값부터 지운다 — 짧은 값이 긴 값의 일부일 때", () => {
  const registry = new SecretRegistry().add("token-abcdefghij").add("token-abcdefghij-extended");
  const result = registry.scrub("키: token-abcdefghij-extended");
  // 짧은 것이 먼저 걸리면 "…-extended" 가 본문에 남는다.
  assert.ok(!result.text.includes("extended"));
});

/* ========================================================== 컨텍스트 파일 */

test("AGENTS.md 와 CLAUDE.md 를 둘 다 읽는다", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "AGENTS.md"), "# 규칙\n한국어로 답한다.");
  writeFileSync(join(dir, "CLAUDE.md"), "# 추가 규칙\n커밋하지 않는다.");

  const files = discoverContextFiles(dir);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.relativePath).sort(), CONTEXT_FILE_NAMES.slice().sort());
});

test("루트부터 아래 순서로 모은다 — 구체적인 규칙이 뒤에 와서 이긴다", () => {
  const root = tempDir();
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "packages", "web"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "루트 규칙");
  writeFileSync(join(root, "packages", "web", "AGENTS.md"), "웹 규칙");

  const files = discoverContextFiles(join(root, "packages", "web"));
  assert.equal(files.length, 2);
  assert.match(files[0]?.content ?? "", /루트 규칙/);
  assert.match(files[1]?.content ?? "", /웹 규칙/);
});

test("저장소 경계에서 멈춘다", () => {
  const outer = tempDir();
  const repo = join(outer, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(outer, "AGENTS.md"), "저장소 밖 규칙");
  writeFileSync(join(repo, "AGENTS.md"), "저장소 안 규칙");

  const files = discoverContextFiles(repo);
  assert.equal(files.length, 1);
  assert.match(files[0]?.content ?? "", /저장소 안/);
});

test("파일이 없으면 빈 결과를 낸다", () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".git"), { recursive: true });
  const loaded = loadContextFiles(dir);
  assert.equal(loaded.files.length, 0);
  assert.equal(loaded.rendered, "");
  assert.equal(loaded.bytes, 0);
});

test("거대한 파일은 잘라서 컨텍스트를 지키게 한다", () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "가".repeat(50_000));

  const files = discoverContextFiles(dir);
  assert.equal(files[0]?.truncated, true);
  assert.match(files[0]?.content ?? "", /잘렸다/);
});

test("렌더에 파일 경로가 드러난다 — 어느 규칙인지 알아야 한다", () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".git"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "테스트 먼저 돌린다");

  const rendered = renderContextFiles(discoverContextFiles(dir));
  assert.match(rendered, /<project_context>/);
  // 저장소의 말과 운영자의 말은 층이 다르다는 것이 렌더에 드러나야 한다.
  assert.match(rendered, /사용자의 요청과 충돌하면 사용자가 이긴다/);
  assert.match(rendered, /<file path="AGENTS\.md">/);
  assert.match(rendered, /테스트 먼저 돌린다/);
});

test("코드를 시크릿으로 오인하지 않는다 — dogfooding 에서 실제로 터진 자리", () => {
  /*
   * `contextTokens` 는 이름에 TOKEN 이 들어 있지만 시크릿이 아니다.
   * 이걸 가리면 에이전트가 본 코드가 틀어지고 edit 가 실패한다 — 실측으로 3건 났다.
   */
  const code = [
    "state.contextTokens = currentContextTokens(coding.agent);",
    "const tokenCount = usage.input + usage.output;",
    "accessKeyId: config.aws.accessKeyId,",
    "refreshToken: await this.refresh(),",
    "apiKey: options.apiKey ?? env.KEY,",
  ].join("\n");

  const result = scrub(code);
  assert.equal(result.text, code, `코드가 가려졌다:\n${result.text}`);
  assert.equal(result.matches.length, 0);
});

test("그래도 진짜 대입문은 가린다 — 오탐만 줄인다", () => {
  const env = 'API_TOKEN=abcdef1234567890abcdef\nDB_PASSWORD: "hunter2secret99"';
  const result = scrub(env);
  assert.ok(!result.text.includes("abcdef1234567890abcdef"), "토큰이 남았다");
  assert.ok(!result.text.includes("hunter2secret99"), "비밀번호가 남았다");
  // 이름은 남아야 읽을 수 있다.
  assert.match(result.text, /API_TOKEN/);
  assert.match(result.text, /DB_PASSWORD/);
});
