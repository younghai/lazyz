#!/usr/bin/env node

// components/ulw-loop/src/cli-arg-parser.ts
import { readFile } from "node:fs/promises";
// components/ulw-loop/src/constants.ts
var ULW_LOOP_DIR = ".omo/ulw-loop";
var ULW_LOOP_BRIEF = "brief.md";
var ULW_LOOP_GOALS = "goals.json";
var ULW_LOOP_LEDGER = "ledger.jsonl";
var ULW_LOOP_STEERING_MUTATION_KINDS = [
  "add_subgoal",
  "split_subgoal",
  "reorder_pending",
  "revise_pending_wording",
  "revise_criterion",
  "annotate_ledger",
  "mark_blocked_superseded"
];
var ULW_LOOP_SUCCESS_CRITERION_USER_MODELS = [
  "happy",
  "edge",
  "regression",
  "adversarial"
];
// components/ulw-loop/src/runtime.ts
class UlwLoopError extends Error {
  constructor(message, code, opts) {
    super(message, opts?.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "UlwLoopError";
    this.code = code;
    if (opts?.details !== undefined) {
      this.details = opts.details;
    }
  }
}
function iso() {
  return new Date().toISOString();
}
// components/ulw-loop/src/cli-arg-parser.ts
var VALUE_FLAGS = new Set("--brief --brief-file --session-id --codex-goal-mode --goal --goal-id --criterion-id --status --evidence --notes --codex-goal-json --quality-gate-json --kind --rationale --title --objective --target-goal-id --source --after-json --directive-json --directive-file --idempotency-key".split(" "));
var SUBCOMMANDS = new Set("create-goals status complete-goals criteria record-evidence checkpoint steer add-goal record-review-blockers quality-context".split(" "));
function hasFlag(argv, flag) {
  return argv.includes(flag);
}
function readValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    const next = argv[index + 1];
    return next === undefined || next.startsWith("--") ? undefined : next;
  }
  const prefix = `${flag}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
function parseGoalArg(argv) {
  return readValue(argv, "--goal-id") ?? readValue(argv, "--goal");
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function positionalText(argv) {
  const words = [];
  for (let index = SUBCOMMANDS.has(argv[0] ?? "") ? 1 : 0;index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined)
      continue;
    if (VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("--"))
      continue;
    words.push(arg);
  }
  return words.join(" ").trim();
}
function looksLikeJson(value) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
async function readJsonInput(value) {
  if (value === undefined)
    return;
  try {
    return JSON.parse(looksLikeJson(value) ? value : await readFile(value, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new UlwLoopError(`Invalid JSON input: ${message}`, "ULW_LOOP_JSON_INPUT_INVALID", { cause: error });
  }
}
async function parseCodexGoalJson(value) {
  if (value === undefined)
    return;
  const raw = looksLikeJson(value) ? value : await readFile(value, "utf8");
  try {
    JSON.parse(raw);
    return raw;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new UlwLoopError(`Invalid --codex-goal-json: ${message}`, "ULW_LOOP_CODEX_GOAL_JSON_INVALID", { cause: error });
  }
}
function required(argv, flag, code) {
  const value = readValue(argv, flag)?.trim();
  if (value)
    return value;
  throw new UlwLoopError(`Missing ${flag}.`, code, { details: { flag } });
}
function evidenceStatus(value) {
  switch (value) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "blocked":
      return "blocked";
    default:
      throw new UlwLoopError("Invalid --status; expected pass, fail, or blocked.", "ULW_LOOP_EVIDENCE_STATUS_INVALID", { details: { status: value } });
  }
}
function parseRecordEvidenceArgs(argv) {
  const result = { goalId: required(argv, "--goal-id", "ULW_LOOP_GOAL_ID_REQUIRED"), criterionId: required(argv, "--criterion-id", "ULW_LOOP_CRITERION_ID_REQUIRED"), status: evidenceStatus(required(argv, "--status", "ULW_LOOP_EVIDENCE_STATUS_REQUIRED")), evidence: required(argv, "--evidence", "ULW_LOOP_EVIDENCE_REQUIRED") };
  const notes = readValue(argv, "--notes")?.trim();
  return notes ? { ...result, notes } : result;
}

// components/ulw-loop/src/cli-output.ts
var ULW_LOOP_HELP = `Usage:
  lazyz ulw-loop create-goals --brief "..." [--brief-file <path>] [--from-stdin] [--codex-goal-mode aggregate|per_story] [--force] [--json]
  lazyz ulw-loop status [--json]
  lazyz ulw-loop complete-goals [--retry-failed] [--json]
  lazyz ulw-loop criteria --goal-id <id> [--json]
  lazyz ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status pass|fail|blocked --evidence "..." [--notes "..."] [--json]
  lazyz ulw-loop quality-context --goal-id <final-id> --json
  lazyz ulw-loop checkpoint --goal-id <id> --status complete|failed|blocked --evidence "..." --codex-goal-json <...> [--quality-gate-json <...>] [--json]
  lazyz ulw-loop steer --kind <kind> ... --evidence "..." --rationale "..." [--json]
  lazyz ulw-loop add-goal --title "..." --objective "..." [--json]
  lazyz ulw-loop record-review-blockers --goal-id <id> --title "..." --objective "..." --evidence "..." --codex-goal-json <...> [--json]

All subcommands accept [--session-id <id>] to isolate state under .omo/ulw-loop/<id>/; without it, Codex session env is used when present.`;
function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function printJsonError(error) {
  if (error instanceof UlwLoopError) {
    printJson({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...error.details === undefined ? {} : { details: error.details }
      }
    });
    return;
  }
  if (error instanceof Error) {
    printJson({ ok: false, error: { code: "ULW_LOOP_UNEXPECTED", message: error.message } });
    return;
  }
  printJson({ ok: false, error: { code: "ULW_LOOP_UNKNOWN", message: "unknown error" } });
}
function criteriaCounts(goal) {
  let pass = 0;
  for (const criterion of goal.successCriteria)
    if (criterion.status === "pass")
      pass += 1;
  return { pass, total: goal.successCriteria.length };
}
function printStatus(plan) {
  let totalCriteria = 0;
  let passCriteria = 0;
  const lines = ["ulw-loop status", "", "goals:"];
  for (const goal of plan.goals) {
    const counts = criteriaCounts(goal);
    totalCriteria += counts.total;
    passCriteria += counts.pass;
    const marker = goal.id === plan.activeGoalId ? "*" : "-";
    lines.push(`${marker} ${goal.id} [${goal.status}] ${goal.title} (criteria: ${counts.pass}/${counts.total})`);
  }
  lines.push("", "summary:", `total goals: ${plan.goals.length}`, `criteria: ${passCriteria}/${totalCriteria} pass`);
  process.stdout.write(`${lines.join(`
`)}
`);
}
function blockedDecisionHandoff(plan) {
  const blocked = plan.goals.find((goal) => goal.status === "needs_user_decision" && goal.nonRetriable);
  if (blocked === undefined)
    return "";
  return [
    "ulw-loop: blocked on repeated external authorization; no retryable failed goals remain.",
    `Goal: ${blocked.id} - ${blocked.title}`,
    `Required external decision: ${blocked.requiredExternalDecision ?? "provide the missing authorization or choose a different unblock path"}.`,
    "Do not run complete-goals --retry-failed again until external state changes or the user authorizes an unblock path."
  ].join(`
`);
}
function normalizeCodexGoalMode(value) {
  if (value === undefined)
    return "aggregate";
  if (value === "aggregate" || value === "per_story")
    return value;
  throw new UlwLoopError("Invalid --codex-goal-mode; expected aggregate or per_story.", "ULW_LOOP_CODEX_GOAL_MODE_INVALID", { details: { value } });
}

// components/ulw-loop/src/cli-subcommands.ts
import { readFile as readFile4 } from "node:fs/promises";

// components/ulw-loop/src/checkpoint.ts
import { existsSync as existsSync2 } from "node:fs";
import { readFile as readFile3 } from "node:fs/promises";
import { resolve as resolve6 } from "node:path";

// components/lazycodex-executor-verify/dist/git-provenance.js
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants as constants2, fstatSync, lstatSync, openSync, readlinkSync, readSync } from "node:fs";
import { join } from "node:path";
var MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
var MAX_FILE_BYTES = 8 * 1024 * 1024;
var MAX_TOTAL_FILE_BYTES = 32 * 1024 * 1024;
var MAX_UNTRACKED_FILES = 2000;
var SOURCE_PATHS = [
  ".",
  ":(exclude).omo/evidence",
  ":(exclude).omo/ulw-loop",
  ":(exclude).omo/lazycodex-executor-verify"
];

class ProvenanceBudgetError extends Error {
  constructor() {
    super(...arguments);
    this.name = "ProvenanceBudgetError";
  }
}
function gitOutput(cwd, args, counters) {
  counters.gitCalls += 1;
  const output = execFileSync("git", ["-C", cwd, ...args], {
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 1000,
    stdio: ["ignore", "pipe", "ignore"]
  });
  counters.gitOutputBytes += output.length;
  return output;
}
function gitText(cwd, args, counters) {
  return gitOutput(cwd, args, counters).toString("utf8").trim();
}
function updateFingerprint(hash, label, value) {
  const content = typeof value === "string" ? Buffer.from(value) : value;
  hash.update(`${label}\x00${content.length}\x00`);
  hash.update(content);
}
function nonRegularType(stat) {
  if (stat.isFIFO())
    return "fifo";
  if (stat.isSocket())
    return "socket";
  if (stat.isCharacterDevice())
    return "character-device";
  if (stat.isBlockDevice())
    return "block-device";
  if (stat.isDirectory())
    return "directory";
  return "other";
}
function fingerprintUntrackedContent(path, stat) {
  if (stat.isSymbolicLink())
    return readlinkSync(path);
  if (stat.isFile()) {
    if (stat.size > MAX_FILE_BYTES)
      throw new ProvenanceBudgetError("untracked file exceeds byte budget");
    const fd = openSync(path, constants2.O_RDONLY | constants2.O_NOFOLLOW);
    try {
      const current = fstatSync(fd);
      if (!current.isFile() || current.ino !== stat.ino || current.size !== stat.size) {
        throw new ProvenanceBudgetError("untracked file changed during fingerprint");
      }
      const content = Buffer.alloc(current.size + 1);
      let offset = 0;
      while (offset < content.length) {
        const bytes = readSync(fd, content, offset, content.length - offset, offset);
        if (bytes === 0)
          break;
        offset += bytes;
      }
      const after = fstatSync(fd);
      if (offset !== current.size || after.mtimeMs !== current.mtimeMs || after.size !== current.size) {
        throw new ProvenanceBudgetError("untracked file changed during fingerprint");
      }
      return content.subarray(0, offset);
    } finally {
      closeSync(fd);
    }
  }
  return `non-regular:${nonRegularType(stat)}`;
}
function dirtyTreeFingerprint(cwd, diff, input) {
  const hash = createHash("sha256");
  updateFingerprint(hash, "schema", "lazyz-worktree-v1");
  updateFingerprint(hash, "tracked-diff", diff);
  if (input.paths.length > MAX_UNTRACKED_FILES)
    throw new ProvenanceBudgetError("untracked file count exceeds budget");
  for (const path of [...input.paths].sort()) {
    const absolutePath = join(cwd, path);
    const stat = lstatSync(absolutePath);
    if (stat.isFile() && input.counters.untrackedBytes + stat.size > MAX_TOTAL_FILE_BYTES) {
      throw new ProvenanceBudgetError("untracked files exceed total byte budget");
    }
    const content = fingerprintUntrackedContent(absolutePath, stat);
    input.counters.untrackedFiles += 1;
    if (stat.isFile())
      input.counters.untrackedBytes += Buffer.byteLength(content);
    updateFingerprint(hash, "untracked-path", path);
    updateFingerprint(hash, "untracked-mode", (stat.mode & 65535).toString(8));
    updateFingerprint(hash, "untracked-content", content);
  }
  return hash.digest("hex");
}
function inspectGitProvenance(cwd) {
  const started = performance.now();
  const counters = { gitCalls: 0, gitOutputBytes: 0, untrackedFiles: 0, untrackedBytes: 0 };
  try {
    const commitSha = gitText(cwd, ["rev-parse", "HEAD"], counters);
    const headTreeOid = gitText(cwd, ["rev-parse", "HEAD^{tree}"], counters);
    const diff = gitOutput(cwd, ["diff", "--binary", "HEAD", "--", ...SOURCE_PATHS], counters);
    const untrackedPaths = gitOutput(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...SOURCE_PATHS], counters).toString("utf8").split("\x00").filter((path) => path.length > 0);
    const treeOid = diff.length === 0 && untrackedPaths.length === 0 ? headTreeOid : dirtyTreeFingerprint(cwd, diff, { paths: untrackedPaths, counters });
    const provenance = commitSha.length > 0 && treeOid.length > 0 ? { commitSha, treeOid } : null;
    return {
      provenance,
      metrics: {
        ...counters,
        durationMs: performance.now() - started,
        status: provenance === null ? "unavailable" : "complete"
      }
    };
  } catch (error) {
    if (error instanceof Error)
      return {
        provenance: null,
        metrics: {
          ...counters,
          durationMs: performance.now() - started,
          status: error instanceof ProvenanceBudgetError ? "budget-exceeded" : "unavailable"
        }
      };
    throw error;
  }
}

// components/ulw-loop/src/paths.ts
import { join as join2 } from "node:path";
var SESSION_ENV_KEYS = ["OMO_ULW_LOOP_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];
function normalizeUlwLoopSessionId(sessionId) {
  const trimmed = sessionId?.trim();
  if (!trimmed)
    return null;
  const pathSegments = trimmed.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  const candidate = (pathSegments.length > 0 ? pathSegments.join("-") : trimmed).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^\.+/, "").replace(/^[.-]+|[.-]+$/g, "");
  return candidate.length > 0 ? candidate : null;
}
function resolveUlwLoopSessionIdFromEnv(env = process.env) {
  for (const key of SESSION_ENV_KEYS) {
    const normalized = normalizeUlwLoopSessionId(env[key]);
    if (normalized !== null)
      return normalized;
  }
  return null;
}
function ulwLoopRelativeDir(scope) {
  const sessionId = normalizeUlwLoopSessionId(scope?.sessionId);
  return sessionId === null ? ULW_LOOP_DIR : `${ULW_LOOP_DIR}/${sessionId}`;
}
function ulwLoopDir(repoRoot, scope) {
  return join2(repoRoot, ulwLoopRelativeDir(scope));
}
function ulwLoopBriefRelativePath(scope) {
  return `${ulwLoopRelativeDir(scope)}/${ULW_LOOP_BRIEF}`;
}
function ulwLoopGoalsRelativePath(scope) {
  return `${ulwLoopRelativeDir(scope)}/${ULW_LOOP_GOALS}`;
}
function ulwLoopLedgerRelativePath(scope) {
  return `${ulwLoopRelativeDir(scope)}/${ULW_LOOP_LEDGER}`;
}
function ulwLoopBriefPath(repoRoot, scope) {
  return join2(ulwLoopDir(repoRoot, scope), ULW_LOOP_BRIEF);
}
function ulwLoopGoalsPath(repoRoot, scope) {
  return join2(ulwLoopDir(repoRoot, scope), ULW_LOOP_GOALS);
}
function ulwLoopLedgerPath(repoRoot, scope) {
  return join2(ulwLoopDir(repoRoot, scope), ULW_LOOP_LEDGER);
}
function repoRelative(absolutePath, repoRoot) {
  const slashPrefix = `${repoRoot}/`;
  const backslashPrefix = `${repoRoot}\\`;
  if (absolutePath.startsWith(slashPrefix))
    return absolutePath.slice(slashPrefix.length).split("\\").join("/");
  if (absolutePath.startsWith(backslashPrefix))
    return absolutePath.slice(backslashPrefix.length).split("\\").join("/");
  return absolutePath.split("\\").join("/");
}

// components/ulw-loop/src/goal-status.ts
var ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE = aggregateCodexObjectiveForScope();
function aggregateCodexObjectiveForScope(scope) {
  return `Complete the durable ulw-loop plan in ${ulwLoopGoalsRelativePath(scope)}, including later accepted/appended stories, under the original brief constraints; use ${ulwLoopLedgerRelativePath(scope)} as the audit trail.`;
}
function codexGoalMode(plan) {
  return plan.codexGoalMode ?? "per_story";
}
function isResolvedStatus(status) {
  return status === "complete";
}
function isSupersededResolved(goal, plan) {
  if (goal.steeringStatus !== "superseded")
    return false;
  const replacements = goal.supersededBy ?? [];
  if (replacements.length === 0)
    return false;
  return replacements.every((id) => {
    const replacement = plan.goals.find((candidate) => candidate.id === id);
    return replacement !== undefined && isResolvedStatus(replacement.status);
  });
}
function isCompletionBlocking(goal, plan) {
  if (goal.steeringStatus === "superseded")
    return !isSupersededResolved(goal, plan);
  if (goal.steeringStatus === "blocked")
    return true;
  return !isResolvedStatus(goal.status);
}
function isCompletionBlockingForFinalCandidate(candidate, finalCandidate, plan) {
  if (candidate.id === finalCandidate.id)
    return false;
  if (candidate.steeringStatus === "superseded") {
    const replacements = candidate.supersededBy ?? [];
    if (replacements.length === 0)
      return true;
    return !replacements.every((id) => {
      if (id === finalCandidate.id)
        return true;
      const replacement = plan.goals.find((goal) => goal.id === id);
      return replacement !== undefined && isResolvedStatus(replacement.status);
    });
  }
  return isCompletionBlocking(candidate, plan);
}
function isUlwLoopDone(plan) {
  if (plan.aggregateCompletion?.status === "complete")
    return true;
  return plan.goals.every((goal) => !isCompletionBlocking(goal, plan));
}
function isFinalRunCompletionCandidate(plan, goal) {
  return isCompletionBlocking(goal, plan) && plan.goals.every((candidate) => !isCompletionBlockingForFinalCandidate(candidate, goal, plan));
}
function aggregateCodexObjective(plan) {
  return plan.codexObjective ?? ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE;
}
function expectedCodexObjective(plan, goal) {
  return codexGoalMode(plan) === "aggregate" ? aggregateCodexObjective(plan) : goal.objective;
}
function compatibleCodexObjectives(plan) {
  return [aggregateCodexObjective(plan), ...plan.codexObjectiveAliases ?? []];
}
function hasAllCriteriaPass(goal) {
  return goal.successCriteria.length > 0 && goal.successCriteria.every((criterion) => criterion.status === "pass");
}
function isEssentialCriterion(criterion) {
  return criterion.essential ?? true;
}
function essentialCriteriaOf(goal) {
  const explicit = goal.successCriteria.filter(isEssentialCriterion);
  if (explicit.length > 0)
    return explicit;
  const happy = goal.successCriteria.find((criterion) => criterion.userModel === "happy");
  return happy === undefined ? [] : [happy];
}
function hasEssentialCriteriaPass(goal) {
  const criteria = essentialCriteriaOf(goal);
  return criteria.length > 0 && criteria.every((criterion) => criterion.status === "pass");
}

// components/ulw-loop/src/mutation-lock.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID as randomUUID2 } from "node:crypto";
import { constants as constants4 } from "node:fs";
import { open as open2, rename as rename2, rm as rm2, unlink } from "node:fs/promises";
import { join as join3, resolve as resolve2 } from "node:path";

// components/ulw-loop/src/state-path.ts
import { randomUUID } from "node:crypto";
import { constants as constants3 } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function pathEscape(path, cause) {
  return new UlwLoopError(`Refusing unsafe ulw-loop state path: ${path}.`, "ULW_LOOP_PATH_ESCAPE", {
    ...cause === undefined ? {} : { cause },
    details: { path }
  });
}
function isWithinRoot(path, root) {
  const child = relative(root, path);
  return child === "" || !child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child);
}
async function assertSafeUlwLoopPath(repoRoot, targetPath) {
  const lexicalRoot = resolve(repoRoot);
  const lexicalTarget = resolve(targetPath);
  if (!isWithinRoot(lexicalTarget, lexicalRoot))
    throw pathEscape(lexicalTarget);
  const actualRoot = await realpath(lexicalRoot);
  const child = relative(lexicalRoot, lexicalTarget);
  let current = lexicalRoot;
  for (const segment of child.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink())
        throw pathEscape(current);
      const actual = await realpath(current);
      if (!isWithinRoot(actual, actualRoot))
        throw pathEscape(current);
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        return;
      throw error;
    }
  }
}
async function ensureUlwLoopStateDir(repoRoot, scope) {
  const directory = ulwLoopDir(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, directory);
  await mkdir(directory, { recursive: true, mode: 448 });
  await assertSafeUlwLoopPath(repoRoot, directory);
}
async function assertUlwLoopStatePaths(repoRoot, scope) {
  await Promise.all([
    assertSafeUlwLoopPath(repoRoot, ulwLoopBriefPath(repoRoot, scope)),
    assertSafeUlwLoopPath(repoRoot, ulwLoopGoalsPath(repoRoot, scope)),
    assertSafeUlwLoopPath(repoRoot, ulwLoopLedgerPath(repoRoot, scope))
  ]);
}
async function readSafeTextFile(path) {
  const handle = await open(path, constants3.O_RDONLY | constants3.O_NOFOLLOW);
  try {
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
async function writeSafeTextFile(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, constants3.O_WRONLY | constants3.O_CREAT | constants3.O_EXCL | constants3.O_NOFOLLOW, 384);
  try {
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
async function appendSafeTextFile(path, content) {
  const handle = await open(path, constants3.O_WRONLY | constants3.O_APPEND | constants3.O_CREAT | constants3.O_NOFOLLOW, 384);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}
async function safeFileExists(repoRoot, path) {
  await assertSafeUlwLoopPath(repoRoot, path);
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      return false;
    throw error;
  }
}

// components/ulw-loop/src/mutation-lock.ts
var LOCK_WAIT_MS = 1e4;
var LOCK_RETRY_MS = 20;
var OWNER_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var heldLocks = new AsyncLocalStorage;
function hasCode2(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function mutationLockKey(repoRoot, scope) {
  return `${resolve2(repoRoot)}\x00${ulwLoopRelativeDir(scope)}`;
}
function isCrossProcessMutationLockHeld(repoRoot, scope) {
  return heldLocks.getStore()?.has(mutationLockKey(repoRoot, scope)) ?? false;
}
function parseLockOwner(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
  if (typeof value !== "object" || value === null)
    return null;
  const version = Reflect.get(value, "version");
  const pid = Reflect.get(value, "pid");
  const token = Reflect.get(value, "token");
  const acquiredAt = Reflect.get(value, "acquiredAt");
  if (version !== 1 || typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0 || typeof token !== "string" || !OWNER_TOKEN_PATTERN.test(token) || typeof acquiredAt !== "string")
    return null;
  return { version, pid, token, acquiredAt };
}
function ownerIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode2(error, "ESRCH"))
      return false;
    return true;
  }
}
function waitForRetry() {
  return new Promise((resolveWait) => setTimeout(resolveWait, LOCK_RETRY_MS));
}
function lockWaitMs() {
  const configured = Number.parseInt(process.env["OMO_ULW_LOOP_LOCK_WAIT_MS"] ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 60000) : LOCK_WAIT_MS;
}
async function readOwner(lockPath) {
  try {
    return parseLockOwner(await readSafeTextFile(lockPath));
  } catch (error) {
    if (hasCode2(error, "ENOENT"))
      return;
    throw error;
  }
}
async function tryCreateOwnedFile(path, owner) {
  try {
    const handle = await open2(path, constants4.O_WRONLY | constants4.O_CREAT | constants4.O_EXCL | constants4.O_NOFOLLOW, 384);
    try {
      try {
        await handle.writeFile(`${JSON.stringify(owner)}
