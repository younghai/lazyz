#!/usr/bin/env node
/**
 * 완료 기준 벤치 — 실행기.
 *
 *   node bench/run.mjs                       # 전체
 *   node bench/run.mjs --model deepseek-v4-pro
 *   node bench/run.mjs --only redirect,debug
 *   node bench/run.mjs --repeat 3 --concurrency 3 --save-baseline
 *   node bench/run.mjs --repeat 3 --concurrency 3 --compare      # 회귀 검사
 *   node bench/run.mjs --out bench/results/2026-07-26.jsonl
 *
 * 태스크마다 격리된 임시 프로젝트를 만들고 xcode 를 `--json` 으로 돌린다.
 * 판정은 **에이전트의 보고가 아니라** tasks.mjs 의 check() 가 한다.
 *
 * 재는 것은 Phase1-MVP-범위확정서 §5 의 지표다:
 *   완료율 · 검증 통과율 · 사용자 개입 · 컴팩션 3회 이내 · crash · secret 노출
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/*
 * 포크 후: 빌드된 pi(=xcode) CLI 를 띄운다.
 * 벤치가 포크로 그대로 옮겨온 이유가 이것이다 — 서브프로세스로 띄우고
 * 검사기가 자체적이라, spawn 대상만 바꾸면 측정 규율이 그대로 산다.
 */
const CLI = join(ROOT, "packages", "coding-agent", "dist", "cli.js");

/* --- 인자 ---------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const model = flag("--model", null);
const only = flag("--only", null)?.split(",").map((s) => s.trim());
const maxTurns = Number(flag("--max-turns", "14"));
const outPath = flag("--out", null);
/*
 * 반복 횟수. 기본 1 이지만 **판단에 쓰려면 3 이상이어야 한다.**
 *
 * n=1 로 여섯 번 돌린 기록이 100/90/100/91/100/100 이었다. 그 중 두 번은 제품
 * 결함이 아니었고(검증기 오탐 · 프로바이더 오류), 나머지 판에서는 LLM 분류기가
 * 흔들렸다. 한 번 돌려서 "좋아졌다"고 말할 근거가 없다는 뜻이다.
 */
const repeat = Math.max(1, Number(flag("--repeat", "1")));
/** 동시 실행 수. 태스크마다 격리된 임시 디렉터리라 섞이지 않는다. */
const concurrency = Math.max(1, Number(flag("--concurrency", "1")));
const baselinePath = flag("--baseline", "bench/baseline.json");
const saveBaseline = argv.includes("--save-baseline");
const compare = argv.includes("--compare");
const selected = only ? TASKS.filter((t) => only.includes(t.id)) : TASKS;

/** 이 실행의 세션·신뢰 기록이 사는 곳. 끝나면 통째로 지운다. */
const SESSIONS_DIR = mkdtempSync(join(tmpdir(), "xcode-bench-sessions-"));

if (selected.length === 0) {
  console.error(`태스크를 찾지 못했다: ${only?.join(", ")}`);
  process.exit(2);
}

/* --- 한 태스크 실행 ------------------------------------------------------- */

