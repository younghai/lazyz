#!/usr/bin/env node

// components/start-work-continuation/src/cli.ts
import { existsSync as existsSync4, mkdirSync, readFileSync as readFileSync5, renameSync, rmSync, writeFileSync } from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";

// components/start-work-continuation/src/boulder-reader.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

// components/start-work-continuation/src/plan-checklist.ts
import { existsSync, readFileSync } from "node:fs";
var TODO_HEADING = "TODOs";
var FINAL_VERIFICATION_HEADING = "Final Verification Wave";
var CHECKBOX_PREFIX_LENGTH = "- [ ] ".length;
function getPlanChecklist(planPath) {
  if (!existsSync(planPath))
    return emptyChecklist();
  try {
    return parsePlanChecklist(readFileSync(planPath, "utf8"));
  } catch (error) {
    if (error instanceof Error)
      return emptyChecklist();
    throw error;
  }
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
    if (checkbox.checked)
      completed += 1;
    else {
      remaining += 1;
      nextTaskLabel = nextTaskLabel ?? checkbox.label;
    }
  }
  return { completed, remaining, total: completed + remaining, nextTaskLabel };
}
function parseTopLevelCheckbox(line) {
  if (line.startsWith("- [ ] "))
    return { checked: false, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
  if (line.startsWith("- [x] ") || line.startsWith("- [X] "))
    return { checked: true, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
  return null;
}
function parseLevelTwoHeading(line) {
  return line.startsWith("## ") ? line.slice("## ".length).trim() : null;
}
function isCountedHeading(heading) {
  return heading === TODO_HEADING || heading === FINAL_VERIFICATION_HEADING;
}
function emptyChecklist() {
  return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
}

// components/start-work-continuation/src/boulder-reader.ts
var SESSION_ID_PREFIX_PATTERN = /^(codex|opencode):/;
function readContinuationState(cwd, sessionId) {
  const boulderPath = getBoulderFilePath(cwd);
  const boulderState = readBoulderState(boulderPath);
  if (boulderState === null)
    return null;
  const work = getWorkForSession(boulderState, normalizeSessionId(sessionId, "codex"));
  if (work === null || !isContinuableStatus(work.status))
    return null;
  const planPath = resolveBoulderPlanPathForWork(cwd, work);
  const checklist = getPlanChecklist(planPath);
  if (checklist.remaining === 0)
    return null;
  return {
    workId: work.workId,
    planName: work.planName,
    planPath,
    boulderPath,
    ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
    worktreePath: work.worktreePath ?? null,
    checklist
  };
}
function readBoulderState(path) {
  try {
    const parsed = JSON.parse(readFileSync2(path, "utf8"));
    return parseBoulderState(parsed);
  } catch (error) {
    if (error instanceof Error)
      return null;
    throw error;
  }
}
function parseBoulderState(value) {
  if (!isRecord(value))
    return null;
  const works = [];
  const worksValue = value["works"];
  const hasWorksMap = isRecord(worksValue);
  if (hasWorksMap) {
    for (const [workId, workValue] of Object.entries(worksValue)) {
      const work = parseBoulderWork(workValue, workId);
      if (work !== null)
        works.push(work);
    }
  }
  const mirrorWork = parseBoulderWork(value);
  if (works.length === 0 && mirrorWork === null)
    return null;
  return { works, mirrorWork, hasWorksMap };
}
function parseBoulderWork(value, fallbackWorkId) {
  if (!isRecord(value))
    return null;
  const activePlan = value["active_plan"];
  const workId = value["work_id"];
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
    workId: typeof workId === "string" ? workId : fallbackWorkId ?? null,
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
function getWorkForSession(state, normalizedSessionId) {
  let newestWork = null;
  let newestWorkMs = 0;
  for (const work of state.works) {
    if (!work.sessionIds.includes(normalizedSessionId))
      continue;
    const workMs = parseIsoToMs(work.updatedAt ?? work.startedAt) ?? 0;
    if (newestWork === null || workMs > newestWorkMs) {
      newestWork = work;
      newestWorkMs = workMs;
    }
  }
  if (newestWork !== null)
    return newestWork;
  if (state.hasWorksMap)
    return null;
  if (state.mirrorWork?.sessionIds.includes(normalizedSessionId) === true)
    return state.mirrorWork;
  return null;
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
  return existsSync2(worktreePlanPath) ? worktreePlanPath : absolutePlanPath;
}
function resolveTrackedPath(baseDirectory, trackedPath) {
  return isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(baseDirectory, trackedPath);
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
      sessionIds.push(normalizeSessionId(item));
  }
  return sessionIds;
}
function normalizeSessionId(sessionId, platform = "opencode") {
  if (SESSION_ID_PREFIX_PATTERN.test(sessionId))
    return sessionId;
  return `${platform}:${sessionId}`;
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
function getBoulderFilePath(cwd) {
  return join(cwd, ".omo", "boulder.json");
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/start-work-continuation/src/continuation-counter.ts
import { join as join2 } from "node:path";
var DEFAULT_MAX_CONTINUATIONS = 10;
var MAX_CONTINUATIONS_ENV = "LAZYZ_START_WORK_MAX_CONTINUATIONS";
function resolveMaxContinuations(env = process.env) {
  const raw = env[MAX_CONTINUATIONS_ENV];
  if (raw === undefined || raw.trim() === "")
    return DEFAULT_MAX_CONTINUATIONS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed))
    return DEFAULT_MAX_CONTINUATIONS;
  return parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}
function readContinuationCount(cwd, sessionId, fs) {
  const statePath = getStatePath(cwd, sessionId);
  if (!fs.existsSync(statePath))
    return { continuations: 0, updatedAt: "" };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (isContinuationCountState(parsed))
      return parsed;
    return { continuations: 0, updatedAt: "" };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error)
      return { continuations: 0, updatedAt: "" };
    throw error;
  }
}
function incrementContinuationCount(cwd, sessionId, fs) {
  const current = readContinuationCount(cwd, sessionId, fs);
  writeContinuationCount(cwd, sessionId, { continuations: current.continuations + 1, updatedAt: new Date().toISOString() }, fs);
}
function clearContinuationCount(cwd, sessionId, fs) {
  fs.rmSync(getStatePath(cwd, sessionId), { force: true });
}
function writeContinuationCount(cwd, sessionId, state, fs) {
  const stateDir = getStateDir(cwd);
  const statePath = getStatePath(cwd, sessionId);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(stateDir, { recursive: true, mode: 448 });
  fs.writeFileSync(tempPath, `${JSON.stringify(state)}
`);
  fs.renameSync(tempPath, statePath);
}
function getStatePath(cwd, sessionId) {
  return join2(getStateDir(cwd), `${sanitizeKey(sessionId)}.json`);
}
function getStateDir(cwd) {
  return join2(cwd, ".omo", "start-work-continuation");
}
function sanitizeKey(value) {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "missing";
}
function isContinuationCountState(value) {
  return isRecord2(value) && typeof value["continuations"] === "number" && Number.isInteger(value["continuations"]) && (typeof value["updatedAt"] === "string" || value["updatedAt"] === undefined);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/start-work-continuation/src/directive.ts
import { readFileSync as readFileSync3 } from "node:fs";
var START_WORK_CONTINUATION_DIRECTIVE = readFileSync3(new URL("../directive.md", import.meta.url), "utf8");

// components/start-work-continuation/src/executor-exhaustion.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync3, readdirSync, readFileSync as readFileSync4 } from "node:fs";
import { join as join3 } from "node:path";
function hasOnlyExhaustedExecutorTasks(cwd, sessionId, workId) {
  if (workId === null)
    return false;
  const directory = join3(cwd, ".omo", "lazycodex-executor-verify", "tasks", digest(sessionId));
  if (!existsSync3(directory))
    return false;
  try {
    const states = readdirSync(directory).filter((entry) => entry.endsWith(".json")).flatMap((entry) => {
      const state = parseState(readFileSync4(join3(directory, entry), "utf8"));
      return state?.workId === workId ? [state] : [];
    });
    const unresolved = states.filter((state) => !state.passed);
    return unresolved.length > 0 && unresolved.every((state) => state.exhausted);
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function parseState(raw) {
  try {
    const value = JSON.parse(raw);
    if (!isRecord3(value) || !isRecord3(value["contract"]) || !Array.isArray(value["runs"]))
      return null;
    const workId = value["contract"]["workId"];
    if (typeof workId !== "string" || typeof value["exhausted"] !== "boolean")
      return null;
    const passed = value["runs"].some((run) => isRecord3(run) && run["status"] === "passed");
    return { workId, passed, exhausted: value["exhausted"] };
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/start-work-continuation/src/codex-hook.ts
function runStopHook(input, fs) {
  if (!isStopInput(input))
    return "";
  if (input.stop_hook_active)
    return "";
  if (input.transcript_path !== undefined && transcriptHasContextPressureMarker(input.transcript_path, fs))
    return "";
  const state = readContinuationState(input.cwd, input.session_id);
  if (state === null) {
    clearContinuationCount(input.cwd, input.session_id, fs);
    return "";
  }
  if (hasOnlyExhaustedExecutorTasks(input.cwd, input.session_id, state.workId))
    return "";
  const maxContinuations = resolveMaxContinuations();
  if (maxContinuations !== Number.POSITIVE_INFINITY) {
    const count = readContinuationCount(input.cwd, input.session_id, fs);
    if (count.continuations >= maxContinuations)
      return "";
  }
  incrementContinuationCount(input.cwd, input.session_id, fs);
  return JSON.stringify({
    decision: "block",
    reason: renderDirective(state, input.session_id)
  });
}
function renderDirective(state, sessionId) {
  const lineBreak = String.fromCharCode(10);
  const worktreeBlock = state.worktreePath === null ? "" : `${lineBreak}- Worktree: \`${state.worktreePath}\` (all edits, tests, and commands run inside this directory)`;
  const replacements = {
    PLAN_NAME: state.planName,
    PLAN_PATH: state.planPath,
    BOULDER_PATH: state.boulderPath,
    REMAINING_COUNT: String(state.checklist.remaining),
    TOTAL_COUNT: String(state.checklist.total),
    NEXT_TASK_LABEL: state.checklist.nextTaskLabel ?? "",
    WORKTREE_BLOCK: worktreeBlock,
    LEDGER_PATH: state.ledgerPath,
    SESSION_ID: sessionId
  };
  let rendered = START_WORK_CONTINUATION_DIRECTIVE;
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${placeholder}}}`, value);
  }
  return rendered;
}
var CONTEXT_PRESSURE_MARKERS = [
  "context compacted",
  "context_length_exceeded",
  "skill descriptions were shortened",
  "context_too_large",
  "codex ran out of room in the model's context window",
  "your input exceeds the context window",
  "long threads and multiple compactions"
];
function transcriptHasContextPressureMarker(transcriptPath, fs) {
  try {
    const transcript = fs.readFileSync(transcriptPath, "utf8").toLowerCase();
    return CONTEXT_PRESSURE_MARKERS.some((marker) => transcript.includes(marker));
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function isStopInput(value) {
  return isRecord4(value) && isStopHookEventName(value["hook_event_name"]) && typeof value["session_id"] === "string" && (value["turn_id"] === undefined || typeof value["turn_id"] === "string") && (value["transcript_path"] === undefined || typeof value["transcript_path"] === "string") && typeof value["cwd"] === "string" && (value["model"] === undefined || typeof value["model"] === "string") && typeof value["permission_mode"] === "string" && typeof value["stop_hook_active"] === "boolean" && optionalString(value["last_assistant_message"]);
}
function isStopHookEventName(value) {
  return value === "Stop" || value === "SubagentStop";
}
function optionalString(value) {
  return value === undefined || typeof value === "string";
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/start-work-continuation/src/cli.ts
var nodeFileSystem = {
  readFileSync(path, encoding) {
    return readFileSync5(path, encoding);
  },
  existsSync(path) {
    return existsSync4(path);
  },
  mkdirSync(path, options) {
    mkdirSync(path, options);
  },
  writeFileSync(path, data) {
    writeFileSync(path, data);
  },
  renameSync(from, to) {
    renameSync(from, to);
  },
  rmSync(path, options) {
    rmSync(path, options);
  }
};
var command = process.argv[2];
var subcommand = process.argv[3];
if (command === "hook" && (subcommand === "stop" || subcommand === "subagent-stop")) {
  await runHookCli();
} else {
  process.stderr.write(`Usage: omo-start-work-continuation hook <stop|subagent-stop>
`);
  process.exitCode = 1;
}
async function runHookCli() {
  const raw = await readStdin();
  if (raw.trim().length === 0)
    return;
  const parsed = parseHookInput(raw);
  const output = runStopHook(parsed, nodeFileSystem);
  if (output.length > 0)
    processStdout.write(output);
}
function parseHookInput(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError)
      return;
    throw error;
  }
}
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    processStdin.setEncoding("utf8");
    processStdin.on("data", (chunk) => {
      data += chunk;
    });
    processStdin.once("error", () => resolve(data));
    processStdin.once("end", () => resolve(data));
  });
}