`, "utf8");
      } finally {
        await handle.close();
      }
    } catch (error) {
      await rm2(path, { force: true });
      throw error;
    }
    return true;
  } catch (error) {
    if (hasCode2(error, "EEXIST"))
      return false;
    throw error;
  }
}
async function tryAcquireMutationLock(lockPath, owner) {
  const current = await readOwner(lockPath);
  if (current === undefined)
    return tryCreateOwnedFile(lockPath, owner);
  if (current === null || ownerIsAlive(current.pid))
    return false;
  const stalePath = `${lockPath}.${current.token}.stale`;
  await rename2(lockPath, stalePath);
  await rm2(stalePath, { force: true });
  return tryCreateOwnedFile(lockPath, owner);
}
async function releaseOwnedFile(path, owner) {
  const current = await readOwner(path);
  if (current?.token !== owner.token)
    return;
  try {
    await unlink(path);
  } catch (error) {
    if (!hasCode2(error, "ENOENT"))
      throw error;
  }
}
async function acquireLock(lockPath, recoveryPath) {
  const waitMs = lockWaitMs();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const recoveryOwner = {
      version: 1,
      pid: process.pid,
      token: randomUUID2(),
      acquiredAt: new Date().toISOString()
    };
    if (!await tryCreateOwnedFile(recoveryPath, recoveryOwner)) {
      await waitForRetry();
      continue;
    }
    try {
      const owner = {
        version: 1,
        pid: process.pid,
        token: randomUUID2(),
        acquiredAt: new Date().toISOString()
      };
      if (await tryAcquireMutationLock(lockPath, owner))
        return owner;
    } finally {
      await releaseOwnedFile(recoveryPath, recoveryOwner);
    }
    await waitForRetry();
  }
  throw new UlwLoopError("Timed out waiting for the ulw-loop mutation lock.", "ULW_LOOP_LOCK_TIMEOUT", {
    details: { lockPath, waitMs }
  });
}
async function withCrossProcessMutationLock(repoRoot, scope, fn) {
  await ensureUlwLoopStateDir(repoRoot, scope);
  const lockPath = join3(ulwLoopDir(repoRoot, scope), ".mutation.lock");
  const recoveryPath = `${lockPath}.recovery`;
  await assertSafeUlwLoopPath(repoRoot, lockPath);
  await assertSafeUlwLoopPath(repoRoot, recoveryPath);
  const owner = await acquireLock(lockPath, recoveryPath);
  try {
    const key = mutationLockKey(repoRoot, scope);
    const active = new Set(heldLocks.getStore() ?? []);
    active.add(key);
    return await heldLocks.run(active, fn);
  } finally {
    await releaseOwnedFile(lockPath, owner);
  }
}

// components/ulw-loop/src/plan-io.ts
var LEGACY_OBJECTIVE_PREFIX = `Complete all ulw-loop stories in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}: `;
var LEGACY_OBJECTIVE = `Complete all ulw-loop stories listed in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}. Use ${ULW_LOOP_DIR}/${ULW_LOOP_LEDGER} as the durable audit trail.`;
function hasCode3(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function isLegacyEnumeratedAggregateObjective(objective) {
  return objective === LEGACY_OBJECTIVE || Boolean(objective?.startsWith(LEGACY_OBJECTIVE_PREFIX));
}
function isSteeringKind(value) {
  return value === "steering_accepted" || value === "steering_rejected" || value === "criteria_revised";
}
async function withUlwLoopMutationLock(repoRoot, scopeOrFn, maybeFn) {
  const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
  const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
  if (fn === undefined)
    throw new UlwLoopError("Missing ulw-loop mutation body.", "ULW_LOOP_LOCK_BODY_MISSING");
  return withCrossProcessMutationLock(repoRoot, scope, async () => {
    await assertUlwLoopStatePaths(repoRoot, scope);
    return fn();
  });
}
async function readUlwLoopPlan(repoRoot, scope) {
  const path = ulwLoopGoalsPath(repoRoot, scope);
  let raw;
  try {
    await assertSafeUlwLoopPath(repoRoot, path);
    raw = await readSafeTextFile(path);
  } catch (error) {
    if (!hasCode3(error, "ENOENT"))
      throw error;
    throw new UlwLoopError(`No ulw-loop plan found at ${repoRelative(path, repoRoot)}. Run \`lazyz ulw-loop create-goals ...\` first.`, "ULW_LOOP_PLAN_MISSING", { cause: error });
  }
  const parsed = JSON.parse(raw);
  if (parsed.version !== 1 || !Array.isArray(parsed.goals)) {
    throw new UlwLoopError(`Invalid ulw-loop plan at ${repoRelative(path, repoRoot)}.`, "ULW_LOOP_PLAN_INVALID");
  }
  const previousObjective = parsed.codexObjective;
  if ((parsed.codexGoalMode ?? "per_story") === "aggregate" && isLegacyEnumeratedAggregateObjective(previousObjective)) {
    if (!isCrossProcessMutationLockHeld(repoRoot, scope)) {
      return withUlwLoopMutationLock(repoRoot, scope, () => readUlwLoopPlan(repoRoot, scope));
    }
    const now = iso();
    parsed.codexObjective = aggregateCodexObjectiveForScope(scope);
    parsed.codexObjectiveAliases = [...new Set([...parsed.codexObjectiveAliases ?? [], previousObjective])];
    parsed.updatedAt = now;
    await writePlan(repoRoot, parsed, scope);
    await appendLedger(repoRoot, {
      at: now,
      kind: "aggregate_objective_migrated",
      message: "Migrated legacy enumerated aggregate Codex objective to the stable pointer objective.",
      before: { codexObjective: previousObjective },
      after: { codexObjective: parsed.codexObjective }
    }, scope);
  }
  return parsed;
}
async function writePlan(repoRoot, plan, scope) {
  await ensureUlwLoopStateDir(repoRoot, scope);
  const path = ulwLoopGoalsPath(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, path);
  await writeSafeTextFile(path, `${JSON.stringify(plan, null, 2)}
`);
}
async function appendLedger(repoRoot, entry, scope) {
  await ensureUlwLoopStateDir(repoRoot, scope);
  const path = ulwLoopLedgerPath(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, path);
  await appendSafeTextFile(path, `${JSON.stringify(entry)}
`);
}
async function readSteeringLedgerEntries(repoRoot, scope) {
  let raw;
  try {
    const path = ulwLoopLedgerPath(repoRoot, scope);
    await assertSafeUlwLoopPath(repoRoot, path);
    raw = await readSafeTextFile(path);
  } catch (error) {
    if (hasCode3(error, "ENOENT"))
      return [];
    throw error;
  }
  const entries = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const entry = JSON.parse(line);
    if (isSteeringKind(entry.kind))
      entries.push(entry);
  }
  return entries;
}
async function ulwLoopPlanExists(repoRoot, scope) {
  return safeFileExists(repoRoot, ulwLoopGoalsPath(repoRoot, scope));
}
async function writeUlwLoopBrief(repoRoot, brief, scope) {
  await ensureUlwLoopStateDir(repoRoot, scope);
  const path = ulwLoopBriefPath(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, path);
  await writeSafeTextFile(path, brief.endsWith(`
`) ? brief : `${brief}
`);
}
async function readUlwLoopBrief(repoRoot, scope) {
  const path = ulwLoopBriefPath(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, path);
  try {
    return await readSafeTextFile(path);
  } catch (error) {
    if (hasCode3(error, "ENOENT"))
      return null;
    throw error;
  }
}
async function resetUlwLoopLedger(repoRoot, scope) {
  await ensureUlwLoopStateDir(repoRoot, scope);
  const path = ulwLoopLedgerPath(repoRoot, scope);
  await assertSafeUlwLoopPath(repoRoot, path);
  await writeSafeTextFile(path, "");
}

// components/ulw-loop/src/checkpoint-reconciliation.ts
function normalizeObjective(value) {
  return value.replace(/\s+/g, " ").trim();
}
function textMentionsUlwLoopPlanArtifact(value) {
  const normalized = (value ?? "").toLowerCase();
  return normalized.includes(ULW_LOOP_DIR.toLowerCase()) || normalized.includes(ULW_LOOP_GOALS.toLowerCase()) || normalized.includes(ULW_LOOP_LEDGER.toLowerCase());
}
function textMentionsGoalId(value, goalId) {
  return (value ?? "").toLowerCase().includes(goalId.toLowerCase());
}
function textHasCompletionValidationEvidence(value) {
  const normalized = (value ?? "").toLowerCase();
  const done = /\b(?:planned work|implementation|deliverables?|scope|task|work)\b/.test(normalized) && /\b(?:done|complete|completed|finished|shipped)\b/.test(normalized);
  const verified = /\b(?:validation|verification|tests?|build|lint|review|quality gate|code-review)\b/.test(normalized) && /\b(?:passed|complete|completed|clean|green|approve|approved|clear)\b/.test(normalized);
  return done && verified;
}
async function snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope) {
  const actual = normalizeObjective(snapshotObjective).toLowerCase();
  if (textMentionsUlwLoopPlanArtifact(actual))
    return true;
  if (actual.length < 24)
    return false;
  try {
    const rawBrief = await readUlwLoopBrief(repoRoot, scope);
    if (rawBrief === null)
      return false;
    const brief = normalizeObjective(rawBrief).toLowerCase();
    return brief.length >= 24 && (brief.includes(actual) || actual.includes(brief));
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
async function canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, snapshotObjective, evidence, scope) {
  if (codexGoalMode(plan) !== "aggregate")
    return false;
  if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id)
    return false;
  if (isFinalRunCompletionCandidate(plan, goal)) {
    return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
  }
  if (!textMentionsUlwLoopPlanArtifact(evidence) || !textMentionsGoalId(evidence, goal.id))
    return false;
  if (!textHasCompletionValidationEvidence(evidence))
    return false;
  return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}