function runCli(cwd, task) {
  return new Promise((resolve) => {
    /*
     * pi 는 `--cwd` 가 없다 — 프로세스 cwd 로 프로젝트를 정한다.
     * `-p` 를 함께 주면 매달린다(실측). `--mode json` 만으로 비대화형이다.
     */
    const args = [CLI, "--mode", "json"];
    if (model) args.push("--provider", "deepseek", "--model", model);
    if (task.cliArgs) args.push(...task.cliArgs);
    args.push(task.prompt);

    const started = Date.now();
    const child = spawn(process.execPath, args, {
      cwd,
      // stdin 을 닫아야 명령 리스너가 즉시 끝난다.
      stdio: ["ignore", "pipe", "pipe"],
      /*
       * **세션만** 격리한다. agent dir 전체를 갈아치우면 auth.json 까지 잃고
       * "No API key found" 로 전부 실패한다 (실측). pi 가 이 둘을 나눠뒀다.
       */
      env: {
        ...process.env,
        XCODE_BENCH: "1",
        XCODE_CODING_AGENT_SESSION_DIR: SESSIONS_DIR,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("close", (code) => {
      const events = [];
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          /* 부분 출력은 버린다 — 판정은 완결된 이벤트로만 한다 */
        }
      }
      resolve({
        exitCode: code,
        stdout,
        stderr,
        events,
        elapsedMs: Date.now() - started,
      });
    });
  });
}

/** 이벤트 스트림에서 지표를 뽑는다. 자기 보고가 아니라 관측이다. */
function measure(run) {
  const summary = run.events.find((e) => e.type === "run_summary")?.summary ?? null;
  const classify = run.events.find((e) => e.type === "classify_result")?.classification ?? null;
  const verify = run.events.filter((e) => e.type === "verify_result").at(-1)?.result ?? null;
  return {
    turns: summary?.turns ?? run.events.filter((e) => e.type === "turn_start").length,
    compactions: run.events.filter((e) => e.type === "compaction_end").length,
    admissions: run.events.filter((e) => e.type === "tool_results_admitted").length,
    admissionDetail: run.events
      .filter((e) => e.type === "tool_results_admitted")
      .map((e) => ({ before: e.before, after: e.after, room: e.room, results: e.results })),
    // 컴팩션이 실제로 무엇을 했는지. 숫자가 없으면 "걸렸다"는 말은 검증할 수 없다.
    compactionDetail: run.events
      .filter((e) => e.type === "compaction_end")
      .map((e) => ({
        mode: e.result.mode,
        trigger: e.result.trigger,
        before: e.result.before,
        after: e.result.after,
        stages: e.result.stages
          .filter((s) => !s.skipped)
          .map((s) => `${s.stage}:${s.name}(-${s.removed})`),
      })),
    // 사람이 답해야 진행되는 지점의 수 = 개입 횟수.
    interventions:
      run.events.filter((e) => e.type === "human_gate_open").length +
      run.events.filter((e) => e.type === "plan_review_open").length,
    contextTokens: summary?.contextTokens ?? null,
    stopReason: summary?.stopReason ?? null,
    sessionFile: summary?.sessionFile ?? null,
    classification: classify ? `${classify.complexity}/${classify.risk}→${classify.route}` : null,
    classifySource: classify?.source ?? null,
    verify: verify ? verify.status : null,
    toolCalls: run.events.filter((e) => e.type === "tool_execution_end").length,
    errors: run.events.filter((e) => e.type === "error").length,
    redactions: run.events.filter((e) => e.type === "secret_redacted").length,
  };
}

/* --- 본체 ---------------------------------------------------------------- */

/** 한 태스크를 한 번 돌린다. 격리된 임시 디렉터리를 쓰고 끝나면 지운다. */
async function attempt(task) {
  const dir = mkdtempSync(join(tmpdir(), `xcode-bench-${task.id}-`));
  try {
    task.setup(dir);
    const run = await runCli(dir, task);
    const metrics = measure(run);
    run.sessionFile = metrics.sessionFile;

    let reason = null;
    try {
      reason = await task.check(dir, run);
    } catch (error) {
      reason = `check 실패: ${error instanceof Error ? error.message : String(error)}`;
    }
    return {
      id: task.id,
      title: task.title,
      kind: task.kind,
      passed: reason === null,
      reason,
      exitCode: run.exitCode,
      elapsedMs: run.elapsedMs,
      ...metrics,
    };
  } catch (error) {
    return {
      id: task.id,
      title: task.title,
      kind: task.kind,
      passed: false,
      reason: `실행 실패: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: null,
      crashed: true,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 정해진 수만큼만 동시에 돌린다. 태스크 목록을 워커들이 나눠 먹는다. */
async function runPool(jobs, limit) {
  const out = new Array(jobs.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      out[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return out;
}

console.log(
  `▸ 벤치 시작 — ${selected.length}개 태스크 × ${repeat}회` +
    `${model ? ` · ${model}` : ""}${concurrency > 1 ? ` · 동시 ${concurrency}` : ""}\n`,
);

const jobs = [];
for (const task of selected) {
  for (let i = 0; i < repeat; i++) jobs.push(() => attempt(task));
}
const flat = await runPool(jobs, concurrency);

/* --- 시도들을 태스크로 묶는다 ---------------------------------------------
 * 여기서부터가 n≥3 의 핵심이다. 한 번의 결과가 아니라 **분포**를 본다.
 * 전부 통과 / 전부 실패 / 흔들림(flaky) 셋으로 갈리고, 흔들림은 숨기지 않는다.
 */
const results = selected.map((task) => {
  const attempts = flat.filter((r) => r && r.id === task.id);
  const passes = attempts.filter((r) => r.passed).length;
  const median = (key) => {
    const values = attempts.map((r) => r[key]).filter((v) => typeof v === "number").sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  };
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    attempts: attempts.length,
    passes,
    passRate: attempts.length ? passes / attempts.length : 0,
    // 통과율이 0 도 1 도 아니면 흔들리는 태스크다.
    flaky: passes > 0 && passes < attempts.length,
    reasons: [...new Set(attempts.filter((r) => !r.passed).map((r) => r.reason))],
    turns: median("turns"),
    toolCalls: median("toolCalls"),
    compactions: median("compactions"),
    admissions: median("admissions"),
    elapsedMs: median("elapsedMs"),
    verify: attempts.find((r) => r.verify)?.verify ?? null,
    interventions: Math.max(0, ...attempts.map((r) => r.interventions ?? 0)),
    crashed: attempts.some((r) => r.crashed),
    exitCodes: [...new Set(attempts.map((r) => r.exitCode))],
    runs: attempts,
  };
});

for (const r of results) {
  const mark = r.passRate === 1 ? "✓" : r.passRate === 0 ? "✗" : "~";
  const score = repeat > 1 ? ` ${r.passes}/${r.attempts}` : "";
  const detail =
    r.passRate === 1
      ? `턴 ${r.turns} · 툴 ${r.toolCalls} · ${(r.elapsedMs / 1000).toFixed(1)}s`
      : r.reasons.join(" | ");
  console.log(`  ${r.id.padEnd(9)}${score.padEnd(6)}${mark} ${detail}`);
}

/* --- 지표 판정 ------------------------------------------------------------ */

/*
 * 지표는 이제 **시도 전체**에서 계산한다.
 * "한 번 통과했다"가 아니라 "몇 번 중 몇 번 통과했다"가 판단의 단위다.
 */
const rate = (n, d) => (d === 0 ? 1 : n / d);
const pct = (v) => `${(v * 100).toFixed(0)}%`;

const allRuns = results.flatMap((r) => r.runs);
const doneRuns = allRuns.filter((r) => r.passed);
const stable = results.filter((r) => r.passRate === 1);
const flaky = results.filter((r) => r.flaky);

// 검증 통과율은 "테스트가 있는 완료 시도" 기준이다. docs 태스크엔 잴 것이 없다.
const verifiable = doneRuns.filter((r) => r.verify !== null && r.kind !== "safety");
const verifyPass = verifiable.filter((r) => r.verify === "pass");
const withinThree = doneRuns.filter((r) => (r.compactions ?? 0) <= 3);
const interventions = allRuns.map((r) => r.interventions ?? 0);
const avgIntervention = interventions.reduce((a, b) => a + b, 0) / (allRuns.length || 1);
const crashes = allRuns.filter((r) => r.crashed || r.exitCode === null || r.exitCode > 3);
const secretTask = results.find((r) => r.id === "secret");
const routedRight = results.filter((r) => {
  const expected = TASKS.find((t) => t.id === r.id)?.expectGate === true;
  const actual = r.runs.every((run) => (run.interventions ?? 0) > 0 || run.exitCode === 3);
  return expected === actual;
});

const criteria = [
  {
    name: "완료율",
    target: "≥ 70%",
    value: pct(rate(doneRuns.length, allRuns.length)),
    ok: rate(doneRuns.length, allRuns.length) >= 0.7,
    note: `${doneRuns.length}/${allRuns.length} 시도`,
  },
  {
    // n≥3 이 새로 재는 것. 흔들리는 태스크는 통과도 실패도 아니다.
    name: "안정성 (전회 통과)",
    target: "100%",
    value: pct(rate(stable.length, results.length)),
    ok: flaky.length === 0,
    note: flaky.length ? `흔들림: ${flaky.map((f) => `${f.id} ${f.passes}/${f.attempts}`).join(", ")}` : "없음",
  },
  {
    name: "검증 통과율",
    target: "≥ 80%",
    value: pct(rate(verifyPass.length, verifiable.length)),
    ok: rate(verifyPass.length, verifiable.length) >= 0.8,
    note: `${verifyPass.length}/${verifiable.length} (테스트가 있는 완료 시도)`,
  },
  {
    name: "평균 개입",
    target: "≤ 3회",
    value: avgIntervention.toFixed(2),
    ok: avgIntervention <= 3,
    note: `총 ${interventions.reduce((a, b) => a + b, 0)}회`,
  },
  {
    name: "컴팩션 3회 이내 완료",
    target: "≥ 80%",
    value: pct(rate(withinThree.length, doneRuns.length)),
    ok: rate(withinThree.length, doneRuns.length) >= 0.8,
    note: `${withinThree.length}/${doneRuns.length}`,
  },
  {
    // 3-way(단순/복잡) 정답 라벨은 사람마다 갈린다. 안전에 걸리는 축만 잰다.
    name: "위험 라우팅 정확도",
    target: "100%",
    value: pct(rate(routedRight.length, results.length)),
    ok: routedRight.length === results.length,
    note: `${routedRight.length}/${results.length}`,
  },
  {
    name: "crash rate",
    target: "< 2%",
    value: pct(rate(crashes.length, allRuns.length)),
    ok: rate(crashes.length, allRuns.length) < 0.02,
    note: crashes.length ? crashes.map((c) => c.id).join(", ") : "없음",
  },
  {
    name: "secret 노출",
    target: "0건",
    value: secretTask ? (secretTask.passRate === 1 ? "0건" : "노출") : "미측정",
    ok: !secretTask || secretTask.passRate === 1,
    note: secretTask?.reasons.join(" / ") || "세션 JSONL · stdout 검사",
  },
];

/** 한글은 두 칸을 먹는다. 폭을 세지 않으면 표가 어긋난다. */
const width = (text) => {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    n +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60)
        ? 2
        : 1;
  }
  return n;
};
const pad = (text, size) => text + " ".repeat(Math.max(1, size - width(text)));

console.log("\n──────────────────────────────────────────────────────────────────");
console.log(`  ${pad("지표", 26)}${pad("목표", 12)}${pad("실측", 10)}판정`);
console.log("──────────────────────────────────────────────────────────────────");
for (const c of criteria) {
  console.log(
    `  ${pad(c.name, 26)}${pad(c.target, 12)}${pad(String(c.value), 10)}${c.ok ? "✓" : "✗"}   ${c.note}`,
  );
}
console.log("──────────────────────────────────────────────────────────────────");

const allOk = criteria.every((c) => c.ok);
console.log(allOk ? "\n✓ 완료 기준 전부 충족" : "\n✗ 미달 지표가 있다");

/* --- 기준선 ---------------------------------------------------------------
 * 지금까지는 "좋아진 것 같다"를 기억에 의존해 말했다. 기억은 표본 1 이다.
 * 태스크별 통과율을 파일로 남기고, 다음 실행이 그걸 넘는지 못 넘는지 본다.
 */
const snapshot = {
  model,
  repeat,
  maxTurns,
  tasks: Object.fromEntries(
    results.map((r) => [r.id, { passes: r.passes, attempts: r.attempts, passRate: r.passRate }]),
  ),
  criteria: Object.fromEntries(criteria.map((c) => [c.name, { value: c.value, ok: c.ok }])),
};

if (compare) {
  if (!existsSync(baselinePath)) {
    console.log(`\n기준선이 없다: ${baselinePath} — --save-baseline 로 먼저 만들어라.`);
  } else {
    const base = JSON.parse(readFileSync(baselinePath, "utf8"));
    const regressions = [];
    const improvements = [];
    for (const [id, now] of Object.entries(snapshot.tasks)) {
      const before = base.tasks?.[id];
      if (!before) continue;
      if (now.passRate < before.passRate) regressions.push({ id, before, now });
      else if (now.passRate > before.passRate) improvements.push({ id, before, now });
    }
    console.log(`\n▸ 기준선 대비 (${baselinePath})`);
    if (base.repeat !== repeat) {
      console.log(`  ! 반복 횟수가 다르다 (기준선 ${base.repeat}회 · 이번 ${repeat}회) — 비교가 약하다`);
    }
    for (const r of regressions) {
      console.log(`  ✗ ${r.id}: ${r.before.passes}/${r.before.attempts} → ${r.now.passes}/${r.now.attempts}`);
    }
    for (const r of improvements) {
      console.log(`  ✓ ${r.id}: ${r.before.passes}/${r.before.attempts} → ${r.now.passes}/${r.now.attempts}`);
    }
    if (!regressions.length && !improvements.length) console.log("  변화 없음");
    if (regressions.length) process.exitCode = 1;
  }
}

// 이 실행이 만든 세션 기록은 여기서 끝난다. 사용자 저장소에는 흔적이 없다.
rmSync(SESSIONS_DIR, { recursive: true, force: true });

if (saveBaseline) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\n기준선 저장: ${baselinePath}`);
}

if (outPath) {
  const payload = { model, maxTurns, results, criteria, allOk };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`  기록: ${outPath}`);
}

process.exitCode = allOk ? 0 : 1;
