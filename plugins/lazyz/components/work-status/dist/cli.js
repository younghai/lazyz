#!/usr/bin/env node

// src/cli.ts
import { stdout as processStdout } from "node:process";

// src/hook.ts
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";

// src/work-status.ts
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
var TODO_HEADING_LOWER = "todos";
var FINAL_VERIFICATION_HEADING_LOWER = "final verification wave";
var CHECKBOX_PREFIX_LENGTH = "- [ ] ".length;
function readInProgressStartWork(cwd) {
  const boulderPath = join(cwd, ".omo", "boulder.json");
  const boulderState = readBoulderState(boulderPath);
  if (boulderState === null)
    return null;
  const work = pickMostRecentContinuable(boulderState.works);
  if (work === null)
    return null;
  const planPath = resolveBoulderPlanPathForWork(cwd, work);
  const checklist = getPlanChecklist(planPath);
  if (checklist.remaining === 0)
    return null;
  return {
    kind: "start-work",
    planName: work.planName,
    planPath,
    boulderPath,
    ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
    worktreePath: work.worktreePath ?? null,
    status: work.status,
    checklist,
    degraded: false
  };
}
function readInProgressStartWorkLenient(cwd) {
  const strict = readInProgressStartWork(cwd);
  if (strict !== null)
    return strict;
  const boulderPath = join(cwd, ".omo", "boulder.json");
  if (!existsSync(boulderPath))
    return null;
  const raw = safeReadText(boulderPath);
  if (raw === null)
    return null;
  const isJson = tryParseJson(raw) !== undefined;
  if (!isJson) {
    return {
      kind: "start-work",
      planName: "(unparseable boulder.json)",
      planPath: "",
      boulderPath,
      ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
      worktreePath: null,
      status: undefined,
      checklist: emptyChecklist(),
      degraded: true
    };
  }
  return null;
}
function getPlanChecklist(planPath) {
  if (!existsSync(planPath))
    return emptyChecklist();
  const markdown = safeReadText(planPath);
  if (markdown === null)
    return emptyChecklist();
  return parsePlanChecklist(markdown);
}
function parsePlanChecklist(markdown) {
  const lines = markdown.split(/\r?\n/);
  const hasCountedSections = lines.some((line) => isCountedHeading(parseLevelTwoHeading(line)));
  let completed = 0;
  let remaining = 0;
  let nextTaskLabel = null;
  let isCountedSection = !hasCountedSections;
  for (const line of lines) {
    const heading = parseLevelTwoHeading(line);
    if (heading !== null) {
      isCountedSection = isCountedHeading(heading);
      continue;
    }
    if (!isCountedSection)
      continue;
    const checkbox = parseTopLevelCheckbox(line);
    if (checkbox === null)
      continue;
    if (checkbox.checked) {
      completed += 1;
    } else {
      remaining += 1;
      nextTaskLabel = nextTaskLabel ?? checkbox.label;
    }
  }
  return { completed, remaining, total: completed + remaining, nextTaskLabel };
}
function readBoulderState(path) {
  const raw = safeReadText(path);
  if (raw === null)
    return null;
  const parsed = tryParseJson(raw);
  if (parsed === undefined)
    return null;
  return parseBoulderState(parsed);
}
function parseBoulderState(value) {
  if (!isRecord(value))
    return null;
  const works = [];
  const worksValue = value["works"];
  const hasWorksMap = isRecord(worksValue);
  if (hasWorksMap) {
    for (const workValue of Object.values(worksValue)) {
      const work = parseBoulderWork(workValue);
      if (work !== null)
        works.push(work);
    }
  }
  if (works.length === 0)
    return null;
  return { works, hasWorksMap };
}
function parseBoulderWork(value) {
  if (!isRecord(value))
    return null;
  const activePlan = value["active_plan"];
  const planName = value["plan_name"];
  if (typeof activePlan !== "string")
    return null;
  const status = parseBoulderWorkStatus(value["status"]);
  const sessionIds = parseSessionIds(value["session_ids"]);
  const worktreePath = value["worktree_path"];
  const startedAt = value["started_at"];
  const updatedAt = value["updated_at"];
  const failCountRaw = value["fail_count"];
  const failCount = typeof failCountRaw === "number" && Number.isFinite(failCountRaw) ? failCountRaw : undefined;
  return {
    activePlan,
    planName: typeof planName === "string" ? planName : activePlan,
    sessionIds,
    ...status === undefined ? {} : { status },
    ...failCount === undefined ? {} : { failCount },
    ...typeof startedAt === "string" ? { startedAt } : {},
    ...typeof updatedAt === "string" ? { updatedAt } : {},
    ...typeof worktreePath === "string" ? { worktreePath } : {}
  };
}
function pickMostRecentContinuable(works) {
  let best = null;
  let bestMs = 0;
  for (const work of works) {
    if (!isContinuableStatus(work.status))
      continue;
    const ms = parseIsoToMs(work.updatedAt ?? work.startedAt) ?? 0;
    if (best === null || ms > bestMs) {
      best = work;
      bestMs = ms;
    }
  }
  return best;
}
function resolveBoulderPlanPathForWork(cwd, work) {
  const absolutePlanPath = resolveTrackedPath(cwd, work.activePlan);
  const worktreePath = work.worktreePath?.trim();
  if (worktreePath === undefined || worktreePath.length === 0)
    return absolutePlanPath;
  const relativePlanPath = relative(resolve(cwd), absolutePlanPath);
  if (relativePlanPath.length === 0 || relativePlanPath.startsWith("..") || isAbsolute(relativePlanPath)) {
    return absolutePlanPath;
  }
  const worktreePlanPath = resolve(resolveTrackedPath(cwd, worktreePath), relativePlanPath);
  return existsSync(worktreePlanPath) ? worktreePlanPath : absolutePlanPath;
}
function resolveTrackedPath(baseDirectory, trackedPath) {
  return isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(baseDirectory, trackedPath);
}
function parseTopLevelCheckbox(line) {
  if (line.startsWith("- [ ] "))
    return { checked: false, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
  if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
    return { checked: true, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
  }
  return null;
}
function parseLevelTwoHeading(line) {
  if (!line.startsWith("## "))
    return null;
  return line.slice("## ".length).trim();
}
function isCountedHeading(heading) {
  if (heading === null)
    return false;
  const normalized = heading.toLowerCase();
  return normalized === TODO_HEADING_LOWER || normalized === FINAL_VERIFICATION_HEADING_LOWER;
}
function parseBoulderWorkStatus(value) {
  if (value === "active" || value === "paused" || value === "completed" || value === "abandoned" || value === "blocked")
    return value;
  return;
}
function parseSessionIds(value) {
  if (!Array.isArray(value))
    return [];
  const sessionIds = [];
  for (const item of value) {
    if (typeof item === "string")
      sessionIds.push(item);
  }
  return sessionIds;
}
function parseIsoToMs(value) {
  if (value === undefined)
    return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function isContinuableStatus(status) {
  return status === "active" || status === "paused";
}
function emptyChecklist() {
  return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
}
function readInProgressUlwLoop(cwd) {
  const goalsPath = join(cwd, ".omo", "ulw-loop", "goals.json");
  if (!existsSync(goalsPath))
    return null;
  const raw = safeReadText(goalsPath);
  if (raw === null) {
    return degradedUlwLoop(cwd, goalsPath);
  }
  const parsed = tryParseJson(raw);
  if (parsed === undefined) {
    return degradedUlwLoop(cwd, goalsPath);
  }
  const plan = parseUlwLoopPlan(parsed);
  if (plan === null)
    return null;
  let totalCriteria = 0;
  let passedCriteria = 0;
  const goals = [];
  let hasIncomplete = false;
  for (const goal of plan.goals) {
    let cTotal = 0;
    let cPassed = 0;
    const criteria = goal.successCriteria;
    if (Array.isArray(criteria)) {
      for (const c of criteria) {
        if (!isRecord(c))
          continue;
        cTotal += 1;
        if (parseCriterionStatus(c["status"]) === "pass")
          cPassed += 1;
      }
    }
    totalCriteria += cTotal;
    passedCriteria += cPassed;
    const goalStatus = typeof goal.status === "string" ? goal.status : "unknown";
    if (!isUlwLoopGoalComplete(goalStatus))
      hasIncomplete = true;
    goals.push({
      id: typeof goal.id === "string" ? goal.id : "",
      label: typeof goal.label === "string" ? goal.label : "(unlabeled goal)",
      status: goalStatus,
      criteriaTotal: cTotal,
      criteriaPassed: cPassed
    });
  }
  if (!hasIncomplete && goals.length > 0)
    return null;
  return {
    kind: "ulw-loop",
    goalsPath,
    ledgerPath: join(cwd, ".omo", "ulw-loop", "ledger.jsonl"),
    goals,
    totalCriteria,
    passedCriteria,
    degraded: false
  };
}
function degradedUlwLoop(cwd, goalsPath) {
  return {
    kind: "ulw-loop",
    goalsPath,
    ledgerPath: join(cwd, ".omo", "ulw-loop", "ledger.jsonl"),
    goals: [],
    totalCriteria: 0,
    passedCriteria: 0,
    degraded: true
  };
}
function parseUlwLoopPlan(value) {
  if (!isRecord(value))
    return null;
  const goals = parseGoalArray(value["goals"]);
  if (goals === null)
    return null;
  return { goals };
}
function parseGoalArray(value) {
  if (!Array.isArray(value))
    return null;
  const goals = [];
  for (const item of value) {
    if (!isRecord(item))
      continue;
    goals.push({
      id: item["id"],
      label: item["label"] ?? item["title"] ?? item["description"],
      status: item["status"],
      successCriteria: item["successCriteria"] ?? item["criteria"]
    });
  }
  return goals;
}
function parseCriterionStatus(value) {
  if (value === "pending" || value === "pass" || value === "fail" || value === "blocked")
    return value;
  return null;
}
function isUlwLoopGoalComplete(status) {
  return status === "complete" || status === "completed" || status === "pass";
}
function safeReadText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/hook.ts
var PROMPT_STATE_PATH = ".omo/.lazyz-prompts.json";
var ONE_DAY_MS = 24 * 60 * 60 * 1000;
var LOCAL_MCP_SERVERS = [
  { name: "codegraph", dist: "components/codegraph/dist/serve.js" },
  { name: "git_bash", dist: "components/git-bash/dist/cli.js" },
  { name: "lsp", dist: "components/lsp/dist/cli.js" }
];
function runSessionStartResume(input, options = {}) {
  const now = (options.now ?? new Date).getTime();
  const lines = [];
  const resumeLine = maybeResumeLine(input.cwd, now);
  if (resumeLine !== null)
    lines.push(resumeLine);
  const initLine = maybeInitDeepSuggestion(input.cwd, now);
  if (initLine !== null)
    lines.push(initLine);
  if (options.pluginRoot !== undefined && options.pluginRoot.length > 0) {
    const buildLines = maybeBuildMissingLines(options.pluginRoot, input.cwd, now);
    for (const line of buildLines)
      lines.push(line);
  }
  const qaLine = maybeManualQaNotice(input.cwd, now);
  if (qaLine !== null)
    lines.push(qaLine);
  if (lines.length === 0)
    return "";
  return encodeAdditionalContext(lines.join(`

`));
}
function maybeResumeLine(cwd, nowMs) {
  const snapshot = pickResumableWork(cwd);
  if (snapshot === null)
    return null;
  const key = `resume:${resumeKey(snapshot)}`;
  const lastAt = readPromptedAt(cwd, key);
  if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS)
    return null;
  writePromptedAt(cwd, key, nowMs);
  return renderResumePrompt(snapshot, nowMs, lastAt);
}
function pickResumableWork(cwd) {
  const sw = readInProgressStartWorkLenient(cwd);
  if (sw !== null)
    return sw;
  return readInProgressUlwLoop(cwd);
}
function resumeKey(snapshot) {
  if (snapshot.kind === "start-work") {
    return `start-work:${snapshot.planName}:${snapshot.status ?? "unknown"}`;
  }
  return `ulw-loop:${snapshot.goalsPath}`;
}
function renderResumePrompt(snapshot, nowMs, lastAt) {
  const since = lastAt !== null ? ` (마지막 안내: ${formatElapsed(nowMs - lastAt)} 전)` : "";
  if (snapshot.kind === "start-work") {
    if (snapshot.degraded) {
      return `⏳ LazyZ: 진행 중인 start-work 작업이 있는 것으로 보이나 boulder.json을 완전히 읽지 못했습니다 (${snapshot.boulderPath}). 수동으로 확인해 주세요.${since}`;
    }
    if (snapshot.status === "blocked") {
      const fail = snapshot.failCount ?? 0;
      return `⛔ LazyZ: "${snapshot.planName}" 작업이 blocked 상태입니다 (실패 캡 도달, fail_count=${fail}). continuation이 중단됩니다. status를 "active"로 변경하거나 사용자 판단이 필요합니다.${since}`;
    }
    const { completed, total: total2, nextTaskLabel } = snapshot.checklist;
    const next = nextTaskLabel ?? "(다음 작업 라벨 없음)";
    return `⏳ LazyZ: 진행 중인 작업이 있습니다 — "${snapshot.planName}" (${completed}/${total2} 완료). 다음: ${truncate(next, 80)}.${snapshot.worktreePath !== null ? ` worktree: ${snapshot.worktreePath}.` : ""} 이어서 하시려면 start-work로 진행, 무시하셔도 됩니다.${since}`;
  }
  if (snapshot.degraded) {
    return `⏳ LazyZ: 진행 중인 ulw-loop 작업이 있는 것으로 보이나 goals.json을 완전히 읽지 못했습니다 (${snapshot.goalsPath}).${since}`;
  }
  const total = snapshot.goals.length;
  const incomplete = snapshot.goals.filter((g) => !isComplete(g.status)).length;
  const cr = `${snapshot.passedCriteria}/${snapshot.totalCriteria}`;
  return `⏳ LazyZ: 진행 중인 ulw-loop 작업이 있습니다 — 골 ${incomplete}/${total} 미완료, 크리테리아 ${cr} 통과. 이어서 하시려면 ulw-loop로 진행, 무시하셔도 됩니다.${since}`;
}
function maybeInitDeepSuggestion(cwd, nowMs) {
  if (existsSync2(join2(cwd, "AGENTS.md")))
    return null;
  const key = "init-deep-suggestion";
  const lastAt = readPromptedAt(cwd, key);
  if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS)
    return null;
  writePromptedAt(cwd, key, nowMs);
  return "\uD83D\uDCA1 LazyZ: 이 프로젝트에 `AGENTS.md` 메모리가 없습니다. `init-deep`을 한 번 실행하면 " + "계층적 프로젝트 메모리가 생성되어 이후 계획·실행 품질이 크게 올라갑니다. " + "무시하셔도 됩니다. (최초 9개 스킬 안내는 플러그인 README의 'Start here' 섹션을 보세요.)";
}
function maybeBuildMissingLines(pluginRoot, cwd, nowMs) {
  const missing = [];
  for (const server of LOCAL_MCP_SERVERS) {
    const distPath = join2(pluginRoot, server.dist);
    if (!existsSync2(distPath))
      missing.push(server.name);
  }
  if (missing.length === 0)
    return [];
  const key = `build-missing:${missing.sort().join(",")}`;
  const lastAt = readPromptedAt(cwd, key);
  if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS)
    return [];
  writePromptedAt(cwd, key, nowMs);
  const list = missing.join(", ");
  return [
    `⚠️ LazyZ: 로컬 MCP 서버가 빌드되지 않았습니다 (${list}). 이 서버들은 \`required: false\`라 조용히 스킵됩니다. 기능이 필요하면 \`cd plugins/lazyz && npm install && npm run build\` 후 ZCode를 재시작하세요. 무시하셔도 됩니다.`
  ];
}
function maybeManualQaNotice(cwd, nowMs) {
  const sw = readInProgressStartWorkLenient(cwd);
  if (sw === null || sw.checklist.completed !== 0)
    return null;
  const key = `manual-qa-notice:start-work:${sw.planName}`;
  const lastAt = readPromptedAt(cwd, key);
  if (lastAt !== null && nowMs - lastAt < ONE_DAY_MS)
    return null;
  writePromptedAt(cwd, key, nowMs);
  return `ℹ️ LazyZ: 이 작업의 사용자 노출 체크박스는 각각 Manual-QA 증거가 필요합니다 — HTTP(curl), tmux, browser, computer-use 중 해당 채널을 준비해 주세요. (CLI/데이터 형태는 보조 증거 허용; --dry-run은 증불가) 무시하셔도 됩니다.`;
}
function isComplete(status) {
  return status === "complete" || status === "completed" || status === "pass";
}
function formatElapsed(ms) {
  if (ms < 60000)
    return "방금";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60)
    return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `${hours}시간`;
  const days = Math.floor(hours / 24);
  return `${days}일`;
}
function truncate(text, max) {
  const trimmed = text.trim();
  if (trimmed.length <= max)
    return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}