async function canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, snapshotObjective, evidence, scope) {
  if (codexGoalMode(plan) !== "aggregate")
    return false;
  if (goal.status !== "in_progress" || plan.activeGoalId !== goal.id)
    return false;
  if (!isFinalRunCompletionCandidate(plan, goal))
    return false;
  if (!textHasCompletionValidationEvidence(evidence))
    return false;
  return snapshotObjectiveMapsToUlwLoopPlan(repoRoot, snapshotObjective, scope);
}
function buildCompletedLegacyGoalRemediation(goal) {
  return [
    "If get_goal returns a different completed legacy/thread objective, do not repeat --status complete in this thread.",
    `Record a non-terminal blocker with: lazyz ulw-loop checkpoint --goal-id ${goal.id} --status blocked --evidence "<completed legacy Codex goal blocks create_goal in this thread>" --codex-goal-json "<different completed get_goal JSON or path>".`,
    "Then continue only from a Codex goal context with no active/completed conflicting goal, in the same repo/worktree, and create the intended goal there."
  ].join(" ");
}
function buildTaskScopedAggregateReconciliationHint(goal, final) {
  if (final) {
    return ` Final task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress final OMO goal and the completed get_goal objective to map to the ulw-loop brief or artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
  }
  return ` Completed task-scoped aggregate reconciliation requires the checkpoint goal to be the active in-progress OMO goal, evidence that names that active OMO goal id, names .omo/ulw-loop/goals.json or ledger.jsonl, includes completed implementation plus validation/review evidence, and a get_goal objective that maps to the ulw-loop brief/artifact. ${buildCompletedLegacyGoalRemediation(goal)}`;
}

// components/ulw-loop/src/codex-goal-snapshot.ts
import { existsSync } from "node:fs";
import { readFile as readFile2 } from "node:fs/promises";
import { resolve as resolve3 } from "node:path";

class CodexGoalSnapshotError extends Error {
}
function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function normalizeStatus(value) {
  const status = safeString(value).toLowerCase();
  if (status === "complete" || status === "completed" || status === "done")
    return "complete";
  if (status === "cancelled" || status === "canceled")
    return "cancelled";
  if (status === "failed" || status === "failure")
    return "failed";
  if (status === "active" || status === "in_progress" || status === "pending" || status === "running")
    return "active";
  return "unknown";
}
function normalizeObjective2(value) {
  return value.replace(/\s+/g, " ").trim();
}
function parseCodexGoalSnapshot(value) {
  const root = safeObject(value);
  const goalValue = Object.hasOwn(root, "goal") ? root["goal"] : value;
  if (goalValue === null || goalValue === undefined || goalValue === false) {
    return { available: false, raw: value };
  }
  const goal = safeObject(goalValue);
  const objective = safeString(goal["objective"] ?? goal["goal"] ?? goal["description"] ?? root["objective"]);
  const status = normalizeStatus(goal["status"] ?? root["status"]);
  return {
    available: Boolean(objective || status !== "unknown"),
    ...objective ? { objective } : {},
    status,
    raw: value
  };
}
async function readCodexGoalSnapshotInput(raw, cwd = process.cwd()) {
  if (!raw?.trim())
    return null;
  const trimmed = raw.trim();
  try {
    return parseCodexGoalSnapshot(JSON.parse(trimmed));
  } catch {
    const path = resolve3(cwd, trimmed);
    if (!existsSync(path)) {
      throw new CodexGoalSnapshotError(`Codex goal snapshot is neither valid JSON nor a readable path: ${trimmed}`);
    }
    try {
      return parseCodexGoalSnapshot(JSON.parse(await readFile2(path, "utf-8")));
    } catch (error) {
      throw new CodexGoalSnapshotError(`Codex goal snapshot path does not contain valid JSON: ${trimmed}${error instanceof Error ? ` (${error.message})` : ""}`);
    }
  }
}
function reconcileCodexGoalSnapshot(snapshot, options) {
  const effectiveSnapshot = snapshot ?? { available: false, raw: null };
  const errors = [];
  const warnings = [];
  if (!effectiveSnapshot.available) {
    const message = "Codex goal snapshot is absent or reports no active goal; call get_goal and pass its JSON with --codex-goal-json.";
    if (options.requireSnapshot)
      errors.push(message);
    else
      warnings.push(message);
    return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
  }
  const expected = normalizeObjective2(options.expectedObjective);
  const accepted = new Set([expected, ...(options.acceptedObjectives ?? []).map((objective) => normalizeObjective2(objective))].filter(Boolean));
  const actual = normalizeObjective2(effectiveSnapshot.objective ?? "");
  if (!actual) {
    errors.push("Codex goal snapshot is missing objective text.");
  } else if (!accepted.has(actual)) {
    errors.push(`Codex goal objective mismatch: expected "${expected}", got "${actual}".`);
  }
  const allowed = options.allowedStatuses ?? (options.requireComplete ? ["complete"] : ["active", "complete"]);
  const actualStatus = effectiveSnapshot.status ?? "unknown";
  if (!allowed.includes(actualStatus)) {
    errors.push(`Codex goal status mismatch: expected ${allowed.join(" or ")}, got ${actualStatus}.`);
  }
  if (options.requireComplete && actualStatus !== "complete") {
    errors.push('Codex goal is not complete; call update_goal({status: "complete"}) only after the objective is actually complete, then pass the fresh get_goal JSON.');
  }
  return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
}
function formatCodexGoalReconciliation(reconciliation) {
  const parts = [...reconciliation.errors, ...reconciliation.warnings];
  return parts.join(" ");
}

// components/ulw-loop/src/evidence.ts
function ulwLoopFail(message, code, details) {
  throw new UlwLoopError(message, code, { details });
}
function ledgerKind(status) {
  switch (status) {
    case "pass":
      return "evidence_captured";
    case "fail":
      return "criterion_failed";
    case "blocked":
      return "criterion_blocked";
    default:
      return ulwLoopFail("Invalid criterion status.", "ULW_LOOP_CRITERION_STATUS_INVALID", { status });
  }
}
function findGoal(plan, goalId) {
  const goal = plan.goals.find((candidate) => candidate.id === goalId);
  return goal ?? ulwLoopFail(`UlwLoop goal not found: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { goalId });
}
function findCriterion(goal, criterionId) {
  const criterion = goal.successCriteria.find((candidate) => candidate.id === criterionId);
  return criterion ?? ulwLoopFail(`Success criterion not found: ${criterionId}.`, "ULW_LOOP_CRITERION_NOT_FOUND", {
    goalId: goal.id,
    criterionId
  });
}
function nonEmptyEvidence(evidence) {
  const trimmed = evidence.trim();
  return trimmed || ulwLoopFail("Evidence must be a non-empty string.", "ULW_LOOP_EVIDENCE_REQUIRED", {});
}
async function recordEvidence(repoRoot, args, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const goal = findGoal(plan, args.goalId);
    const criterion = findCriterion(goal, args.criterionId);
    const evidence = nonEmptyEvidence(args.evidence);
    const kind = ledgerKind(args.status);
    const prevStatus = criterion.status;
    const capturedAt = iso();
    criterion.status = args.status;
    criterion.capturedEvidence = evidence;
    criterion.capturedAt = capturedAt;
    if (args.notes !== undefined)
      criterion.notes = args.notes;
    goal.updatedAt = capturedAt;
    plan.updatedAt = capturedAt;
    await writePlan(repoRoot, plan, scope);
    const ledgerEntry = {
      at: capturedAt,
      kind,
      goalId: goal.id,
      criterionId: criterion.id,
      criterionStatus: args.status,
      evidence,
      capturedEvidence: evidence,
      before: { status: prevStatus },
      after: { goalId: goal.id, criterionId: criterion.id, status: args.status, evidence, capturedAt, prevStatus }
    };
    await appendLedger(repoRoot, ledgerEntry, scope);
    return { plan, goal, criterion, ledgerEntry };
  });
}
function unresolvedCriteriaOf(goal) {
  return goal.successCriteria.filter((criterion) => criterion.status !== "pass");
}
function unresolvedEssentialCriteriaOf(goal) {
  const essentialCriteria = new Set(essentialCriteriaOf(goal).map((criterion) => criterion.id));
  return goal.successCriteria.filter((criterion) => essentialCriteria.has(criterion.id) && criterion.status !== "pass");
}
function requireAllCriteriaPass(goal) {
  if (hasAllCriteriaPass(goal))
    return;
  throw new UlwLoopError(`Goal ${goal.id} has unresolved success criteria.`, "ulw_loop_criteria_not_all_pass", {
    details: {
      goalId: goal.id,
      unresolved: unresolvedCriteriaOf(goal).map((criterion) => ({ id: criterion.id, status: criterion.status }))
    }
  });
}
function requireAllPlanCriteriaPass(plan) {
  const unresolved = plan.goals.flatMap((goal) => unresolvedCriteriaOf(goal).map((criterion) => ({
    goalId: goal.id,
    id: criterion.id,
    status: criterion.status
  })));
  if (unresolved.length === 0)
    return;
  throw new UlwLoopError("Ulw-loop aggregate has unresolved success criteria.", "ulw_loop_criteria_not_all_pass", {
    details: { unresolved }
  });
}
function requireEssentialCriteriaPass(goal) {
  if (hasEssentialCriteriaPass(goal))
    return;
  throw new UlwLoopError(`Goal ${goal.id} has unresolved essential success criteria.`, "ulw_loop_criteria_not_all_pass", {
    details: {
      goalId: goal.id,
      unresolved: unresolvedEssentialCriteriaOf(goal).map((criterion) => ({
        id: criterion.id,
        status: criterion.status
      }))
    }
  });
}

// components/ulw-loop/src/quality-gate.ts
import { resolve as resolve4 } from "node:path";

// components/ulw-loop/src/quality-gate-fields.ts
var PLACEHOLDER_PATTERN = /^(?:placeholder|todo|tbd|n\/a|stub)$/i;
function invalid(message, field) {
  throw new UlwLoopError(message, "ULW_LOOP_QUALITY_GATE_INVALID", { details: { field } });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function section(value, field) {
  return isRecord(value) ? value : invalid(`Final quality gate is missing ${field} evidence.`, field);
}
function textField(value, field) {
  if (typeof value !== "string" || value.trim() === "")
    invalid(`Final quality gate requires non-empty ${field}.`, field);
  const trimmed = value.trim();
  if (PLACEHOLDER_PATTERN.test(trimmed))
    invalid(`Final quality gate rejects placeholder ${field}.`, field);
  return trimmed;
}
function numberField(value, field) {
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(`Final quality gate requires numeric ${field}.`, field);
}
function stringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0)
    return invalid(`Final quality gate requires ${field}.`, field);
  return value.map((item) => textField(item, field));
}
function emptyBlockers(value, field) {
  if (Array.isArray(value) && value.length === 0)
    return [];
  invalid(`${field} must be empty.`, field);
}
function literal(value, expected, field) {
  if (value === expected)
    return expected;
  invalid(`${field} must be ${String(expected)}.`, field);
}

// components/ulw-loop/src/quality-gate-blockers.ts
var BLOCKER_FIELD_KEYS = "blocker blockerSignature blockerEvidence blockerOccurrences blockedAt".split(" ");
var URL_PATTERN = /https?:\/\/\S+/g;
var PUNCTUATION_PATTERN = /[`"'()[\]{}:,;]/g;
var WHITESPACE_PATTERN = /\s+/g;
var AUTH_PATTERN = /\b(auth\w*|credential\w*|token|permission\w*|scope\w*|access|unauthorized|forbidden|401|403)\b/;
var MISSING_PATTERN = /\b(unset|missing|required|requires|without|omit\w*|not set|not available|no read packages|read packages)\b/;
var GHCR_PATTERN = /\b(ghcr|github container registry|read packages|imagepullsecret|package api|anonymous|container image)\b/;
var GHCR_401_PATTERN = /\b(401|unauthorized|anonymous pull|authentication required)\b/;
var GHCR_403_PATTERN = /\b(403|forbidden|read packages|package api)\b/;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function normalizeBlockerEvidence(evidence) {
  const withoutUrls = evidence.toLowerCase().replace(URL_PATTERN, " ");
  const withoutPunctuation = withoutUrls.replace(PUNCTUATION_PATTERN, " ");
  return withoutPunctuation.replace(WHITESPACE_PATTERN, " ").trim();
}
function classifyExternalAuthorizationBlocker(evidence) {
  const normalized = normalizeBlockerEvidence(evidence);
  if (!normalized || !AUTH_PATTERN.test(normalized) || !MISSING_PATTERN.test(normalized))
    return null;
  if (!GHCR_PATTERN.test(normalized))
    return "EXTERNAL_AUTHORIZATION_REQUIRED";
  const status401 = GHCR_401_PATTERN.test(normalized) ? "HTTP_401_ANONYMOUS" : null;
  const status403 = GHCR_403_PATTERN.test(normalized) ? "HTTP_403_NO_READ_PACKAGES" : null;
  const status = [status401, status403].filter((part) => part !== null).join("+");
  return `GHCR_PULL_ACCESS:${status || "AUTHORIZATION_REQUIRED"}:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED`;
}
function nestedBlockerSignature(goal) {
  const blocker = Reflect.get(goal, "blocker");
  const signature = isRecord2(blocker) ? blocker["signature"] : null;
  return typeof signature === "string" ? signature : null;
}
function sameBlockerOccurrences(plan, signature) {
  return plan.goals.filter((goal) => goal.blockerSignature === signature || nestedBlockerSignature(goal) === signature).length;
}
function clearGoalBlockerFields(goal) {
  for (const key of BLOCKER_FIELD_KEYS)
    Reflect.deleteProperty(goal, key);
}

// components/ulw-loop/src/quality-gate.ts
var REVIEWER_ROLES = {
  codeReview: "lazycodex-code-reviewer",
  manualQa: "lazycodex-qa-executor",
  gateReview: "lazycodex-gate-reviewer"
};
function reviewerRoleField(value, expected, field) {
  const actual = textField(value, field);
  if (actual !== expected)
    invalid(`${field} must be ${expected}.`, field);
  return expected;
}
function surfaceField(value, field) {
  if (value === "cli" || value === "http" || value === "tmux" || value === "browser" || value === "gui" || value === "data")
    return value;
  invalid(`${field} must be a supported manual QA surface.`, field);
}
function kindField(value, field) {
  if (value === "cli-transcript" || value === "log" || value === "screenshot" || value === "image" || value === "http-dump" || value === "data-diff")
    return value;
  invalid(`${field} must be a supported artifact kind.`, field);
}
function passedVerdict(value, field) {
  if (value === "not_applicable")
    invalid(`${field} must not be not_applicable.`, field);
  return literal(value, "passed", field);
}
function artifactCompatible(surface, kind) {
  switch (surface) {
    case "cli":
    case "tmux":
      return kind === "cli-transcript" || kind === "log";
    case "http":
      return kind === "http-dump";
    case "browser":
    case "gui":
      return kind === "screenshot" || kind === "image";
    case "data":
      return kind === "data-diff";
    default:
      invalid("manualQa.surfaceEvidence has an unsupported surface.", "manualQa.surfaceEvidence.surface");
  }
}
function checkFile(path, field, opts) {
  if (opts === undefined)
    return;
  const absolute = resolve4(opts.repoRoot, path);
  if (!opts.fs.existsSync(absolute))
    invalid(`${field} must point to an existing artifact.`, field);
  const stat = opts.fs.statSync(absolute);
  if (stat.size <= 0)
    invalid(`${field} must point to a non-empty artifact.`, field);
}
function artifactMap(refs) {
  const byId = new Map;
  for (const ref of refs) {
    if (byId.has(ref.id))
      invalid(`manualQa.artifactRefs contains duplicate ${ref.id}.`, "manualQa.artifactRefs");
    byId.set(ref.id, ref);
  }
  return byId;
}
function parseArtifactRefs(value, opts) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("manualQa.artifactRefs must not be empty.", "manualQa.artifactRefs");
  return value.map((item, index) => {
    const ref = section(item, `manualQa.artifactRefs[${index}]`);
    const path = textField(ref["path"], `manualQa.artifactRefs[${index}].path`);
    checkFile(path, `manualQa.artifactRefs[${index}].path`, opts);
    return {
      id: textField(ref["id"], `manualQa.artifactRefs[${index}].id`),
      kind: kindField(ref["kind"], `manualQa.artifactRefs[${index}].kind`),
      description: textField(ref["description"], `manualQa.artifactRefs[${index}].description`),
      path
    };
  });
}
function referencedArtifacts(value, field, byId) {
  return stringArray(value, field).map((id) => {
    const artifact = byId.get(id);
    if (artifact === undefined)
      invalid(`${field} references unknown artifact ${id}.`, field);
    return artifact;
  });
}
function validateQualityGate(input, opts) {
  const gate = section(input, "qualityGate");
  const codeReview = section(gate["codeReview"], "codeReview");
  const manualQa = section(gate["manualQa"], "manualQa");
  const gateReview = section(gate["gateReview"], "gateReview");
  const iteration = section(gate["iteration"], "iteration");
  const coverage = section(gate["criteriaCoverage"], "criteriaCoverage");
  const totalCriteria = numberField(coverage["totalCriteria"], "criteriaCoverage.totalCriteria");
  const passCount = numberField(coverage["passCount"], "criteriaCoverage.passCount");
  if (passCount < totalCriteria)
    invalid("criteriaCoverage.passCount must cover totalCriteria.", "criteriaCoverage.passCount");
  const artifactRefs = parseArtifactRefs(manualQa["artifactRefs"], opts);
  const byId = artifactMap(artifactRefs);
  const surfaceEvidence = parseSurfaceEvidence(manualQa["surfaceEvidence"], byId);
  const adversarialCases = parseAdversarialCases(manualQa["adversarialCases"], byId);
  const codeReportPath = textField(codeReview["reportPath"], "codeReview.reportPath");
  const gateReportPath = textField(gateReview["reportPath"], "gateReview.reportPath");
  checkFile(codeReportPath, "codeReview.reportPath", opts);
  checkFile(gateReportPath, "gateReview.reportPath", opts);
  return {
    codeReview: {
      by: reviewerRoleField(codeReview["by"], REVIEWER_ROLES.codeReview, "codeReview.by"),
      recommendation: literal(codeReview["recommendation"], "APPROVE", "codeReview.recommendation"),
      codeQualityStatus: literal(codeReview["codeQualityStatus"], "CLEAR", "codeReview.codeQualityStatus"),
      reportPath: codeReportPath,
      evidence: textField(codeReview["evidence"], "codeReview.evidence"),
      blockers: emptyBlockers(codeReview["blockers"], "codeReview.blockers")
    },
    manualQa: {
      by: reviewerRoleField(manualQa["by"], REVIEWER_ROLES.manualQa, "manualQa.by"),
      status: literal(manualQa["status"], "passed", "manualQa.status"),
      evidence: textField(manualQa["evidence"], "manualQa.evidence"),
      surfaceEvidence,
      adversarialCases,
      artifactRefs
    },
    gateReview: {
      by: reviewerRoleField(gateReview["by"], REVIEWER_ROLES.gateReview, "gateReview.by"),
      recommendation: literal(gateReview["recommendation"], "APPROVE", "gateReview.recommendation"),
      reportPath: gateReportPath,
      evidence: textField(gateReview["evidence"], "gateReview.evidence"),
      blockers: emptyBlockers(gateReview["blockers"], "gateReview.blockers")
    },
    iteration: {
      fullRerun: literal(iteration["fullRerun"], true, "iteration.fullRerun"),
      status: literal(iteration["status"], "passed", "iteration.status"),
      rerunCommands: stringArray(iteration["rerunCommands"], "iteration.rerunCommands"),
      evidence: textField(iteration["evidence"], "iteration.evidence")
    },
    criteriaCoverage: {
      totalCriteria,
      passCount,
      originalIntent: textField(coverage["originalIntent"], "criteriaCoverage.originalIntent"),
      desiredOutcome: textField(coverage["desiredOutcome"], "criteriaCoverage.desiredOutcome"),
      userOutcomeReview: textField(coverage["userOutcomeReview"], "criteriaCoverage.userOutcomeReview"),
      adversarialClassesCovered: stringArray(coverage["adversarialClassesCovered"], "criteriaCoverage.adversarialClassesCovered")
    }
  };
}
function parseSurfaceEvidence(value, byId) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("manualQa.surfaceEvidence must not be empty.", "manualQa.surfaceEvidence");
  return value.map((item, index) => {
    const row = section(item, `manualQa.surfaceEvidence[${index}]`);
    const surface = surfaceField(row["surface"], `manualQa.surfaceEvidence[${index}].surface`);
    const artifacts = referencedArtifacts(row["artifactRefs"], `manualQa.surfaceEvidence[${index}].artifactRefs`, byId);
    for (const artifact of artifacts) {
      if (!artifactCompatible(surface, artifact.kind)) {
        invalid(`manualQa.surfaceEvidence ${surface} artifact ${artifact.kind} is incompatible.`, "manualQa.surfaceEvidence");
      }
    }
    return {
      id: textField(row["id"], `manualQa.surfaceEvidence[${index}].id`),
      criterionRef: textField(row["criterionRef"], `manualQa.surfaceEvidence[${index}].criterionRef`),
      surface,
      invocation: textField(row["invocation"], `manualQa.surfaceEvidence[${index}].invocation`),
      verdict: passedVerdict(row["verdict"], `manualQa.surfaceEvidence[${index}].verdict`),
      artifactRefs: artifacts.map((artifact) => artifact.id)
    };
  });
}
function parseAdversarialCases(value, byId) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("manualQa.adversarialCases must not be empty.", "manualQa.adversarialCases");
  return value.map((item, index) => {
    const row = section(item, `manualQa.adversarialCases[${index}]`);
    const artifacts = referencedArtifacts(row["artifactRefs"], `manualQa.adversarialCases[${index}].artifactRefs`, byId);
    return {
      id: textField(row["id"], `manualQa.adversarialCases[${index}].id`),
      criterionRef: textField(row["criterionRef"], `manualQa.adversarialCases[${index}].criterionRef`),
      scenario: textField(row["scenario"], `manualQa.adversarialCases[${index}].scenario`),
      expectedBehavior: textField(row["expectedBehavior"], `manualQa.adversarialCases[${index}].expectedBehavior`),
      verdict: passedVerdict(row["verdict"], `manualQa.adversarialCases[${index}].verdict`),
      artifactRefs: artifacts.map((artifact) => artifact.id)
    };
  });
}

// components/ulw-loop/src/quality-gate-artifacts.ts
import { createHash as createHash2 } from "node:crypto";
import { closeSync as closeSync2, constants as constants5, fstatSync as fstatSync2, lstatSync as lstatSync2, openSync as openSync2, readFileSync, realpathSync } from "node:fs";
import { isAbsolute as isAbsolute2, join as join4, relative as relative2, resolve as resolve5, sep as sep2 } from "node:path";
var SHA256_PATTERN = /^[a-f0-9]{64}$/;
function qaRelativeRoot(scope) {
  return `${ulwLoopRelativeDir(scope)}/qa`;
}
function within(parent, child) {
  const path = relative2(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep2}`) && !isAbsolute2(path);
}
function canonicalArtifactPath(repoRoot, path, field, scope) {
  if (isAbsolute2(path))
    invalid(`${field} must be repository-relative.`, field);
  const normalized = path.replaceAll("\\", "/");
  const qaRoot = qaRelativeRoot(scope);
  if (!normalized.startsWith(`${qaRoot}/`) || normalized.includes("/../") || normalized.endsWith("/..")) {
    invalid(`${field} must be confined to ${qaRoot}.`, field);
  }
  const canonicalRepo = realpathSync(repoRoot);
  const expected = join4(canonicalRepo, ...normalized.split("/"));
  const absolute = resolve5(repoRoot, path);
  const stat = lstatSync2(absolute);
  if (stat.isSymbolicLink() || !stat.isFile())
    invalid(`${field} must be a regular file, not a link.`, field);
  const canonical = realpathSync(absolute);
  const canonicalQa = realpathSync(join4(repoRoot, qaRoot));
  if (canonical !== expected || !within(canonicalQa, canonical))
    invalid(`${field} escapes the scoped QA directory.`, field);
  return canonical;
}
function fileSha256(path, field) {
  const before = lstatSync2(path);
  const descriptor = openSync2(path, constants5.O_RDONLY | constants5.O_NOFOLLOW);
  try {
    const opened = fstatSync2(descriptor);
    if (!opened.isFile() || opened.ino !== before.ino || opened.size !== before.size) {
      invalid(`${field} changed while it was opened.`, field);
    }
    const digest = createHash2("sha256").update(readFileSync(descriptor)).digest("hex");
    const after = fstatSync2(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
      invalid(`${field} changed while it was hashed.`, field);
    }
    return digest;
  } finally {
    closeSync2(descriptor);
  }
}
function validateBoundFile(repoRoot, pathValue, hashValue, field, scope) {
  const path = textField(pathValue, `${field}.path`);
  const sha256 = textField(hashValue, `${field}.sha256`);
  if (!SHA256_PATTERN.test(sha256))
    invalid(`${field}.sha256 must be a lowercase SHA-256 digest.`, `${field}.sha256`);
  let canonical;
  try {
    canonical = canonicalArtifactPath(repoRoot, path, `${field}.path`, scope);
  } catch (error) {
    if (error instanceof UlwLoopError)
      throw error;
    invalid(`${field}.path must point to an existing scoped QA file.`, `${field}.path`);
  }
  try {
    if (fileSha256(canonical, `${field}.path`) !== sha256)
      invalid(`${field}.sha256 does not match the file.`, `${field}.sha256`);
  } catch (error) {
    if (error instanceof UlwLoopError)
      throw error;
    invalid(`${field}.path could not be hashed safely.`, `${field}.path`);
  }
  return { path, sha256 };
}

