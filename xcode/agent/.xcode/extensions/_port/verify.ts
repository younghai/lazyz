/**
 * Basic verify — P0-CODE-004.
 *
 * 테스트 pass/fail 만 본다. 리뷰어/QA 는 Phase 1.5 다.
 * 성공 기준: 완료로 보고된 태스크의 ≥80% 가 실제로 테스트를 통과할 것.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface VerifyResult {
  status: "pass" | "fail" | "skipped";
  command: string | null;
  exitCode: number | null;
  passed: number | null;
  failed: number | null;
  output: string;
  reason?: string;
}

/** 프로젝트에서 테스트 명령을 찾아낸다. 없으면 검증을 건너뛴다. */
export function detectTestCommand(cwd: string): string | null {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const script = pkg.scripts?.test;
      // `npm init` 기본값은 테스트가 아니다.
      if (script && !/no test specified/i.test(script)) return "npm test";
    } catch {
      // package.json 이 깨져 있으면 다른 후보로 넘어간다
    }
  }
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo test";
  if (existsSync(join(cwd, "go.mod"))) return "go test ./...";
  if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "pytest.ini"))) {
    return "pytest -q";
  }
  return null;
}

/**
 * 프로젝트의 **정합성 검사** 명령을 찾는다 (lint · 타입 · 형식).
 *
 * 왜 test 와 따로 두나. dogfooding 에서 드러난 것 —
 * xcode 가 기능을 완성하고 테스트도 통과시켰는데 **타입 오류를 남긴 채 끝냈다.**
 * 검사를 여러 번 돌려 오류를 보고도, verify 게이트가 test 만 봤기 때문에
 * 그래프의 retry 엣지가 그 실패에 반응하지 못했다.
 *
 * 이 명령이 있으면 verify 가 test 앞에서 먼저 돌린다. 실패하면 verify_fail 이고,
 * 그러면 "다시 구현" 엣지가 걸린다 — 타입 오류도 재시도 대상이 된다.
 */
export function detectCheckCommand(cwd: string): string | null {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      // 우선순위: 종합 check > typecheck > lint. 형식(format)은 자동수정이라 게이트가 아니다.
      for (const name of ["check", "typecheck", "lint"]) {
        if (scripts[name]) return `npm run ${name}`;
      }
    } catch {
      // 깨진 package.json 은 검사 없음으로 본다
    }
  }
  return null;
}

/**
 * 테스트 러너 출력에서 통과/실패 수를 뽑는다.
 * exit code 만 믿으면 "0건 실행됨"을 통과로 오인한다.
 */
export function parseTestCounts(output: string): { passed: number | null; failed: number | null } {
  const patterns: { re: RegExp; passed: number; failed?: number }[] = [
    { re: /Tests?\s+(\d+)\s+failed[^\n]*?(\d+)\s+passed/i, passed: 2, failed: 1 },
    { re: /(\d+)\s+failed\s*[,|]?\s*(\d+)\s+passed/i, passed: 2, failed: 1 },
    { re: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed/i, passed: 2, failed: 1 },
    { re: /(\d+)\s+passing[\s\S]{0,40}?(\d+)\s+failing/i, passed: 1, failed: 2 },
    { re: /ℹ\s*pass\s+(\d+)[\s\S]*?ℹ\s*fail\s+(\d+)/i, passed: 1, failed: 2 },
    { re: /Tests?\s+(\d+)\s+passed/i, passed: 1 },
    { re: /(\d+)\s+passed(?!\s*,\s*\d+\s+failed)/i, passed: 1 },
    { re: /(\d+)\s+passing/i, passed: 1 },
    { re: /ok\s+(\d+)\s+-\s+/i, passed: 1 },
  ];

  for (const pattern of patterns) {
    const m = pattern.re.exec(output);
    if (!m) continue;
    const passed = Number(m[pattern.passed] ?? Number.NaN);
    const failed = pattern.failed ? Number(m[pattern.failed] ?? Number.NaN) : 0;
    if (Number.isFinite(passed)) {
      return { passed, failed: Number.isFinite(failed) ? failed : 0 };
    }
  }
  return { passed: null, failed: null };
}

export function evaluate(input: {
  command: string | null;
  exitCode: number | null;
  output: string;
}): VerifyResult {
  if (!input.command) {
    return {
      status: "skipped",
      command: null,
      exitCode: null,
      passed: null,
      failed: null,
      output: "",
      reason: "테스트 명령을 찾지 못했다 (package.json scripts.test 등)",
    };
  }

  const { passed, failed } = parseTestCounts(input.output);
  const exitOk = input.exitCode === 0;
  // 카운트를 읽었으면 카운트가 정본이다. 못 읽었으면 exit code 로 판단한다.
  const status: VerifyResult["status"] =
    failed !== null ? (failed === 0 && exitOk ? "pass" : "fail") : exitOk ? "pass" : "fail";

  return {
    status,
    command: input.command,
    exitCode: input.exitCode,
    passed,
    failed,
    output: input.output,
    ...(status === "fail" && failed
      ? { reason: `${failed}건 실패` }
      : status === "fail"
        ? { reason: `exit ${input.exitCode}` }
        : {}),
  };
}