function readPromptedAt(cwd, key) {
  const path = join2(cwd, PROMPT_STATE_PATH);
  if (!existsSync2(path))
    return null;
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    if (!isRecord2(parsed))
      return null;
    const v = parsed[key];
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}
function writePromptedAt(cwd, key, ms) {
  const path = join2(cwd, PROMPT_STATE_PATH);
  const state = {};
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    if (isRecord2(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "number")
          state[k] = v;
      }
    }
  } catch {}
  state[key] = ms;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}
`);
  } catch {}
}
function encodeAdditionalContext(text) {
  if (text.length === 0)
    return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text
    }
  });
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/cli.ts
var command = process.argv[2];
if (command === "hook" && process.argv[3] === "session-start") {
  await runHookCli();
} else if (command === "query") {
  runQueryCli(process.argv[3] ?? process.cwd());
} else {
  process.stderr.write(`Usage: lazyz-work-status hook session-start | query [cwd]
`);
  process.exitCode = 1;
}
async function runHookCli() {
  const raw = await readStdin();
  if (raw.trim().length === 0)
    return;
  const parsed = parseJson(raw);
  if (!isSessionStartInput(parsed))
    return;
  const pluginRoot = process.env["ZCODE_PLUGIN_ROOT"] ?? process.env["CLAUDE_PLUGIN_ROOT"] ?? "";
  const output = runSessionStartResume(parsed, {
    pluginRoot: pluginRoot.length > 0 ? pluginRoot : undefined
  });
  if (output.length > 0)
    processStdout.write(output);
}
function isSessionStartInput(value) {
  return isRecord3(value) && value["hook_event_name"] === "SessionStart" && typeof value["session_id"] === "string" && typeof value["cwd"] === "string";
}
function runQueryCli(cwd) {
  const startWork = readInProgressStartWork(cwd);
  if (startWork !== null) {
    processStdout.write(`${JSON.stringify(serializeStartWork(startWork))}
`);
    return;
  }
  const ulwLoop = readInProgressUlwLoop(cwd);
  if (ulwLoop !== null) {
    processStdout.write(`${JSON.stringify(serializeUlwLoop(ulwLoop))}
`);
    return;
  }
  processStdout.write(`${JSON.stringify({ work: "none" })}
`);
}
function serializeStartWork(s) {
  if (s === null)
    return null;
  return {
    kind: s.kind,
    planName: s.planName,
    planPath: s.planPath,
    status: s.status ?? "unknown",
    worktreePath: s.worktreePath,
    progress: {
      completed: s.checklist.completed,
      remaining: s.checklist.remaining,
      total: s.checklist.total,
      nextTaskLabel: s.checklist.nextTaskLabel
    }
  };
}
function serializeUlwLoop(s) {
  if (s === null)
    return null;
  return {
    kind: s.kind,
    goalsPath: s.goalsPath,
    goals: s.goals,
    criteria: {
      passed: s.passedCriteria,
      total: s.totalCriteria
    }
  };
}
function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return;
  }
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readStdin() {
  return new Promise((resolve2, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.once("error", reject);
    process.stdin.once("end", () => resolve2(data));
  });
}