// components/ulw-loop/src/quality-gate-binding.ts
import { createHash as createHash3 } from "node:crypto";
function planDefinition(plan) {
  return {
    version: plan.version,
    briefPath: plan.briefPath,
    goalsPath: plan.goalsPath,
    ledgerPath: plan.ledgerPath,
    codexGoalMode: plan.codexGoalMode ?? "per_story",
    codexObjective: plan.codexObjective ?? null,
    codexObjectiveAliases: plan.codexObjectiveAliases ?? [],
    goals: plan.goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      objective: goal.objective,
      criteria: goal.successCriteria.map((criterion) => ({
        id: criterion.id,
        scenario: criterion.scenario,
        userModel: criterion.userModel,
        expectedEvidence: criterion.expectedEvidence,
        essential: criterion.essential ?? true
      }))
    }))
  };
}
function deriveQualityGatePlanFingerprint(plan) {
  return createHash3("sha256").update(JSON.stringify(planDefinition(plan))).digest("hex");
}
function expectedQualityGateCriterionRefs(plan) {
  return plan.goals.flatMap((goal) => goal.successCriteria.map((criterion) => `${goal.id}/${criterion.id}`));
}

// components/ulw-loop/src/quality-gate-executions.ts
function unique(values, field) {
  if (new Set(values).size !== values.length)
    invalid("Duplicate references are not allowed.", field);
}
function parseQualityGateExecutions(value, artifactIds) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("manualQa.executions must not be empty.", "manualQa.executions");
  const ids = new Set;
  return value.map((item, index) => {
    const field = `manualQa.executions[${index}]`;
    const row = section(item, field);
    const id = textField(row["id"], `${field}.id`);
    if (ids.has(id))
      invalid(`manualQa.executions contains duplicate ${id}.`, "manualQa.executions");
    ids.add(id);
    const exitCode = numberField(row["exitCode"], `${field}.exitCode`);
    if (!Number.isInteger(exitCode) || exitCode !== 0)
      invalid(`${field}.exitCode must be 0.`, `${field}.exitCode`);
    const criterionRefs = stringArray(row["criterionRefs"], `${field}.criterionRefs`);
    const artifactRefs = stringArray(row["artifactRefs"], `${field}.artifactRefs`);
    unique(criterionRefs, `${field}.criterionRefs`);
    unique(artifactRefs, `${field}.artifactRefs`);
    for (const artifactRef of artifactRefs)
      if (!artifactIds.has(artifactRef))
        invalid(`${field}.artifactRefs references unknown ${artifactRef}.`, `${field}.artifactRefs`);
    return { id, command: textField(row["command"], `${field}.command`), exitCode: 0, criterionRefs, artifactRefs };
  });
}

// components/ulw-loop/src/quality-gate-strict.ts
function exactUnique(actual, expected, field) {
  if (new Set(actual).size !== actual.length)
    invalid(`${field} contains duplicate references.`, field);
  const expectedSet = new Set(expected);
  if (expectedSet.size !== expected.length)
    invalid("The ulw-loop plan contains duplicate criterion references.", field);
  if (actual.length !== expected.length || actual.some((item) => !expectedSet.has(item))) {
    invalid(`${field} must exactly match the actual plan criteria.`, field);
  }
}
function requireUnique(values, field) {
  if (new Set(values).size !== values.length)
    invalid("Duplicate references are not allowed.", field);
}
function arrayField(value, field) {
  if (!Array.isArray(value))
    invalid(`${field} must be an array.`, field);
  return value;
}
function parseSource(value, expected) {
  if (expected === null)
    invalid("Current git provenance is unavailable; strict completion cannot proceed.", "binding.source");
  const source = section(value, "binding.source");
  const commitSha = textField(source["commitSha"], "binding.source.commitSha");
  const treeOid = textField(source["treeOid"], "binding.source.treeOid");
  if (commitSha !== expected.commitSha || treeOid !== expected.treeOid) {
    invalid("binding.source does not match the current repository source.", "binding.source");
  }
  return { commitSha, treeOid };
}
function validateStrictQualityGate(input, context) {
  const base = validateQualityGate(input);
  const gate = section(input, "qualityGate");
  const binding = section(gate["binding"], "binding");
  const finalGoal = context.finalGoal;
  if (finalGoal === undefined)
    invalid("Strict completion requires the actual final goal.", "binding.finalGoalId");
  if (!context.plan.goals.includes(finalGoal) || !isFinalRunCompletionCandidate(context.plan, finalGoal)) {
    invalid("Strict completion requires the plan's current final completion candidate.", "binding.finalGoalId");
  }
  if (numberField(binding["schemaVersion"], "binding.schemaVersion") !== 2) {
    invalid("binding.schemaVersion must be 2.", "binding.schemaVersion");
  }
  const planFingerprint = textField(binding["planFingerprint"], "binding.planFingerprint");
  if (planFingerprint !== deriveQualityGatePlanFingerprint(context.plan))
    invalid("binding.planFingerprint does not match the actual plan.", "binding.planFingerprint");
  const finalGoalId = textField(binding["finalGoalId"], "binding.finalGoalId");
  const finalGoalObjective = textField(binding["finalGoalObjective"], "binding.finalGoalObjective");
  if (finalGoalId !== finalGoal.id || finalGoalObjective !== finalGoal.objective)
    invalid("binding final task does not match the actual final goal.", "binding.finalGoalId");
  const source = parseSource(binding["source"], context.source);
  const expectedCriteria = expectedQualityGateCriterionRefs(context.plan);
  const coverage = section(gate["criteriaCoverage"], "criteriaCoverage");
  if (base.criteriaCoverage.totalCriteria !== expectedCriteria.length)
    invalid("criteriaCoverage.totalCriteria must equal the actual plan count.", "criteriaCoverage.totalCriteria");
  if (base.criteriaCoverage.passCount !== expectedCriteria.length)
    invalid("criteriaCoverage.passCount must equal the actual passing count.", "criteriaCoverage.passCount");
  const criterionRefs = stringArray(coverage["criterionRefs"], "criteriaCoverage.criterionRefs");
  exactUnique(criterionRefs, expectedCriteria, "criteriaCoverage.criterionRefs");
  const manualQa = section(gate["manualQa"], "manualQa");
  const rawArtifacts = manualQa["artifactRefs"];
  if (!Array.isArray(rawArtifacts))
    invalid("manualQa.artifactRefs must be an array.", "manualQa.artifactRefs");
  const artifactIds = new Set;
  const artifactHashes = new Map;
  for (const [index, item] of rawArtifacts.entries()) {
    const row = section(item, `manualQa.artifactRefs[${index}]`);
    const id = textField(row["id"], `manualQa.artifactRefs[${index}].id`);
    artifactIds.add(id);
    const bound = validateBoundFile(context.repoRoot, row["path"], row["sha256"], `manualQa.artifactRefs[${index}]`, context.scope);
    artifactHashes.set(id, bound.sha256);
  }
  const executions = parseQualityGateExecutions(manualQa["executions"], artifactIds);
  exactUnique(executions.flatMap((execution) => execution.criterionRefs), expectedCriteria, "manualQa.executions.criterionRefs");
  exactUnique(executions.flatMap((execution) => execution.artifactRefs), [...artifactIds], "manualQa.executions.artifactRefs");
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  const surfaceCriteria = [];
  const surfaceExecutionRefs = [];
  for (const [index, item] of arrayField(manualQa["surfaceEvidence"], "manualQa.surfaceEvidence").entries()) {
    const row = section(item, `manualQa.surfaceEvidence[${index}]`);
    const criterionRef = textField(row["criterionRef"], `manualQa.surfaceEvidence[${index}].criterionRef`);
    const executionRef = textField(row["executionRef"], `manualQa.surfaceEvidence[${index}].executionRef`);
    const execution = executionById.get(executionRef);
    const rowArtifacts = stringArray(row["artifactRefs"], `manualQa.surfaceEvidence[${index}].artifactRefs`);
    requireUnique(rowArtifacts, `manualQa.surfaceEvidence[${index}].artifactRefs`);
    if (execution === undefined || !execution.criterionRefs.includes(criterionRef) || execution.command !== textField(row["invocation"], `manualQa.surfaceEvidence[${index}].invocation`) || rowArtifacts.some((artifact) => !execution.artifactRefs.includes(artifact)))
      invalid("surface evidence is not bound to its successful execution.", `manualQa.surfaceEvidence[${index}].executionRef`);
    surfaceCriteria.push(criterionRef);
    surfaceExecutionRefs.push(executionRef);
  }
  exactUnique(surfaceCriteria, expectedCriteria, "manualQa.surfaceEvidence.criterionRef");
  const adversarialExecutionRefs = [];
  for (const [index, item] of arrayField(manualQa["adversarialCases"], "manualQa.adversarialCases").entries()) {
    const row = section(item, `manualQa.adversarialCases[${index}]`);
    const criterionRef = textField(row["criterionRef"], `manualQa.adversarialCases[${index}].criterionRef`);
    if (!expectedCriteria.includes(criterionRef))
      invalid("adversarial case references an unknown criterion.", `manualQa.adversarialCases[${index}].criterionRef`);
    const executionRef = textField(row["executionRef"], `manualQa.adversarialCases[${index}].executionRef`);
    const execution = executionById.get(executionRef);
    const rowArtifacts = stringArray(row["artifactRefs"], `manualQa.adversarialCases[${index}].artifactRefs`);
    requireUnique(rowArtifacts, `manualQa.adversarialCases[${index}].artifactRefs`);
    if (execution === undefined || !execution.criterionRefs.includes(criterionRef) || rowArtifacts.some((artifact) => !execution.artifactRefs.includes(artifact)))
      invalid("adversarial case is not bound to its successful execution.", `manualQa.adversarialCases[${index}].executionRef`);
    adversarialExecutionRefs.push(executionRef);
  }
  const codeReview = section(gate["codeReview"], "codeReview");
  const codeReport = validateBoundFile(context.repoRoot, codeReview["reportPath"], codeReview["reportSha256"], "codeReview.report", context.scope);
  const gateReview = section(gate["gateReview"], "gateReview");
  const gateReport = validateBoundFile(context.repoRoot, gateReview["reportPath"], gateReview["reportSha256"], "gateReview.report", context.scope);
  exactUnique(base.iteration.rerunCommands, executions.map((execution) => execution.command), "iteration.rerunCommands");
  return {
    ...base,
    binding: { schemaVersion: 2, planFingerprint, finalGoalId, finalGoalObjective, source },
    codeReview: { ...base.codeReview, reportSha256: codeReport.sha256 },
    manualQa: {
      ...base.manualQa,
      surfaceEvidence: base.manualQa.surfaceEvidence.map((row, index) => ({
        ...row,
        executionRef: surfaceExecutionRefs[index] ?? invalid("Missing surface execution binding.", "manualQa.surfaceEvidence")
      })),
      adversarialCases: base.manualQa.adversarialCases.map((row, index) => ({
        ...row,
        executionRef: adversarialExecutionRefs[index] ?? invalid("Missing adversarial execution binding.", "manualQa.adversarialCases")
      })),
      artifactRefs: base.manualQa.artifactRefs.map((artifact) => ({
        ...artifact,
        sha256: artifactHashes.get(artifact.id) ?? invalid("Missing artifact hash binding.", "manualQa.artifactRefs")
      })),
      executions
    },
    gateReview: { ...base.gateReview, reportSha256: gateReport.sha256 },
    criteriaCoverage: { ...base.criteriaCoverage, criterionRefs }
  };
}

// components/ulw-loop/src/checkpoint.ts
function ulwLoopFail2(message, code) {
  throw new UlwLoopError(message, code);
}
function normalizeObjective3(value) {
  return value.replace(/\s+/g, " ").trim();
}
function nonEmptyEvidence2(value) {
  const trimmed = value.trim();
  return trimmed || ulwLoopFail2("Evidence must be a non-empty string.", "ulw_loop_evidence_required");
}
function findGoal2(plan, goalId) {
  const goal = plan.goals.find((candidate) => candidate.id === goalId);
  return goal ?? ulwLoopFail2(`Unknown ulw-loop id: ${goalId}.`, "ulw_loop_goal_not_found");
}
async function readJsonInput2(raw, repoRoot) {
  if (raw === undefined || raw.trim() === "")
    return;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    if (!(error instanceof SyntaxError))
      throw error;
  }
  const path = resolve6(repoRoot, trimmed);
  if (!existsSync2(path))
    return ulwLoopFail2("Quality gate JSON is neither valid JSON nor a readable path.", "ulw_loop_json_input_invalid");
  try {
    return JSON.parse(await readFile3(path, "utf8"));
  } catch (error) {
    return ulwLoopFail2(`Quality gate path does not contain valid JSON${error instanceof Error ? `: ${error.message}` : "."}`, "ulw_loop_json_input_invalid");
  }
}
function makeAggregateCompletion(now, evidence, codexGoal) {
  return { status: "complete", completedAt: now, evidence, codexGoal };
}
function applyBlockedOrFailed(goal, plan, status, evidence, now) {
  const signature = classifyExternalAuthorizationBlocker(evidence);
  const occurrences = signature === null ? 0 : sameBlockerOccurrences(plan, signature) + 1;
  const needsDecision = signature !== null && occurrences >= 3;
  goal.status = needsDecision ? "needs_user_decision" : status;
  goal.updatedAt = now;
  if (status === "failed" || needsDecision) {
    goal.failedAt = now;
    goal.failureReason = evidence;
  }
  if (status === "blocked" || needsDecision)
    goal.blockedReason = evidence;
  if (signature !== null) {
    goal.blockerSignature = signature;
    goal.blockerOccurrenceCount = occurrences;
    goal.requiredExternalDecision = `Resolve external authorization: ${signature}`;
  }
  if (needsDecision)
    goal.nonRetriable = true;
  if (plan.activeGoalId === goal.id)
    delete plan.activeGoalId;
}
function ledgerKind2(status, goal, aggregateCompletion) {
  if (aggregateCompletion !== undefined)
    return "aggregate_completed";
  if (status === "complete")
    return "goal_completed";
  if (goal.status === "needs_user_decision")
    return "goal_needs_user_decision";
  return status === "blocked" ? "goal_blocked" : "goal_failed";
}
function buildLedger(now, args, goal, qualityGate, codexGoal, aggregateCompletion) {
  const entry = {
    at: now,
    kind: ledgerKind2(args.status, goal, aggregateCompletion),
    goalId: goal.id,
    status: goal.status,
    evidence: args.evidence
  };
  if (codexGoal !== undefined)
    entry.codexGoal = codexGoal;
  if (qualityGate !== undefined)
    entry.qualityGate = qualityGate;
  if (goal.blockerSignature !== undefined)
    entry.blockerSignature = goal.blockerSignature;
  if (goal.blockerOccurrenceCount !== undefined)
    entry.blockerOccurrenceCount = goal.blockerOccurrenceCount;
  if (goal.requiredExternalDecision !== undefined)
    entry.requiredExternalDecision = goal.requiredExternalDecision;
  return entry;
}
async function checkpointUlwLoop(repoRoot, args, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const goal = findGoal2(plan, args.goalId);
    const evidence = nonEmptyEvidence2(args.evidence);
    const now = iso();
    let aggregateCompletion;
    let qualityGate;
    let codexGoal;
    if (args.status === "complete") {
      const aggregate = codexGoalMode(plan) === "aggregate";
      const final = isFinalRunCompletionCandidate(plan, goal);
      if (final) {
        requireAllCriteriaPass(goal);
        requireAllPlanCriteriaPass(plan);
      } else if (aggregate)
        requireEssentialCriteriaPass(goal);
      else
        requireAllCriteriaPass(goal);
      const snapshot = await readCodexGoalSnapshotInput(args.codexGoalJson, repoRoot);
      const reconciliation = reconcileCodexGoalSnapshot(snapshot, {
        expectedObjective: expectedCodexObjective(plan, goal),
        ...aggregate ? { acceptedObjectives: compatibleCodexObjectives(plan) } : {},
        allowedStatuses: aggregate ? final ? ["complete"] : ["active"] : ["complete"],
        requireSnapshot: true,
        requireComplete: !aggregate || final
      });
      codexGoal = reconciliation.snapshot.raw;
      if (!reconciliation.ok) {
        const objective = snapshot?.objective;
        const mismatchedTaskObjective = snapshot?.available === true && objective !== undefined && normalizeObjective3(objective) !== normalizeObjective3(expectedCodexObjective(plan, goal));
        const completedTaskScoped = mismatchedTaskObjective && snapshot.status === "complete" && await canReconcileCompletedTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope);
        const activeFinalTaskScoped = mismatchedTaskObjective && snapshot.status === "active" && await canReconcileActiveFinalTaskScopedAggregateSnapshot(repoRoot, plan, goal, objective, evidence, scope);
        const taskScoped = completedTaskScoped || activeFinalTaskScoped;
        if (!taskScoped)
          throw new UlwLoopError(`${formatCodexGoalReconciliation(reconciliation)}${aggregate && snapshot?.status === "complete" && objective !== undefined ? buildTaskScopedAggregateReconciliationHint(goal, final) : ""}`, "ulw_loop_codex_snapshot_mismatch");
      }
      if (final)
        aggregateCompletion = makeAggregateCompletion(now, evidence, codexGoal);
      if (final || aggregateCompletion !== undefined) {
        const input = await readJsonInput2(args.qualityGateJson, repoRoot);
        qualityGate = validateStrictQualityGate(input, {
          repoRoot,
          plan,
          finalGoal: goal,
          source: inspectGitProvenance(repoRoot).provenance,
          ...scope === undefined ? {} : { scope }
        });
      }
      goal.status = "complete";
      goal.completedAt = now;
      goal.evidence = evidence;
      delete goal.failedAt;
      delete goal.failureReason;
      clearGoalBlockerFields(goal);
      if (plan.activeGoalId === goal.id)
        delete plan.activeGoalId;
    } else
      applyBlockedOrFailed(goal, plan, args.status, evidence, now);
    goal.updatedAt = now;
    if (aggregateCompletion !== undefined)
      plan.aggregateCompletion = aggregateCompletion;
    plan.updatedAt = now;
    await writePlan(repoRoot, plan, scope);
    const ledgerEntry = buildLedger(now, args, goal, qualityGate, codexGoal, aggregateCompletion);
    await appendLedger(repoRoot, ledgerEntry, scope);
    return aggregateCompletion === undefined ? { plan, goal, ledgerEntry } : { plan, goal, ledgerEntry, aggregateCompletion };
  });
}

// components/ulw-loop/src/cli-steering.ts
var SOURCES = ["user_prompt_submit", "finding", "cli"];
var STEERING_KIND_HELP = [
  `Allowed --kind values: ${ULW_LOOP_STEERING_MUTATION_KINDS.join(", ")}`,
  "Kind-specific required flags:",
  "  add_subgoal: --title, --objective, --evidence, --rationale",
  "  split_subgoal: --goal-id, --children, --evidence, --rationale",
  "  reorder_pending: --order, --evidence, --rationale",
  "  revise_pending_wording: --goal-id, --title or --objective, --evidence, --rationale",
  "  revise_criterion: --goal-id, --criterion-id, one of --scenario/--expected-evidence/--user-model, --evidence, --rationale",
  "  annotate_ledger: --evidence, --rationale",
  "  mark_blocked_superseded: --goal-id, optional --replacements, --evidence, --rationale",
  'Example: lazyz ulw-loop steer --kind annotate_ledger --evidence "observed behavior" --rationale "why this changes the plan" --json'
].join(`
`);
function isKind(value) {
  return value !== undefined && ULW_LOOP_STEERING_MUTATION_KINDS.some((kind) => kind === value);
}
function isSource(value) {
  return value !== undefined && SOURCES.some((source) => source === value);
}
function isModel(value) {
  return ULW_LOOP_SUCCESS_CRITERION_USER_MODELS.some((model) => model === value);
}
function fail(message, code, details) {
  throw new UlwLoopError(message, code, { details });
}
function kindMessage(prefix) {
  return `${prefix}

${STEERING_KIND_HELP}`;
}
function text(value, field) {
  if (value === undefined)
    return;
  const trimmed = value.trim();
  if (trimmed.length > 0)
    return trimmed;
  return fail(`Empty ${field}.`, "ULW_LOOP_STEERING_FIELD_EMPTY", { field });
}
function required2(argv, flag) {
  const value = text(readValue(argv, flag), flag);
  return value ?? fail(`Missing ${flag}.`, "ULW_LOOP_STEERING_FIELD_REQUIRED", { flag });
}
function requiredGoal(argv) {
  const value = text(parseGoalArg(argv), "--goal-id");
  return value ?? fail("Missing --goal-id.", "ULW_LOOP_GOAL_ID_REQUIRED", { flag: "--goal-id" });
}
function readObject(value, key) {
  return Object.entries(value).find(([name]) => name === key)?.[1];
}
function isPlain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function objectText(value, key) {
  const candidate = readObject(value, key);
  return typeof candidate === "string" ? candidate : undefined;
}
function parseSteeringKind(argv) {
  const value = readValue(argv, "--kind");
  if (isKind(value))
    return value;
  return value === undefined ? fail(kindMessage("Missing --kind."), "ULW_LOOP_STEERING_KIND_REQUIRED", { flag: "--kind", expected: ULW_LOOP_STEERING_MUTATION_KINDS, usage: STEERING_KIND_HELP }) : fail(kindMessage(`Invalid --kind: ${value}.`), "ULW_LOOP_STEERING_KIND_INVALID", { value, expected: ULW_LOOP_STEERING_MUTATION_KINDS, usage: STEERING_KIND_HELP });
}
function parseSteeringSource(argv) {
  const value = readValue(argv, "--source");
  if (value === undefined)
    return "cli";
  return isSource(value) ? value : fail(`Invalid --source: ${value}.`, "ULW_LOOP_STEERING_SOURCE_INVALID", { value, expected: SOURCES });
}
function child(value) {
  if (!isPlain(value))
    return null;
  const title = text(objectText(value, "title"), "title");
  const objective = text(objectText(value, "objective"), "objective");
  if (title === undefined || objective === undefined)
    return null;
  return { title, objective };
}
async function children(argv, flag, needed) {
  const input = needed ? required2(argv, flag) : text(readValue(argv, flag), flag);
  if (input === undefined)
    return [];
  const raw = await readJsonInput(input);
  if (!Array.isArray(raw))
    return fail(`${flag} must be a JSON array.`, "ULW_LOOP_STEERING_JSON_ARRAY_REQUIRED", { flag });
  const parsed = [];
  for (const item of raw) {
    const next = child(item);
    if (next === null)
      return fail(`${flag} entries require title/objective.`, "ULW_LOOP_STEERING_CHILD_INVALID", { flag });
    parsed.push(next);
  }
  return parsed;
}
async function stringArray2(argv, flag) {
  const raw = await readJsonInput(required2(argv, flag));
  if (!Array.isArray(raw))
    return fail(`${flag} must be a JSON array.`, "ULW_LOOP_STEERING_JSON_ARRAY_REQUIRED", { flag });
  const values = [];
  for (const item of raw) {
    if (typeof item !== "string")
      return fail(`${flag} entries must be strings.`, "ULW_LOOP_STEERING_STRING_ARRAY_REQUIRED", { flag });
    values.push(text(item, flag) ?? "");
  }
  return values;
}
function model(value) {
  const trimmed = text(value, "--user-model");
  if (trimmed === undefined)
    return;
  return isModel(trimmed) ? trimmed : fail(`Invalid --user-model: ${trimmed}.`, "ULW_LOOP_STEERING_USER_MODEL_INVALID", { value: trimmed, expected: ULW_LOOP_SUCCESS_CRITERION_USER_MODELS });
}
function neverKind(kind) {
  return fail(`Unsupported steering kind: ${String(kind)}.`, "ULW_LOOP_STEERING_KIND_UNSUPPORTED", { kind });
}
async function parseSteeringProposal(argv) {
  const kind = parseSteeringKind(argv);
  const source = parseSteeringSource(argv);
  const base = { kind, source, evidence: required2(argv, "--evidence"), rationale: required2(argv, "--rationale") };
  switch (kind) {
    case "add_subgoal":
      return normalizeSteeringProposal({ ...base, title: required2(argv, "--title"), objective: required2(argv, "--objective") });
    case "split_subgoal": {
      const goalId = requiredGoal(argv);
      return normalizeSteeringProposal({ ...base, goalId, targetGoalId: goalId, childGoals: await children(argv, "--children", true) });
    }
    case "reorder_pending":
      return normalizeSteeringProposal({ ...base, pendingOrder: await stringArray2(argv, "--order") });
    case "revise_pending_wording": {
      const goalId = requiredGoal(argv);
      const revisedTitle = readValue(argv, "--title");
      const revisedObjective = readValue(argv, "--objective");
      if (revisedTitle === undefined && revisedObjective === undefined)
        return fail("revise_pending_wording requires --title or --objective.", "ULW_LOOP_STEERING_UPDATE_REQUIRED", { kind });
      return normalizeSteeringProposal({ ...base, goalId, targetGoalId: goalId, ...revisedTitle === undefined ? {} : { revisedTitle }, ...revisedObjective === undefined ? {} : { revisedObjective } });
    }
    case "revise_criterion": {
      const goalId = requiredGoal(argv);
      const criterionId = required2(argv, "--criterion-id");
      const scenario = readValue(argv, "--scenario");
      const expectedEvidence = readValue(argv, "--expected-evidence");
      const userModel = model(readValue(argv, "--user-model"));
      if (scenario === undefined && expectedEvidence === undefined && userModel === undefined)
        return fail("revise_criterion requires scenario, expected-evidence, or user-model.", "ULW_LOOP_STEERING_UPDATE_REQUIRED", { kind });
      return normalizeSteeringProposal({ ...base, goalId, targetGoalId: goalId, criterionId, ...scenario === undefined ? {} : { scenario }, ...expectedEvidence === undefined ? {} : { expectedEvidence }, ...userModel === undefined ? {} : { userModel } });
    }
    case "annotate_ledger":
      return normalizeSteeringProposal(base);
    case "mark_blocked_superseded": {
      const goalId = requiredGoal(argv);
      const childGoals = await children(argv, "--replacements", false);
      return normalizeSteeringProposal({ ...base, goalId, targetGoalId: goalId, ...childGoals.length === 0 ? {} : { childGoals } });
    }
    default:
      return neverKind(kind);
  }
}
function normalizedChildren(values) {
  if (values === undefined)
    return;
  return values.map((item) => ({ title: text(item.title, "child.title") ?? "", objective: text(item.objective, "child.objective") ?? "" }));
}
function normalizedStrings(values, field) {
  if (values === undefined)
    return;
  return values.map((value) => text(value, field) ?? "");
}
function normalizeSteeringProposal(proposal) {
  const evidence = text(proposal.evidence, "evidence") ?? "";
  const rationale = text(proposal.rationale, "rationale") ?? "";
  const goalId = text(proposal.goalId, "goalId");
  const targetGoalId = text(proposal.targetGoalId, "targetGoalId");
  const targetGoalIds = normalizedStrings(proposal.targetGoalIds, "targetGoalIds");
  const criterionId = text(proposal.criterionId, "criterionId");
  const title = text(proposal.title, "title");
  const objective = text(proposal.objective, "objective");
  const revisedTitle = text(proposal.revisedTitle, "revisedTitle");
  const revisedObjective = text(proposal.revisedObjective, "revisedObjective");
  const blockedReason = text(proposal.blockedReason, "blockedReason");
  const directiveText = text(proposal.directiveText, "directiveText");
  const promptSignature = text(proposal.promptSignature, "promptSignature");
  const idempotencyKey = text(proposal.idempotencyKey, "idempotencyKey");
  const scenario = text(proposal.scenario, "scenario");
  const expectedEvidence = text(proposal.expectedEvidence, "expectedEvidence");
  const childGoals = normalizedChildren(proposal.childGoals);
  const pendingOrder = normalizedStrings(proposal.pendingOrder, "pendingOrder");
  return { kind: proposal.kind, source: proposal.source, evidence, rationale, ...goalId === undefined ? {} : { goalId }, ...targetGoalId === undefined ? {} : { targetGoalId }, ...targetGoalIds === undefined ? {} : { targetGoalIds }, ...criterionId === undefined ? {} : { criterionId }, ...title === undefined ? {} : { title }, ...objective === undefined ? {} : { objective }, ...childGoals === undefined ? {} : { childGoals }, ...revisedTitle === undefined ? {} : { revisedTitle }, ...revisedObjective === undefined ? {} : { revisedObjective }, ...pendingOrder === undefined ? {} : { pendingOrder }, ...blockedReason === undefined ? {} : { blockedReason }, ...proposal.after === undefined ? {} : { after: proposal.after }, ...directiveText === undefined ? {} : { directiveText }, ...promptSignature === undefined ? {} : { promptSignature }, ...idempotencyKey === undefined ? {} : { idempotencyKey }, ...proposal.now === undefined ? {} : { now: proposal.now }, ...scenario === undefined ? {} : { scenario }, ...expectedEvidence === undefined ? {} : { expectedEvidence }, ...proposal.userModel === undefined ? {} : { userModel: proposal.userModel } };
}
function printSteerResult(result, json) {
  if (json) {
    printJson({ ok: result.accepted, accepted: result.accepted, rejectedReasons: result.rejectedReasons, deduped: result.deduped, audit: result.audit, plan: result.plan });
    return;
  }
  const outcome = result.deduped ? "deduped" : result.accepted ? "accepted" : "rejected";
  process.stdout.write(`ulw-loop steer: ${outcome} ${result.audit.kind}
`);
  if (result.rejectedReasons.length > 0)
    process.stdout.write(`rejected: ${result.rejectedReasons.join("; ")}
`);
  if (result.audit.idempotencyKey !== undefined)
    process.stdout.write(`idempotency-key: ${result.audit.idempotencyKey}
`);
  printStatus(result.plan);
}

// components/ulw-loop/src/codex-goal-instruction.ts
function buildCodexGoalInstruction(args) {
  const mode = codexGoalMode(args.plan);
  const createGoal = buildCreateGoalPayload(args.plan, args.goal);
  const isFinal = args.isFinal ?? isFinalRunCompletionCandidate(args.plan, args.goal);
  return { text: buildText(mode, args.plan, args.goal, createGoal, isFinal), json: createGoal };
}
function buildCreateGoalPayload(plan, goal) {
  return { objective: expectedCodexObjective(plan, goal) };
}
function buildText(mode, plan, goal, createGoal, isFinal) {
  return joinLines([
    mode === "aggregate" ? "UlwLoop aggregate-goal handoff" : "UlwLoop active-goal handoff",
    `Mode: ${mode}`,
    `Plan: ${plan.goalsPath}`,
    `Ledger: ${plan.ledgerPath}`,
    `Goal: ${goal.id} — ${goal.title}`,
    "",
    ...activeGoalLines(goal),
    "",
    ...successCriteriaLines(goal.successCriteria),
    "",
    "Codex goal integration constraints:",
    "- Use the create_goal payload exactly as rendered: objective only.",
    "- Goals are unlimited. Do not add numeric limits.",
    ...modeConstraintLines(mode, isFinal),
    finalSection(plan, goal, isFinal, mode === "aggregate"),
    ...checkpointLines(plan, mode),
    "",
    "create_goal payload:",
    JSON.stringify(createGoal, null, 2)
  ]);
}
function modeConstraintLines(mode, isFinal) {
  if (mode === "per_story") {
    return [
      "- First call get_goal. If no active goal exists, call create_goal with the payload below.",
      "- If a different active Codex goal exists, finish/checkpoint that goal before starting this ulw-loop.",
      "- Work only this goal until its completion audit passes."
    ];
  }
  return [
    "- Codex goal = the whole lazyz ulw-loop run; OMO G001/G002/etc. = ledger stories.",
    "- First call get_goal. If no active goal exists, call create_goal with the aggregate payload below.",
    "- If get_goal reports the same aggregate objective as active, continue this OMO story without creating a new Codex goal.",
    "- If a different active or incomplete Codex goal exists, finish/checkpoint that goal before starting this ulw-loop.",
    isFinal ? "- This is the final story; update_goal is allowed only after the mandatory quality gate passes." : "- This is not the final story: do not call update_goal mid-aggregate; checkpoint this OMO ledger story and continue the remaining stories. update_goal is reserved for the final story after the mandatory quality gate passes."
  ];
}
function checkpointLines(plan, mode) {
  const failureLine = `- If blocked or failed, checkpoint with --status failed and the failure evidence; rerun complete-goals${sessionOption(plan)} --retry-failed to resume.`;
  if (mode === "per_story")
    return [failureLine];
  return [
    "- Checkpoint this OMO story with a fresh get_goal snapshot whose objective matches the aggregate payload.",
    failureLine
  ];
}
function activeGoalLines(goal) {
  return ["Active goal:", `- id: ${goal.id}`, `- title: ${goal.title}`, `- objective: ${goal.objective}`];
}
function successCriteriaLines(criteria) {
  if (criteria.length === 0)
    return ["Success criteria:", "- No success criteria recorded for this goal."];
  return ["Success criteria:", ...criteria.map(formatCriterionLine)];
}
function formatCriterionLine(criterion) {
  const remainingWork = criterion.status === "pending" ? " remaining work:" : "";
  const marker = isEssentialCriterion(criterion) ? "essential" : "non-essential";
  return `-${remainingWork} [${criterion.id}] [${marker}] (${criterion.userModel}) ${criterion.scenario} — expect: ${criterion.expectedEvidence} — status: ${criterion.status}`;
}
function finalSection(plan, goal, isFinal, aggregate) {
  if (!isFinal)
    return "- This is not the final ulw-loop story; do not run the final reviewer/manual-QA/gate-review quality gate yet.";
  const option = sessionOption(plan);
  const blockerCommand = `lazyz ulw-loop record-review-blockers${option} --goal-id ${goal.id} --title "Resolve final code-review blockers" --objective "<blocker-resolution objective>" --evidence "<review findings>" --codex-goal-json "<active get_goal JSON or path>"`;
  const checkpointCommand = `lazyz ulw-loop checkpoint${option} --goal-id ${goal.id} --status complete --evidence "<targeted verification/manualQa/gateReview evidence>" --codex-goal-json "<fresh complete get_goal JSON or path>" --quality-gate-json "<quality gate JSON or path>"`;
  return joinLines([
    "Final story — run mandatory quality gate before update_goal:",
    `- Generate the authoritative binding and exact criterion set first: lazyz ulw-loop quality-context${option} --goal-id ${goal.id} --json`,
    "- Run targeted verification for changed behavior.",
    "- Confirm every manualQa artifact path exists and has non-zero size.",
    "- Spawn final reviewers with fork_context=false: lazycodex-code-reviewer, lazycodex-qa-executor, and lazycodex-gate-reviewer. Include the original brief, goal objectives, desired user-visible outcome, diff, and evidence.",
    "- Require clean codeReview, manualQa, gateReview, iteration, and criteriaCoverage. criteriaCoverage must summarize originalIntent, desiredOutcome, and userOutcomeReview; counts alone are not approval.",
    "- If any reviewer is blocked/inconclusive or the quality gate is not clean, do not call update_goal. Record blocker work first:",
    `  ${blockerCommand}`,
    aggregate ? '- If the quality gate is clean, call update_goal({status: "complete"}), call get_goal again, then checkpoint the aggregate story:' : '- If the quality gate is clean, call update_goal({status: "complete"}), call get_goal again, then checkpoint:',
    `  ${checkpointCommand}`
  ]);
}
function sessionOption(plan) {
  const prefix = ".omo/ulw-loop/";
  const suffix = "/goals.json";
  if (!plan.goalsPath.startsWith(prefix) || !plan.goalsPath.endsWith(suffix))
    return "";
  const sessionId = plan.goalsPath.slice(prefix.length, -suffix.length);
  return sessionId.length === 0 ? "" : ` --session-id ${sessionId}`;
}
function joinLines(lines) {
  return lines.join(`
`);
}

// components/ulw-loop/src/plan-goal-factory.ts
function cleanLine(line) {
  return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim();
}
function normalizeObjective4(value) {
  return value.replace(/\s+/g, " ").trim();
}
function titleFromObjective(objective, fallback) {
  const firstLine = objective.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? fallback;
  return firstLine.length > 72 ? `${firstLine.slice(0, 69).trimEnd()}...` : firstLine;
}
function normalizeGoalId(title, index) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36).replace(/-+$/g, "");
  return `G${String(index + 1).padStart(3, "0")}${slug ? `-${slug}` : ""}`;
}
function assertNonEmpty(value, label) {
  const trimmed = value?.trim();
  if (!trimmed)
    throw new UlwLoopError(`Missing ${label}.`, "ULW_LOOP_ARGUMENT_MISSING");
  return trimmed;
}
function truncateObjective(objective) {
  return objective.length > 80 ? `${objective.slice(0, 77).trimEnd()}...` : objective;
}
function seedDefaultSuccessCriteria(goalIndex, objective) {
  const subject = truncateObjective(normalizeObjective4(objective) || `Goal ${goalIndex + 1}`);
  const rows = [
    [
      "C001",
      "happy",
      `happy path for: ${subject}`,
      `Replace via revise_criterion with observable happy-path proof for goal ${goalIndex + 1}.`,
      true
    ],
    [
      "C002",
      "edge",
      "edge case (boundary/empty/malformed)",
      `Replace via revise_criterion with boundary or malformed-input proof for: ${subject}.`,
      true
    ],
    [
      "C003",
      "regression",
      "regression: adjacent surface still works",
      `Replace via revise_criterion with regression proof for neighboring behavior after: ${subject}.`,
      false
    ]
  ];
  return rows.map(([id, userModel, scenario, expectedEvidence, essential]) => ({
    id,
    scenario,
    userModel,
    expectedEvidence,
    essential,
    capturedEvidence: null,
    status: "pending"
  }));
}
function deriveGoalCandidates(brief) {
  const bulletGoals = brief.split(/\r?\n/).map((line) => ({ original: line, cleaned: normalizeObjective4(cleanLine(line)) })).filter(({ cleaned }) => cleaned.length > 0 && cleaned.length <= 1200).filter(({ original, cleaned }, index, all) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(original) && all.findIndex((candidate) => candidate.cleaned === cleaned) === index).map(({ cleaned }) => cleaned);
  const paragraphs = brief.split(/\n\s*\n/).map(normalizeObjective4).filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith("#"));
  const selected = (bulletGoals.length > 0 ? bulletGoals : paragraphs).length > 0 ? bulletGoals.length > 0 ? bulletGoals : paragraphs : ["Complete the requested project objective."];
  return selected.map((objective, index) => ({
    title: titleFromObjective(objective, `Goal ${index + 1}`),
    objective
  }));
}
function makeGoal(title, objective, index, now) {
  const cleanTitle = assertNonEmpty(title, "title");
  const cleanObjective = assertNonEmpty(objective, "objective");
  return {
    id: normalizeGoalId(cleanTitle, index),
    title: cleanTitle,
    objective: cleanObjective,
    status: "pending",
    successCriteria: seedDefaultSuccessCriteria(index, cleanObjective),
    attempt: 0,
    createdAt: now,
    updatedAt: now
  };
}
function appendGoalToPlan(plan, title, objective, now) {
  const goal = makeGoal(title, objective, plan.goals.length, now);
  plan.goals.push(goal);
  plan.updatedAt = now;
  return goal;
}

// components/ulw-loop/src/plan-crud.ts
function isScheduleEligible(goal) {
  return goal.steeringStatus !== "superseded" && goal.steeringStatus !== "blocked";
}
function clearGoalBlockerFields2(goal) {
  for (const key of [
    "blockedReason",
    "blockerSignature",
    "blockerOccurrenceCount",
    "requiredExternalDecision",
    "nonRetriable",
    "failedAt",
    "failureReason"
  ])
    delete goal[key];
}
async function createUlwLoopPlan(repoRoot, args, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    if (!args.force && await ulwLoopPlanExists(repoRoot, scope)) {
      const existing = await readUlwLoopPlan(repoRoot, scope);
      if (isUlwLoopDone(existing))
        throw completedPlanExistsError(scope);
      throw new UlwLoopError(`Refusing to overwrite existing ${ulwLoopGoalsRelativePath(scope)}; pass --force to recreate it.`, "ULW_LOOP_PLAN_EXISTS");
    }
    const now = iso();
    const goals = deriveGoalCandidates(args.brief).map((goal, index) => makeGoal(goal.title, goal.objective, index, now));
    const plan = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      briefPath: ulwLoopBriefRelativePath(scope),
      goalsPath: ulwLoopGoalsRelativePath(scope),
      ledgerPath: ulwLoopLedgerRelativePath(scope),
      codexGoalMode: args.codexGoalMode ?? "aggregate",
      goals
    };
    if (plan.codexGoalMode === "aggregate")
      plan.codexObjective = aggregateCodexObjectiveForScope(scope);
    await writeUlwLoopBrief(repoRoot, args.brief, scope);
    await writePlan(repoRoot, plan, scope);
    await resetUlwLoopLedger(repoRoot, scope);
    await appendLedger(repoRoot, { at: now, kind: "plan_created", message: `${goals.length} goal(s) created` }, scope);
    return plan;
  });
}
function completedPlanExistsError(scope) {
  return new UlwLoopError([
    `Existing ulw-loop aggregate is already complete at ${ulwLoopGoalsRelativePath(scope)}.`,
    "Start a new run with `lazyz ulw-loop create-goals --session-id <new-id> ...` to isolate fresh state.",
    "Use --force only when you intentionally want to overwrite the completed evidence."
  ].join(" "), "ULW_LOOP_PLAN_EXISTS_COMPLETE");
}
async function addUlwLoopGoal(repoRoot, args, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const now = iso();
    const goal = appendGoalToPlan(plan, args.title, args.objective, now);
    await writePlan(repoRoot, plan, scope);
    await appendLedger(repoRoot, { at: now, kind: "goal_added", goalId: goal.id, status: goal.status, message: goal.title }, scope);
    return { plan, goal };
  });
}
async function startNextUlwLoop(repoRoot, args = {}, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const now = iso();
    if (plan.aggregateCompletion?.status === "complete")
      return { done: true, plan };
    const existing = plan.goals.find((goal) => goal.status === "in_progress" && isScheduleEligible(goal));
    if (existing)
      return { plan, goal: existing, resumed: true };
    let next = plan.goals.find((goal) => goal.status === "pending" && isScheduleEligible(goal));
    if (!next && args.retryFailed) {
      next = plan.goals.find((goal) => goal.status === "failed" && !goal.nonRetriable && isScheduleEligible(goal));
      if (next)
        await appendLedger(repoRoot, {
          at: now,
          kind: "goal_retried",
          goalId: next.id,
          status: "pending",
          ...next.failureReason ? { message: next.failureReason } : {}
        }, scope);
    }
    if (!next)
      return { done: true, plan };
    next.status = "in_progress";
    next.attempt += 1;
    next.startedAt = now;
    clearGoalBlockerFields2(next);
    next.updatedAt = now;
    plan.activeGoalId = next.id;
    plan.updatedAt = now;
    await writePlan(repoRoot, plan, scope);
    await appendLedger(repoRoot, { at: now, kind: "goal_started", goalId: next.id, status: next.status, message: `Attempt ${next.attempt}` }, scope);
    return { plan, goal: next, resumed: false };
  });
}
function summarizeUlwLoopPlan(plan) {
  const countStatus = (status) => plan.goals.filter((goal) => goal.status === status).length;
  const countCriteria = (status) => plan.goals.reduce((sum, goal) => sum + goal.successCriteria.filter((criterion) => criterion.status === status).length, 0);
  return {
    total: plan.goals.length,
    pending: countStatus("pending"),
    in_progress: countStatus("in_progress"),
    complete: countStatus("complete"),
    failed: countStatus("failed"),
    blocked: countStatus("blocked"),
    review_blocked: countStatus("review_blocked"),
    needs_user_decision: countStatus("needs_user_decision"),
    superseded: plan.goals.filter((goal) => goal.steeringStatus === "superseded").length,
    criteria: {
      total: plan.goals.reduce((sum, goal) => sum + goal.successCriteria.length, 0),
      pass: countCriteria("pass"),
      pending: countCriteria("pending"),
      fail: countCriteria("fail"),
      blocked: countCriteria("blocked")
    }
  };
}

// components/ulw-loop/src/quality-gate-context.ts
function findGoal3(goals, goalId) {
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (goal !== undefined)
    return goal;
  throw new UlwLoopError(`Unknown ulw-loop id: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { details: { goalId } });
}
async function buildQualityGateContext(repoRoot, goalId, scope) {
  const plan = await readUlwLoopPlan(repoRoot, scope);
  const finalGoal = findGoal3(plan.goals, goalId);
  if (!isFinalRunCompletionCandidate(plan, finalGoal)) {
    throw new UlwLoopError(`Goal ${goalId} is not the final completion candidate.`, "ULW_LOOP_QUALITY_CONTEXT_NOT_FINAL", { details: { goalId } });
  }
  const inspection = inspectGitProvenance(repoRoot);
  if (inspection.provenance === null) {
    throw new UlwLoopError(`Current git provenance is unavailable (${inspection.metrics.status}).`, "ULW_LOOP_SOURCE_PROVENANCE_UNAVAILABLE");
  }
  const criterionRefs = expectedQualityGateCriterionRefs(plan);
  return {
    binding: {
      schemaVersion: 2,
      planFingerprint: deriveQualityGatePlanFingerprint(plan),
      finalGoalId: finalGoal.id,
      finalGoalObjective: finalGoal.objective,
      source: inspection.provenance
    },
    criterionRefs,
    totalCriteria: criterionRefs.length,
    qaRoot: `${ulwLoopRelativeDir(scope)}/qa`
  };
}

// components/ulw-loop/src/review-blockers.ts
var BLOCKER_FIELDS = "blockedReason blockerSignature blockerOccurrenceCount requiredExternalDecision nonRetriable failedAt failureReason completedAt blocker blockerEvidence blockerOccurrences blockedAt".split(" ");
function ulwLoopError(message, code) {
  throw new UlwLoopError(message, code);
}
function nextGoalId(plan) {
  const max = plan.goals.reduce((current, goal) => {
    const digits = /^G(\d+)/u.exec(goal.id)?.[1];
    return digits === undefined ? current : Math.max(current, Number(digits));
  }, 0);
  return `G${String(max + 1).padStart(3, "0")}`;
}
function appendBlockerGoal(plan, args, now) {
  const index = plan.goals.length;
  const goal = {
    id: nextGoalId(plan),
    title: args.title,
    objective: args.objective,
    status: "pending",
    successCriteria: seedDefaultSuccessCriteria(index, args.objective),
    attempt: 0,
    createdAt: now,
    updatedAt: now
  };
  plan.goals.push(goal);
  return goal;
}
async function recordFinalReviewBlockers(repoRoot, args, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const goal = plan.goals.find((candidate) => candidate.id === args.goalId);
    if (goal === undefined)
      ulwLoopError(`Unknown ulw-loop id: ${args.goalId}`, "ulw_loop_goal_not_found");
    if (goal.status !== "in_progress")
      ulwLoopError(`${goal.id} is ${goal.status}.`, "ulw_loop_goal_not_in_progress");
    if (!isFinalRunCompletionCandidate(plan, goal))
      ulwLoopError(`${goal.id} is not final.`, "ulw_loop_not_final_story");
    const snapshot = await readCodexGoalSnapshotInput(args.codexGoalJson, repoRoot);
    const aggregate = codexGoalMode(plan) === "aggregate";
    const reconciliation = reconcileCodexGoalSnapshot(snapshot, { expectedObjective: expectedCodexObjective(plan, goal), ...aggregate ? { acceptedObjectives: compatibleCodexObjectives(plan) } : {}, allowedStatuses: ["active"], requireSnapshot: true, requireComplete: false });
    if (!reconciliation.ok)
      ulwLoopError(reconciliation.errors.join(" "), "ulw_loop_codex_snapshot_mismatch");
    const now = iso();
    for (const field of BLOCKER_FIELDS)
      Reflect.deleteProperty(goal, field);
    goal.status = "review_blocked";
    goal.reviewBlockedAt = now;
    goal.evidence = args.evidence;
    goal.updatedAt = now;
    if (plan.activeGoalId === goal.id)
      delete plan.activeGoalId;
    const newGoal = appendBlockerGoal(plan, args, now);
    plan.updatedAt = now;
    const codexGoal = reconciliation.snapshot.raw;
    const blockedEntry = { at: now, kind: "goal_review_blocked", goalId: goal.id, status: goal.status, evidence: args.evidence, codexGoal };
    const addedEntry = { at: now, kind: "goal_added", goalId: newGoal.id, status: newGoal.status, evidence: args.evidence, message: newGoal.title };
    const summaryEntry = { at: now, kind: "goal_review_blocked", goalId: goal.id, status: goal.status, evidence: args.evidence, codexGoal, message: `Review blockers recorded; appended ${newGoal.id}.` };
    Reflect.set(summaryEntry, "kind", "blocker_recorded");
    const ledgerEntries = [blockedEntry, addedEntry, summaryEntry];
    await writePlan(repoRoot, plan, scope);
    for (const entry of ledgerEntries)
      await appendLedger(repoRoot, entry, scope);
    return { plan, blockedGoal: goal, newGoal, ledgerEntries };
  });
}

// components/ulw-loop/src/steering.ts
var SOURCES2 = ["user_prompt_submit", "finding", "cli"];
var PROTECTED = new Set(["aggregateCompletion", "codexObjective", "codexObjectiveAliases", "originalConstraints", "qualityGate", "status", "completedAt", "completionStatus"]);
var isObject = (value) => typeof value === "object" && value !== null;
var isPlain2 = (value) => isObject(value) && !Array.isArray(value);
var read = (value, key) => Object.entries(value).find(([name]) => name === key)?.[1];
var isText = (value) => typeof value === "string" && value.trim().length > 0;
var text2 = (value, key) => {
  const candidate = read(value, key);
  return isText(candidate) ? candidate.trim() : undefined;
};
var isKind2 = (value) => typeof value === "string" && ULW_LOOP_STEERING_MUTATION_KINDS.some((kind) => kind === value);
var isSource2 = (value) => typeof value === "string" && SOURCES2.some((source) => source === value);
var isModel2 = (value) => typeof value === "string" && ULW_LOOP_SUCCESS_CRITERION_USER_MODELS.some((model) => model === value);
var texts = (value, key) => {
  const candidate = read(value, key);
  return Array.isArray(candidate) && candidate.every((item) => typeof item === "string") ? candidate : [];
};
function targets(proposal) {
  const many = texts(proposal, "targetGoalIds");
  const one = text2(proposal, "targetGoalId") ?? text2(proposal, "goalId");
  return many.length > 0 ? many : one === undefined ? [] : [one];
}
var after = (proposal) => {
  const candidate = read(proposal, "after");
  return isPlain2(candidate) ? candidate : undefined;
};
var revised = (proposal, direct, nested) => text2(proposal, direct) ?? text2(after(proposal) ?? proposal, nested);
function child2(value) {
  if (!isPlain2(value))
    return null;
  const title = text2(value, "title");
  const objective = text2(value, "objective");
  if (title === undefined || objective === undefined)
    return null;
  return { title, objective };
}
function childValues(proposal) {
  const direct = read(proposal, "childGoals");
  if (Array.isArray(direct) && direct.length > 0)
    return direct;
  const nested = after(proposal);
  const fromAfter = nested === undefined ? undefined : read(nested, "children");
  return Array.isArray(fromAfter) ? fromAfter : [];
}
var children2 = (proposal) => childValues(proposal).map(child2).filter((item) => item !== null);
var pendingOrder = (proposal) => {
  const direct = texts(proposal, "pendingOrder");
  return direct.length > 0 ? direct : texts(after(proposal) ?? proposal, "pendingGoalIds");
};
function hasProtected(value) {
  if (!isObject(value))
    return false;
  for (const [key, childValue] of Object.entries(value))
    if (PROTECTED.has(key) || key.toLowerCase().includes("complete") || hasProtected(childValue))
      return true;
  return false;
}
function allText(value) {
  if (typeof value === "string")
    return value;
  return isObject(value) ? Object.values(value).map(allText).filter(Boolean).join(`
`) : "";
}
function weakens(value) {
  const valueText = allText(value).toLowerCase();
  return /\b(skip|bypass|weaken|remove|omit|auto[-\s]?complete|mark complete|complete faster)\b/.test(valueText) && /\b(test|tests|verification|review|quality gate|complete|completion)\b/.test(valueText);
}
function auditFor(proposal, reasons) {
  const object = isPlain2(proposal) ? proposal : undefined;
  const kindRaw = object === undefined ? undefined : read(object, "kind");
  const sourceRaw = object === undefined ? undefined : read(object, "source");
  const evidence = object === undefined ? "" : text2(object, "evidence") ?? "";
  const rationale = object === undefined ? "" : text2(object, "rationale") ?? "";
  const audit = { kind: isKind2(kindRaw) ? kindRaw : "annotate_ledger", source: isSource2(sourceRaw) ? sourceRaw : "cli", targetGoalIds: object === undefined ? [] : targets(object), evidence, rationale, invariant: { accepted: reasons.length === 0, structuralInvariantAccepted: reasons.length === 0, evidenceBackedNecessity: evidence.length > 0 && rationale.length > 0, noEasierCompletion: !weakens(proposal), rejectedReasons: reasons, reasons } };
  if (object === undefined)
    return audit;
  const criterionId = text2(object, "criterionId");
  const directiveText = text2(object, "directiveText");
  const promptSignature = text2(object, "promptSignature");
  const idempotencyKey = text2(object, "idempotencyKey");
  if (criterionId !== undefined)
    audit.criterionId = criterionId;
  if (directiveText !== undefined)
    audit.directiveText = directiveText;
  if (promptSignature !== undefined)
    audit.promptSignature = promptSignature;
  if (idempotencyKey !== undefined)
    audit.idempotencyKey = idempotencyKey;
  return audit;
}
function validateUlwLoopSteeringProposal(plan, proposal) {
  const reasons = [];
  if (!isPlain2(proposal))
    reasons.push("proposal must be an object");
  const object = isPlain2(proposal) ? proposal : {};
  const kind = read(object, "kind");
  if (!isKind2(kind))
    reasons.push(`invalid kind: ${String(kind)}`);
  if (!isSource2(read(object, "source")))
    reasons.push(`invalid source: ${String(read(object, "source"))}`);
  if (text2(object, "evidence") === undefined)
    reasons.push("missing evidence");
  if (text2(object, "rationale") === undefined)
    reasons.push("missing rationale");
  if (hasProtected(proposal))
    reasons.push("protected payload");
  if (weakens(proposal))
    reasons.push("weakened completion");
  if (isUlwLoopDone(plan))
    reasons.push("plan already complete");
  if (isKind2(kind))
    validateKind(plan, object, kind, reasons);
  return auditFor(proposal, reasons);
}
function goal(plan, id) {
  return id === undefined ? undefined : plan.goals.find((item) => item.id === id);
}
function validateKind(plan, proposal, kind, reasons) {
  const target = goal(plan, targets(proposal)[0]);
  if (kind === "add_subgoal" && (text2(proposal, "title") === undefined || text2(proposal, "objective") === undefined))
    reasons.push("add_subgoal requires title/objective");
  if ((kind === "split_subgoal" || kind === "revise_pending_wording" || kind === "mark_blocked_superseded") && target === undefined)
    reasons.push(`${kind} requires target`);
  if ((kind === "split_subgoal" || kind === "revise_pending_wording") && target !== undefined && target.status !== "pending")
    reasons.push(`${kind} requires pending target`);
  const rawChildren = childValues(proposal);
  if (kind === "split_subgoal" && rawChildren.length === 0)
    reasons.push("split_subgoal requires children");
  if ((kind === "split_subgoal" || kind === "mark_blocked_superseded") && rawChildren.some((item) => child2(item) === null))
    reasons.push(`${kind} children require title/objective`);
  if (kind === "reorder_pending")
    validateOrder(plan, proposal, reasons);
  if (kind === "revise_pending_wording" && revised(proposal, "revisedTitle", "title") === undefined && revised(proposal, "revisedObjective", "objective") === undefined)
    reasons.push("revise_pending_wording requires update");
  if (kind === "revise_criterion")
    validateCriterion(plan, proposal, reasons);
}
function validateOrder(plan, proposal, reasons) {
  const requested = pendingOrder(proposal);
  const pending = plan.goals.filter((item) => item.status === "pending" && item.steeringStatus === undefined).map((item) => item.id);
  if (requested.length === 0)
    reasons.push("reorder_pending requires ids");
  if (new Set(requested).size !== requested.length)
    reasons.push("duplicate pending id");
  if (requested.some((id) => !pending.includes(id)))
    reasons.push("unknown pending id");
}
function validateCriterion(plan, proposal, reasons) {
  const target = goal(plan, targets(proposal)[0]);
  const criterionId = text2(proposal, "criterionId");
  if (target === undefined)
    reasons.push("revise_criterion requires goalId");
  else if (criterionId === undefined || target.successCriteria.every((item) => item.id !== criterionId))
    reasons.push("revise_criterion requires criterionId");
  const model = read(proposal, "userModel");
  if (read(proposal, "scenario") === undefined && read(proposal, "expectedEvidence") === undefined && model === undefined)
    reasons.push("revise_criterion requires update");
  if (model !== undefined && !isModel2(model))
    reasons.push("invalid userModel");
}
function nextId(plan, offset) {
  const max = plan.goals.reduce((current, item) => {
    const digits = /^G(\d+)(?:-|$)/u.exec(item.id)?.[1];
    return digits === undefined ? current : Math.max(current, Number(digits));
  }, 0);
  return `G${String(max + offset).padStart(3, "0")}`;
}
function makeGoal2(plan, childGoal, evidence, now, offset) {
  const id = nextId(plan, offset);
  const digits = /^G(\d+)/u.exec(id)?.[1];
  const goalIndex = digits === undefined ? plan.goals.length + offset - 1 : Number(digits) - 1;
  return { id, title: childGoal.title, objective: childGoal.objective, status: "pending", successCriteria: seedDefaultSuccessCriteria(goalIndex, childGoal.objective), attempt: 0, createdAt: now, updatedAt: now, evidence };
}
function applySteeringMutation(plan, proposal, audit) {
  const next = structuredClone(plan);
  if (!audit.invariant.accepted)
    return next;
  const now = proposal.now?.toISOString() ?? iso();
  if (proposal.kind === "add_subgoal")
    next.goals.push(makeGoal2(next, { title: proposal.title ?? "", objective: proposal.objective ?? "" }, proposal.evidence, now, 1));
  if (proposal.kind === "reorder_pending") {
    const order = pendingOrder(proposal);
    next.goals = [...order.map((id) => goal(next, id)).filter((item) => item !== undefined), ...next.goals.filter((item) => !order.includes(item.id))];
  }
  if (proposal.kind === "revise_pending_wording")
    reviseWording(next, proposal, now);
  if (proposal.kind === "split_subgoal" || proposal.kind === "mark_blocked_superseded")
    splitOrBlock(next, proposal, now);
  if (proposal.kind === "revise_criterion")
    reviseCriterion(next, proposal, now);
  if (proposal.kind !== "annotate_ledger")
    next.updatedAt = now;
  return next;
}
function reviseWording(plan, proposal, now) {
  const target = goal(plan, targets(proposal)[0]);
  if (target === undefined)
    return;
  target.title = revised(proposal, "revisedTitle", "title") ?? target.title;
  target.objective = revised(proposal, "revisedObjective", "objective") ?? target.objective;
  target.steeringEvidence = proposal.evidence;
  target.steeringRationale = proposal.rationale;
  target.updatedAt = now;
}
function splitOrBlock(plan, proposal, now) {
  const target = goal(plan, targets(proposal)[0]);
  if (target === undefined)
    return;
  const replacements = children2(proposal).map((item, index) => makeGoal2(plan, item, proposal.evidence, now, index + 1));
  target.steeringEvidence = proposal.evidence;
  target.steeringRationale = proposal.rationale;
  target.updatedAt = now;
  if (replacements.length === 0) {
    target.status = "blocked";
    target.steeringStatus = "blocked";
    target.blockedReason = proposal.blockedReason ?? proposal.rationale;
  } else {
    target.steeringStatus = "superseded";
    target.supersededBy = replacements.map((item) => item.id);
    for (const item of replacements)
      item.supersedes = [target.id];
    plan.goals.splice(plan.goals.indexOf(target) + 1, 0, ...replacements);
  }
  if (plan.activeGoalId === target.id)
    delete plan.activeGoalId;
}
function reviseCriterion(plan, proposal, now) {
  const target = goal(plan, targets(proposal)[0]);
  const index = target?.successCriteria.findIndex((item) => item.id === proposal.criterionId) ?? -1;
  const current = target?.successCriteria[index];
  if (target === undefined || current === undefined)
    return;
  const model = read(proposal, "userModel");
  target.successCriteria[index] = { ...current, scenario: text2(proposal, "scenario") ?? current.scenario, expectedEvidence: text2(proposal, "expectedEvidence") ?? current.expectedEvidence, userModel: isModel2(model) ? model : current.userModel };
  target.updatedAt = now;
}
function isProposal(value) {
  return isPlain2(value) && isKind2(read(value, "kind")) && isSource2(read(value, "source")) && isText(read(value, "evidence")) && isText(read(value, "rationale"));
}
function parseUlwLoopSteeringDirective(text) {
  const match = /(?:^|\s)(?:OMO_ULW_LOOP_STEER|omo\.ulw-loop\.steer|lazyz ulw-loop steer):\s*([\s\S]+)$/u.exec(text);
  if (match?.[1] === undefined)
    return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    return isProposal(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
}
async function steerUlwLoop(repoRoot, proposal, scope) {
  return withUlwLoopMutationLock(repoRoot, scope, async () => {
    const plan = await readUlwLoopPlan(repoRoot, scope);
    const key = proposal.idempotencyKey ?? proposal.promptSignature;
    const prior = key === undefined ? undefined : (await readSteeringLedgerEntries(repoRoot, scope)).find((entry) => entry.steering?.invariant.accepted === true && (entry.idempotencyKey === key || entry.steering.idempotencyKey === key || entry.steering.promptSignature === key));
    if (prior?.steering !== undefined)
      return { plan, accepted: true, audit: { ...prior.steering, deduped: true }, rejectedReasons: [], deduped: true };
    const audit = validateUlwLoopSteeringProposal(plan, proposal);
    const accepted = audit.invariant.accepted;
    const next = accepted ? applySteeringMutation(plan, proposal, audit) : plan;
    const finalAudit = { ...audit, before: plan };
    if (accepted)
      finalAudit.after = next;
    if (accepted)
      await writePlan(repoRoot, next, scope);
    await appendLedger(repoRoot, ledgerEntry(proposal, finalAudit, proposal.now?.toISOString() ?? iso()), scope);
    return { plan: next, accepted, audit: finalAudit, rejectedReasons: audit.invariant.rejectedReasons, deduped: false };
  });
}
function ledgerEntry(proposal, audit, at) {
  const entry = { at, kind: audit.invariant.accepted ? proposal.kind === "revise_criterion" ? "criteria_revised" : "steering_accepted" : "steering_rejected", evidence: proposal.evidence, message: proposal.rationale, steering: audit, mutationKind: proposal.kind };
  const goalId = audit.targetGoalIds[0];
  if (goalId !== undefined)
    entry.goalId = goalId;
  if (proposal.criterionId !== undefined)
    entry.criterionId = proposal.criterionId;
  if (proposal.idempotencyKey !== undefined)
    entry.idempotencyKey = proposal.idempotencyKey;
  if (audit.before !== undefined)
    entry.before = audit.before;
  if (audit.after !== undefined)
    entry.after = audit.after;
  return entry;
}

// components/ulw-loop/src/cli-subcommands.ts
async function createGoals(repoRoot, argv, json, scope) {
  const briefFile = readValue(argv, "--brief-file");
  const brief = readValue(argv, "--brief") ?? (briefFile === undefined ? undefined : await readFile4(briefFile, "utf8")) ?? (hasFlag(argv, "--from-stdin") ? await readStdin() : undefined) ?? positionalText(argv);
  if (!brief.trim()) {
    throw new UlwLoopError("Missing brief text. Pass --brief, --brief-file, --from-stdin, or positional text.", "ULW_LOOP_BRIEF_REQUIRED");
  }
  const plan = await createUlwLoopPlan(repoRoot, {
    brief,
    codexGoalMode: normalizeCodexGoalMode(readValue(argv, "--codex-goal-mode")),
    force: hasFlag(argv, "--force")
  }, scope);
  if (json)
    printJson({ ok: true, plan, summary: summarizeUlwLoopPlan(plan) });
  else {
    process.stdout.write(`ulw-loop plan created: ${plan.goals.length} goal(s)
brief: ${plan.briefPath}
goals: ${plan.goalsPath}
ledger: ${plan.ledgerPath}
`);
  }
  return 0;
}
async function status(repoRoot, json, scope) {
  const plan = await readUlwLoopPlan(repoRoot, scope);
  if (json)
    printJson({ ok: true, plan, summary: summarizeUlwLoopPlan(plan) });
  else
    printStatus(plan);
  return 0;
}
async function completeGoals(repoRoot, argv, json, scope) {
  const result = await startNextUlwLoop(repoRoot, { retryFailed: hasFlag(argv, "--retry-failed") }, scope);
  if ("done" in result) {
    const handoff = blockedDecisionHandoff(result.plan);
    if (json) {
      printJson({
        ok: true,
        done: true,
        blocked: handoff.length > 0,
        handoff,
        summary: summarizeUlwLoopPlan(result.plan),
        plan: result.plan
      });
    } else
      process.stdout.write(`${handoff || "ulw-loop: all goals complete"}
`);
    return 0;
  }
  const instruction = buildCodexGoalInstruction({ plan: result.plan, goal: result.goal });
  if (json)
    printJson({ ok: true, resumed: result.resumed, goal: result.goal, instruction, plan: result.plan });
  else
    process.stdout.write(`${instruction.text}
`);
  return 0;
}
async function checkpoint(repoRoot, argv, json, scope) {
  const goalId = required3(argv, "--goal-id");
  const statusValue = checkpointStatus(required3(argv, "--status"));
  const evidence = required3(argv, "--evidence");
  const codexGoalJson = await parseCodexGoalJson(statusValue === "complete" ? required3(argv, "--codex-goal-json") : readValue(argv, "--codex-goal-json"));
  if (statusValue === "complete" && codexGoalJson === undefined) {
    throw new UlwLoopError("Missing --codex-goal-json.", "ULW_LOOP_CODEX_GOAL_JSON_REQUIRED");
  }
  const qualityGateJson = readValue(argv, "--quality-gate-json");
  const args = {
    goalId,
    status: statusValue,
    evidence,
    ...codexGoalJson === undefined ? {} : { codexGoalJson },
    ...qualityGateJson === undefined ? {} : { qualityGateJson }
  };
  const result = await checkpointUlwLoop(repoRoot, args, scope);
  if (json)
    printJson({ ok: true, ...result, summary: summarizeUlwLoopPlan(result.plan) });
  else
    process.stdout.write(`ulw-loop checkpoint: ${result.goal.id} -> ${result.goal.status}
`);
  return 0;
}
async function qualityContext(repoRoot, argv, json, scope) {
  const context = await buildQualityGateContext(repoRoot, required3(argv, "--goal-id"), scope);
  if (json)
    printJson({ ok: true, ...context });
  else
    process.stdout.write(`${JSON.stringify(context, null, 2)}
`);
  return 0;
}
async function steer(repoRoot, argv, json, scope) {
  const proposal = await parseSteeringProposal(argv);
  const result = await steerUlwLoop(repoRoot, proposal, scope);
  printSteerResult(result, json);
  return result.accepted ? 0 : 1;
}
async function addGoal(repoRoot, argv, json, scope) {
  const result = await addUlwLoopGoal(repoRoot, { title: required3(argv, "--title"), objective: required3(argv, "--objective") }, scope);
  if (json)
    printJson({ ok: true, plan: result.plan, goal: result.goal, summary: summarizeUlwLoopPlan(result.plan) });
  else {
    process.stdout.write(`ulw-loop added goal: ${result.goal.id}
`);
    printStatus(result.plan);
  }
  return 0;
}
async function criteria(repoRoot, argv, json, scope) {
  const goalId = required3(argv, "--goal-id");
  const goal = findGoal4(await readUlwLoopPlan(repoRoot, scope), goalId);
  if (json)
    printJson({ ok: true, goalId: goal.id, criteria: goal.successCriteria });
  else {
    process.stdout.write(`criteria for ${goal.id}:
${goal.successCriteria.map(formatCriterionForCli).join(`
`)}
`);
  }
  return 0;
}
async function captureEvidence(repoRoot, argv, json, scope) {
  const result = await recordEvidence(repoRoot, parseRecordEvidenceArgs(argv), scope);
  if (json)
    printJson({ ok: true, ...result, summary: summarizeUlwLoopPlan(result.plan) });
  else {
    process.stdout.write(`ulw-loop evidence recorded: ${result.goal.id}/${result.criterion.id} -> ${result.criterion.status}
`);
  }
  return 0;
}
async function reviewBlockers(repoRoot, argv, json, scope) {
  const codexGoalJson = await parseCodexGoalJson(required3(argv, "--codex-goal-json"));
  if (codexGoalJson === undefined) {
    throw new UlwLoopError("Missing --codex-goal-json.", "ULW_LOOP_CODEX_GOAL_JSON_REQUIRED");
  }
  const result = await recordFinalReviewBlockers(repoRoot, {
    goalId: required3(argv, "--goal-id"),
    title: required3(argv, "--title"),
    objective: required3(argv, "--objective"),
    evidence: required3(argv, "--evidence"),
    codexGoalJson
  }, scope);
  if (json) {
    printJson({
      ok: true,
      plan: result.plan,
      blockedGoal: result.blockedGoal,
      goal: result.newGoal,
      ledgerEntries: result.ledgerEntries,
      summary: summarizeUlwLoopPlan(result.plan)
    });
  } else {
    process.stdout.write(`ulw-loop final review blockers recorded: ${result.blockedGoal.id} -> review_blocked; added ${result.newGoal.id}
`);
  }
  return 0;
}
function formatCriterionForCli(criterion) {
  const marker = isEssentialCriterion(criterion) ? "essential" : "non-essential";
  return `- ${criterion.id} [${criterion.status}] [${marker}] (${criterion.userModel}) ${criterion.scenario} evidence: ${criterion.capturedEvidence ?? "pending"}`;
}
function required3(argv, flag) {
  const value = readValue(argv, flag)?.trim();
  if (value)
    return value;
  throw new UlwLoopError(`Missing ${flag}.`, "ULW_LOOP_ARGUMENT_MISSING", { details: { flag } });
}
function checkpointStatus(value) {
  if (value === "complete" || value === "failed" || value === "blocked")
    return value;
  throw new UlwLoopError("Missing or invalid --status; expected complete, failed, or blocked.", "ULW_LOOP_STATUS_INVALID", { details: { status: value } });
}
function findGoal4(plan, goalId) {
  const goal = plan.goals.find((candidate) => candidate.id === goalId);
  if (goal !== undefined)
    return goal;
  throw new UlwLoopError(`Unknown ulw-loop id: ${goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND", { details: { goalId } });
}

// components/ulw-loop/src/cli-commands.ts
var ULW_LOOP_SUBCOMMANDS = [
  "help",
  "create-goals",
  "status",
  "complete-goals",
  "checkpoint",
  "steer",
  "add-goal",
  "criteria",
  "record-evidence",
  "record-review-blockers",
  "quality-context"
];
function isUlwLoopSubcommand(value) {
  return ULW_LOOP_SUBCOMMANDS.includes(value);
}
async function ulwLoopCommand(argv) {
  const head = argv[0] ?? "help";
  const command = head === "--help" || head === "-h" ? "help" : head;
  const rest = argv.slice(1);
  const repoRoot = process.cwd();
  const json = hasFlag(rest, "--json");
  const scope = commandScope(rest);
  try {
    if (!isUlwLoopSubcommand(command)) {
      if (json) {
        printJsonError(new UlwLoopError(`Unknown ulw-loop subcommand: ${command}.`, "ULW_LOOP_SUBCOMMAND_UNKNOWN", {
          details: { command }
        }));
        return 1;
      }
      process.stdout.write(`${ULW_LOOP_HELP}
`);
      return 1;
    }
    switch (command) {
      case "help":
        process.stdout.write(`${ULW_LOOP_HELP}
`);
        return 0;
      case "create-goals":
        return await createGoals(repoRoot, rest, json, scope);
      case "status":
        return await status(repoRoot, json, scope);
      case "complete-goals":
        return await completeGoals(repoRoot, rest, json, scope);
      case "checkpoint":
        return await checkpoint(repoRoot, rest, json, scope);
      case "steer":
        return await steer(repoRoot, rest, json, scope);
      case "add-goal":
        return await addGoal(repoRoot, rest, json, scope);
      case "criteria":
        return await criteria(repoRoot, rest, json, scope);
      case "record-evidence":
        return await captureEvidence(repoRoot, rest, json, scope);
      case "record-review-blockers":
        return await reviewBlockers(repoRoot, rest, json, scope);
      case "quality-context":
        return await qualityContext(repoRoot, rest, json, scope);
      default:
        return unhandledSubcommand(command);
    }
  } catch (error) {
    if (json) {
      printJsonError(error);
      return 1;
    }
    if (error instanceof UlwLoopError)
      process.stderr.write(`[ulw-loop] ${error.message}
`);
    else if (error instanceof Error)
      process.stderr.write(`[ulw-loop] unexpected: ${error.message}
`);
    else
      process.stderr.write(`[ulw-loop] unknown error
`);
    return 1;
  }
}
function unhandledSubcommand(command) {
  throw new UlwLoopError(`Unhandled ulw-loop subcommand: ${String(command)}.`, "ULW_LOOP_SUBCOMMAND_UNHANDLED");
}
function commandScope(argv) {
  const sessionId = readValue(argv, "--session-id") ?? resolveUlwLoopSessionIdFromEnv();
  return sessionId === null ? undefined : { sessionId };
}

// components/ulw-loop/src/ultrawork-directive.ts
import { readFileSync as readFileSync2 } from "node:fs";
var ULTRAWORK_DIRECTIVE = readFileSync2(new URL("../directive.md", import.meta.url), "utf8");
var ULTRAWORK_CURRENT_PROMPT_PATTERN = /(?:ultrawork|ulw)/i;
var ULTRAWORK_DIRECTIVE_MARKER = "<ultrawork-mode>";
var TRANSCRIPT_SEARCH_BYTES = 512000;
var CONTEXT_PRESSURE_MARKERS = [
  "context compacted",
  "context_length_exceeded",
  "skill descriptions were shortened",
  "context_too_large",
  "codex ran out of room in the model's context window",
  "your input exceeds the context window",
  "long threads and multiple compactions"
];
function buildUltraworkDirectiveOutput(input) {
  if (isContextPressureRecoveryPrompt(input.prompt))
    return "";
  if (hasUltraworkDirectiveAlreadyInTranscript(input.transcript_path))
    return "";
  if (isContextPressureTranscript(input.transcript_path))
    return "";
  return isUltraworkPrompt(input.prompt) ? formatAdditionalContextOutput(ULTRAWORK_DIRECTIVE) : "";
}
function hasUltraworkDirectiveAlreadyInTranscript(transcriptPath) {
  if (transcriptPath === undefined || transcriptPath === null)
    return false;
  try {
    const rawTranscript = readTranscriptTail(transcriptPath);
    for (const line of rawTranscript.split(/\r?\n/)) {
      const parsed = parseJsonLine(line);
      if (!isRecord3(parsed))
        continue;
      const hookSpecificOutput = parsed["hookSpecificOutput"];
      if (!isRecord3(hookSpecificOutput))
        continue;
      if (hookSpecificOutput["hookEventName"] !== "UserPromptSubmit")
        continue;
      if (typeof hookSpecificOutput["additionalContext"] === "string" && hookSpecificOutput["additionalContext"].includes(ULTRAWORK_DIRECTIVE_MARKER)) {
        return true;
      }
    }
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
  return false;
}
function readTranscriptTail(transcriptPath) {
  const rawTranscript = readFileSync2(transcriptPath);
  return rawTranscript.subarray(Math.max(0, rawTranscript.byteLength - TRANSCRIPT_SEARCH_BYTES)).toString("utf8");
}
function isUltraworkPrompt(prompt) {
  return ULTRAWORK_CURRENT_PROMPT_PATTERN.test(prompt);
}
function isContextPressureRecoveryPrompt(prompt) {
  const normalizedPrompt = prompt.toLowerCase();
  return CONTEXT_PRESSURE_MARKERS.some((marker) => normalizedPrompt.includes(marker));
}
function isContextPressureTranscript(transcriptPath) {
  if (transcriptPath === undefined || transcriptPath === null)
    return false;
  try {
    return isContextPressureRecoveryPrompt(readTranscriptTail(transcriptPath));
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function formatAdditionalContextOutput(additionalContext) {
  const normalizedContext = normalizeAdditionalContext(additionalContext);
  if (normalizedContext.length === 0)
    return "";
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: normalizedContext
    }
  };
  return `${JSON.stringify(output)}
`;
}
function normalizeAdditionalContext(additionalContext) {
  return additionalContext.replace(/\r\n/g, `
`).replace(/\r/g, `
`).trim();
}
function parseJsonLine(line) {
  if (line.trim().length === 0)
    return null;
  try {
    const parsed = JSON.parse(line);
    return parsed;
  } catch (error) {
    if (error instanceof Error)
      return null;
    throw error;
  }
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/ulw-loop/src/codex-hook.ts
var CREATE_GOAL_TOOL_NAME = "create_goal";
var CREATE_GOAL_PAYLOAD_WARNING = "Use create_goal with objective only. Omit token_budget so the goal stays unlimited, and put lifecycle status changes on update_goal.";
function parseUserPromptSubmitPayload(raw) {
  if (raw.trim().length === 0)
    return null;
  try {
    const parsed = JSON.parse(raw);
    return isUserPromptSubmitPayload(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    return null;
  }
}
function parsePreToolUsePayload(raw) {
  if (raw.trim().length === 0)
    return null;
  try {
    const parsed = JSON.parse(raw);
    return isPreToolUsePayload(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    return null;
  }
}
async function applyUserPromptUlwLoopSteering(payload, options = {}) {
  try {
    if (payload.hook_event_name !== "UserPromptSubmit")
      return "";
    const proposal = parseUlwLoopSteeringDirective(payload.prompt);
    if (proposal === null) {
      if (hasSteeringDirectiveMarker(payload.prompt))
        return "";
      return options.includeUltraworkDirective ? buildUltraworkDirectiveOutput(payload) : "";
    }
    const result = await steerUlwLoop(payload.cwd, proposal, payloadScope(payload));
    if (!result.accepted)
      return "";
    return JSON.stringify({
      status: "accepted",
      kind: result.audit.kind,
      source: result.audit.source,
      deduped: result.deduped
    });
  } catch (error) {
    if (error instanceof Error)
      return "";
    return "";
  }
}
function hasSteeringDirectiveMarker(prompt) {
  return /(?:^|\s)(?:OMO_ULW_LOOP_STEER|omo\.ulw-loop\.steer|lazyz ulw-loop steer):/u.test(prompt);
}
function payloadScope(payload) {
  return { sessionId: payload.session_id };
}
function applyPreToolUseGoalBudgetGuard(payload) {
  if (payload.hook_event_name !== "PreToolUse")
    return "";
  if (payload.tool_name !== CREATE_GOAL_TOOL_NAME)
    return "";
  if (!hasInvalidCreateGoalInput(payload.tool_input))
    return "";
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: CREATE_GOAL_PAYLOAD_WARNING,
      additionalContext: CREATE_GOAL_PAYLOAD_WARNING
    }
  };
  return `${JSON.stringify(output)}
`;
}
async function runUlwLoopHookCli(stdin, stdout, options = {}) {
  try {
    const payload = parseUserPromptSubmitPayload(await readAll(stdin));
    if (payload === null)
      return;
    const output = await applyUserPromptUlwLoopSteering(payload, options);
    if (output.length > 0)
      stdout.write(output);
  } catch (error) {
    if (error instanceof Error)
      return;
    return;
  }
}
async function runPreToolUseGoalBudgetGuardCli(stdin, stdout) {
  try {
    const payload = parsePreToolUsePayload(await readAll(stdin));
    if (payload === null)
      return;
    const output = applyPreToolUseGoalBudgetGuard(payload);
    if (output.length > 0)
      stdout.write(output);
  } catch (error) {
    if (error instanceof Error)
      return;
    return;
  }
}
function isUserPromptSubmitPayload(value) {
  if (!isRecord4(value))
    return false;
  return value["hook_event_name"] === "UserPromptSubmit" && typeof value["cwd"] === "string" && typeof value["prompt"] === "string" && typeof value["session_id"] === "string" && ["model", "permission_mode", "turn_id"].every((key) => optionalString(value[key])) && (value["transcript_path"] === undefined || value["transcript_path"] === null || typeof value["transcript_path"] === "string");
}
function isPreToolUsePayload(value) {
  if (!isRecord4(value))
    return false;
  return value["hook_event_name"] === "PreToolUse" && typeof value["cwd"] === "string" && typeof value["model"] === "string" && typeof value["permission_mode"] === "string" && typeof value["session_id"] === "string" && typeof value["tool_name"] === "string" && typeof value["tool_use_id"] === "string" && (value["transcript_path"] === null || typeof value["transcript_path"] === "string") && typeof value["turn_id"] === "string" && Object.hasOwn(value, "tool_input");
}
function hasInvalidCreateGoalInput(value) {
  return isRecord4(value) && Object.keys(value).some((key) => key !== "objective");
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function optionalString(value) {
  return value === undefined || typeof value === "string";
}
function readAll(stdin) {
  return new Promise((resolve, reject) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk instanceof Buffer ? chunk.toString() : String(chunk);
    });
    stdin.once("error", reject);
    stdin.once("end", () => resolve(data));
  });
}

// components/ulw-loop/src/cli.ts
var TOP_LEVEL_HELP = `Usage:
  lazyz ulw-loop <subcommand> [args]
  lazyz hook user-prompt-submit [--with-ultrawork]  (Codex UserPromptSubmit hook)
  lazyz help | --help | -h                          (this message)

Run \`lazyz ulw-loop help\` for ulw-loop subcommands.
`;
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(TOP_LEVEL_HELP);
    return 0;
  }
  if (command === "ulw-loop")
    return ulwLoopCommand(argv.slice(1));
  if (command === "hook") {
    const sub = argv[1];
    if (sub === "user-prompt-submit") {
      await runUlwLoopHookCli(process.stdin, process.stdout, {
        includeUltraworkDirective: argv.includes("--with-ultrawork")
      });
      return 0;
    }
    if (sub === "pre-tool-use") {
      await runPreToolUseGoalBudgetGuardCli(process.stdin, process.stdout);
      return 0;
    }
    process.stderr.write(`[omo] unknown hook subcommand: ${sub ?? "(none)"}
`);
    return 1;
  }
  if (isUlwLoopSubcommand(command))
    return ulwLoopCommand(argv);
  process.stderr.write(`[omo] unknown command: ${command}
${TOP_LEVEL_HELP}`);
  return 1;
}
main().then((code) => {
  process.exit(code);
}).catch((error) => {
  process.stderr.write(`[omo] ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
