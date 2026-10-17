#!/usr/bin/env node

// components/lazycodex-executor-verify/src/cli.ts
import {
  existsSync,
  lstatSync as lstatSync2,
  mkdirSync,
  readdirSync,
  readFileSync as readFileSync2,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";

// components/lazycodex-executor-verify/src/dispatch-contract.ts
var DISPATCH_MARKER = "LAZYCODEX_DISPATCH_V1: ";
var HARD_MAX_CALLS = 5;
var HARD_MAX_SAME_FAILURE = 3;
var ROLES = ["implementer", "reviewer", "qa", "writer"];
var PHASES = ["execute", "verify", "final"];
function parseDispatchPrompt(prompt) {
  const markerCount = prompt.split(DISPATCH_MARKER).length - 1;
  if (markerCount === 0)
    return { kind: "absent" };
  if (markerCount !== 1)
    return { kind: "malformed", reason: "dispatch-marker-count" };
  const markerLine = prompt.split(`
`).find((line) => line.startsWith(DISPATCH_MARKER));
  if (markerLine === undefined)
    return { kind: "malformed", reason: "dispatch-marker-format" };
  const raw = markerLine.slice(DISPATCH_MARKER.length).trim();
  try {
    const value = JSON.parse(raw);
    return isDispatchContract(value) ? { kind: "structured", contract: value } : { kind: "malformed", reason: "dispatch-schema-invalid" };
  } catch (error) {
    if (error instanceof SyntaxError)
      return { kind: "malformed", reason: "dispatch-json-invalid" };
    throw error;
  }
}
function sameFrozenContract(left, right) {
  return left.schemaVersion === right.schemaVersion && left.workId === right.workId && left.taskId === right.taskId && left.role === right.role && left.phase === right.phase && left.budget.maxCalls === right.budget.maxCalls && left.budget.maxSameFailure === right.budget.maxSameFailure && left.criterionRefs.length === right.criterionRefs.length && left.criterionRefs.every((criterion, index) => criterion === right.criterionRefs[index]);
}
function isDispatchContract(value) {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "workId", "taskId", "runId", "role", "phase", "criterionRefs", "budget"]))
    return false;
  const budget = value["budget"];
  return value["schemaVersion"] === 1 && isSafeId(value["workId"]) && isSafeId(value["taskId"]) && isSafeId(value["runId"]) && isStringMember(value["role"], ROLES) && isStringMember(value["phase"], PHASES) && isCriterionRefs(value["criterionRefs"]) && isRecord(budget) && hasExactKeys(budget, ["maxCalls", "maxSameFailure"]) && isBoundedInteger(budget["maxCalls"], HARD_MAX_CALLS) && isBoundedInteger(budget["maxSameFailure"], HARD_MAX_SAME_FAILURE);
}
function isCriterionRefs(value) {
  return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every((criterion) => typeof criterion === "string" && /^(?:[GC][0-9]{3,}|G[0-9]{3,}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\/C[0-9]{3,})$/.test(criterion));
}
function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function isBoundedInteger(value, maximum) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum;
}
function isStringMember(value, members) {
  return typeof value === "string" && members.some((member) => member === value);
}
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/git-provenance.ts
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync } from "node:fs";
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
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
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
var readGitProvenance = (cwd) => inspectGitProvenance(cwd).provenance;

// components/lazycodex-executor-verify/src/structured-receipt.ts
import { createHash as createHash2 } from "node:crypto";
import {
  lstatSync as nodeLstatSync,
  readFileSync as nodeReadFileSync,
  realpathSync as nodeRealpathSync
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
var MAX_RECEIPT_BYTES = 1024 * 1024;
var MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
var MAX_ARTIFACTS = 32;
var MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024;
function validateStructuredReceipt(message, contract, options) {
  const marker = extractMarker(message);
  if (marker === null)
    return failure("receipt-marker-missing");
  if (contract.phase === "final" && marker.kind !== "final")
    return failure("receipt-final-marker-required");
  const receiptPath = confinedRegularFile(marker.path, options.cwd, options.fs, MAX_RECEIPT_BYTES);
  if (receiptPath === null)
    return failure("receipt-path-invalid");
  const receipt = parseReceipt(options.fs.readFileSync(receiptPath, "utf8"));
  if (receipt === null)
    return failure("receipt-schema-invalid");
  if (!matchesDispatch(receipt, contract))
    return failure("receipt-dispatch-mismatch");
  const current = options.readGitProvenance(options.cwd);
  if (current === null || receipt.source.commitSha !== current.commitSha || receipt.source.treeOid !== current.treeOid) {
    return failure("receipt-source-mismatch");
  }
  if (!matchesCriteria(receipt, contract))
    return failure("receipt-criteria-mismatch");
  return validateArtifacts(receipt, options);
}
function validateArtifacts(receipt, options) {
  const artifactsById = new Map(receipt.artifacts.map((artifact) => [artifact.id, artifact]));
  if (receipt.artifacts.length > MAX_ARTIFACTS)
    return failure("artifact-count-exceeded");
  if (artifactsById.size !== receipt.artifacts.length)
    return failure("artifact-id-duplicate");
  const referenced = new Set(receipt.criteria.flatMap((criterion) => criterion.artifactIds));
  if (referenced.size === 0 || referenced.size !== artifactsById.size)
    return failure("artifact-binding-mismatch");
  let totalBytes = 0;
  for (const id of referenced) {
    const artifact = artifactsById.get(id);
    if (artifact === undefined)
      return failure("artifact-binding-mismatch");
    const path = confinedRegularFile(artifact.path, options.cwd, options.fs, MAX_ARTIFACT_BYTES);
    if (path === null)
      return failure("artifact-path-invalid");
    totalBytes += options.fs.statSync(path).size;
    if (totalBytes > MAX_TOTAL_ARTIFACT_BYTES)
      return failure("artifact-total-size-exceeded");
    if (sha256(path) !== artifact.sha256)
      return failure("artifact-hash-mismatch");
  }
  return { ok: true };
}
function parseReceipt(raw) {
  try {
    const value = JSON.parse(raw);
    if (!isRecord2(value) || !hasExactKeys2(value, ["schemaVersion", "taskId", "runId", "role", "phase", "source", "criteria", "artifacts"]))
      return null;
    const source = value["source"];
    if (!isRecord2(source) || !hasExactKeys2(source, ["commitSha", "treeOid"]))
      return null;
    if (!Array.isArray(value["criteria"]) || !value["criteria"].every(isCriterion))
      return null;
    if (!Array.isArray(value["artifacts"]) || !value["artifacts"].every(isArtifact))
      return null;
    if (value["schemaVersion"] !== 1 || typeof value["taskId"] !== "string" || typeof value["runId"] !== "string")
      return null;
    if (!isRole(value["role"]) || !isPhase(value["phase"]))
      return null;
    if (typeof source["commitSha"] !== "string" || typeof source["treeOid"] !== "string")
      return null;
    return {
      schemaVersion: 1,
      taskId: value["taskId"],
      runId: value["runId"],
      role: value["role"],
      phase: value["phase"],
      source: { commitSha: source["commitSha"], treeOid: source["treeOid"] },
      criteria: value["criteria"],
      artifacts: value["artifacts"]
    };
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
}
function matchesDispatch(receipt, contract) {
  return receipt.taskId === contract.taskId && receipt.runId === contract.runId && receipt.role === contract.role && receipt.phase === contract.phase;
}
function matchesCriteria(receipt, contract) {
  return receipt.criteria.length === contract.criterionRefs.length && receipt.criteria.every((criterion, index) => criterion.criterionRef === contract.criterionRefs[index]);
}
function extractMarker(message) {
  if (message === undefined)
    return null;
  const matches = [...message.matchAll(/(?:^|\n)(FINAL_EVIDENCE_RECORDED|EVIDENCE_RECORDED):\s*(\S+)/g)];
  if (matches.length !== 1)
    return null;
  const marker = matches[0]?.[1];
  const path = matches[0]?.[2];
  if (path === undefined)
    return null;
  return marker === "FINAL_EVIDENCE_RECORDED" ? { kind: "final", path } : { kind: "ordinary", path };
}
function confinedRegularFile(path, cwd, fs, maxBytes) {
  const evidenceRoot = resolve(cwd, ".omo", "evidence");
  const resolved = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  if (!inside(resolved, evidenceRoot) || !fs.existsSync(resolved))
    return null;
  try {
    const realCwd = fs.realpathSync?.(cwd) ?? nodeRealpathSync(cwd);
    const realRoot = fs.realpathSync?.(evidenceRoot) ?? nodeRealpathSync(evidenceRoot);
    const realFile = fs.realpathSync?.(resolved) ?? nodeRealpathSync(resolved);
    const link = fs.lstatSync?.(resolved) ?? nodeLstatSync(resolved);
    const stat = fs.statSync(resolved);
    return inside(realRoot, realCwd) && inside(realFile, realRoot) && link.isSymbolicLink?.() !== true && stat.size > 0 && stat.size <= maxBytes && (stat.isFile?.() ?? true) ? resolved : null;
  } catch (error) {
    if (error instanceof Error)
      return null;
    throw error;
  }
}
function isCriterion(value) {
  return isRecord2(value) && hasExactKeys2(value, ["criterionRef", "outcome", "invocation", "exitCode", "artifactIds"]) && typeof value["criterionRef"] === "string" && value["outcome"] === "passed" && typeof value["invocation"] === "string" && value["invocation"].trim().length > 0 && value["exitCode"] === 0 && Array.isArray(value["artifactIds"]) && value["artifactIds"].length > 0 && value["artifactIds"].every((id) => typeof id === "string" && id.length > 0);
}
function isArtifact(value) {
  return isRecord2(value) && hasExactKeys2(value, ["id", "path", "sha256"]) && typeof value["id"] === "string" && value["id"].length > 0 && typeof value["path"] === "string" && typeof value["sha256"] === "string" && /^[a-f0-9]{64}$/.test(value["sha256"]);
}
function isRole(value) {
  return value === "implementer" || value === "reviewer" || value === "qa" || value === "writer";
}
function isPhase(value) {
  return value === "execute" || value === "verify" || value === "final";
}
function sha256(path) {
  return createHash2("sha256").update(nodeReadFileSync(path)).digest("hex");
}
function inside(path, directory) {
  const rel = relative(directory, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function failure(signature) {
  return { ok: false, signature };
}
function hasExactKeys2(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/task-state.ts
import { readdirSync as nodeReaddirSync, realpathSync as nodeRealpathSync3 } from "node:fs";
import { join as join3 } from "node:path";

// components/lazycodex-executor-verify/src/task-state-path.ts
import { createHash as createHash3 } from "node:crypto";
import { realpathSync as nodeRealpathSync2 } from "node:fs";
import { dirname, isAbsolute as isAbsolute2, join as join2, relative as relative2, resolve as resolve2 } from "node:path";
function getTaskStatePath(cwd, sessionId, taskId) {
  return join2(sessionStateDir(cwd, sessionId), `${digest(taskId)}.json`);
}
function sessionStateDir(cwd, sessionId) {
  return join2(cwd, ".omo", "lazycodex-executor-verify", "tasks", digest(sessionId));
}
function ensureSafeStateDirectory(cwd, directory, fs) {
  try {
    for (const ancestor of ancestorsBetween(cwd, directory)) {
      if (fs.existsSync(ancestor) && fs.lstatSync?.(ancestor).isSymbolicLink?.() === true)
        return false;
    }
    fs.mkdirSync(directory, { recursive: true, mode: 448 });
    return isSafeExistingStateDirectory(cwd, directory, fs);
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function isSafeExistingStateDirectory(cwd, directory, fs) {
  const realCwd = fs.realpathSync?.(cwd) ?? nodeRealpathSync2(cwd);
  const realDirectory = fs.realpathSync?.(directory) ?? nodeRealpathSync2(directory);
  return isInside(realDirectory, realCwd) && fs.lstatSync?.(directory).isSymbolicLink?.() !== true;
}
function isInside(path, directory) {
  const rel = relative2(directory, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute2(rel);
}
function digestStateKey(value) {
  return digest(value);
}
function ancestorsBetween(cwd, directory) {
  const root = resolve2(cwd);
  const result = [];
  let current = resolve2(directory);
  while (current !== root && isInside(current, root)) {
    result.push(current);
    current = dirname(current);
  }
  return result.reverse();
}
function digest(value) {
  return createHash3("sha256").update(value).digest("hex");
}

// components/lazycodex-executor-verify/src/task-state.ts
var MAX_STATE_BYTES = 1024 * 1024;
function reserveRun(cwd, sessionId, contract, toolUseId, fs) {
  return withTaskLock(cwd, sessionId, contract.taskId, fs, () => {
    const read = readTaskState(cwd, sessionId, contract.taskId, fs);
    if (read.kind === "invalid")
      return { ok: false, reason: "task-state-invalid" };
    const existing = read.kind === "valid" ? read.state : null;
    if (existing !== null && !sameFrozenContract(existing.contract, contract))
      return { ok: false, reason: "task-contract-changed" };
    const state = existing ?? { schemaVersion: 1, contract, runs: [], exhausted: false };
    if (state.exhausted)
      return { ok: false, reason: "task-budget-exhausted" };
    if (state.runs.some((run) => run.status === "passed"))
      return { ok: false, reason: "task-already-passed" };
    const prior = state.runs.find((run) => run.runId === contract.runId);
    if (prior?.status === "reserved")
      return prior.toolUseId === toolUseId ? { ok: true, state } : { ok: false, reason: "run-id-reused" };
    if (prior !== undefined)
      return { ok: false, reason: "run-already-finished" };
    if (state.runs.some((run) => run.status === "reserved"))
      return { ok: false, reason: "task-run-in-flight" };
    if (state.runs.length >= contract.budget.maxCalls) {
      const exhausted = { ...state, exhausted: true };
      return writeOrFail(cwd, sessionId, exhausted, fs, "task-call-budget-exhausted");
    }
    const reserved = {
      ...state,
      runs: [...state.runs, { runId: contract.runId, toolUseId, status: "reserved" }]
    };
    return writeOrFail(cwd, sessionId, reserved, fs);
  });
}
function recordRunResult(cwd, sessionId, contract, toolUseId, result, fs) {
  return withTaskLock(cwd, sessionId, contract.taskId, fs, () => {
    const read = readTaskState(cwd, sessionId, contract.taskId, fs);
    if (read.kind !== "valid" || !sameFrozenContract(read.state.contract, contract))
      return { ok: false, reason: "run-not-reserved" };
    const state = read.state;
    const run = state.runs.find((candidate) => candidate.runId === contract.runId);
    if (run === undefined)
      return { ok: false, reason: "run-not-reserved" };
    if (run.toolUseId !== toolUseId)
      return { ok: false, reason: "run-call-mismatch" };
    if (run.status !== "reserved")
      return { ok: true, state };
    const replacement = result.kind === "passed" ? { runId: run.runId, toolUseId: run.toolUseId, status: "passed" } : { runId: run.runId, toolUseId: run.toolUseId, status: "failed", failureSignature: result.signature };
    const runs = state.runs.map((candidate) => candidate.runId === run.runId ? replacement : candidate);
    const sameFailures = result.kind === "failed" ? runs.filter((candidate) => candidate.failureSignature === result.signature).length : 0;
    const exhausted = state.exhausted || result.kind === "failed" && (sameFailures >= contract.budget.maxSameFailure || runs.length >= contract.budget.maxCalls);
    return writeOrFail(cwd, sessionId, { ...state, runs, exhausted }, fs);
  });
}
function inspectSessionTasks(cwd, sessionId, fs) {
  const directory = sessionStateDir(cwd, sessionId);
  if (!fs.existsSync(directory))
    return { tasks: [], invalid: false };
  if (!isSafeExistingStateDirectory(cwd, directory, fs))
    return { tasks: [], invalid: true };
  try {
    const entries = fs.readdirSync?.(directory) ?? nodeReaddirSync(directory);
    let invalid = false;
    const tasks = entries.filter((entry) => entry.endsWith(".json")).flatMap((entry) => {
      const read = readStateFile(join3(directory, entry), cwd, fs);
      if (read.kind !== "valid") {
        invalid = true;
        return [];
      }
      return [read.state];
    });
    return { tasks, invalid };
  } catch (error) {
    if (error instanceof Error)
      return { tasks: [], invalid: true };
    throw error;
  }
}
function readTaskState(cwd, sessionId, taskId, fs) {
  const path = getTaskStatePath(cwd, sessionId, taskId);
  return fs.existsSync(path) ? readStateFile(path, cwd, fs) : { kind: "missing" };
}
function readStateFile(path, cwd, fs) {
  try {
    const link = fs.lstatSync?.(path);
    const stat = fs.statSync(path);
    if (link?.isSymbolicLink?.() === true || stat.size <= 0 || stat.size > MAX_STATE_BYTES || (stat.isFile?.() ?? true) === false)
      return { kind: "invalid" };
    const realPath = fs.realpathSync?.(path) ?? nodeRealpathSync3(path);
    if (!isInside(realPath, fs.realpathSync?.(cwd) ?? nodeRealpathSync3(cwd)))
      return { kind: "invalid" };
    const state = parseTaskState(fs.readFileSync(path, "utf8"));
    return state === null ? { kind: "invalid" } : { kind: "valid", state };
  } catch (error) {
    if (error instanceof Error)
      return { kind: "invalid" };
    throw error;
  }
}
function parseTaskState(raw) {
  try {
    const value = JSON.parse(raw);
    if (!isRecord3(value) || value["schemaVersion"] !== 1 || !isRecord3(value["contract"]) || !Array.isArray(value["runs"]) || typeof value["exhausted"] !== "boolean")
      return null;
    const parsed = parseDispatchPrompt(`LAZYCODEX_DISPATCH_V1: ${JSON.stringify(value["contract"])}`);
    if (parsed.kind !== "structured" || !value["runs"].every(isRunState))
      return null;
    return { schemaVersion: 1, contract: parsed.contract, runs: value["runs"], exhausted: value["exhausted"] };
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
}
function writeOrFail(cwd, sessionId, state, fs, reason) {
  return writeTaskState(cwd, sessionId, state.contract.taskId, state, fs) ? reason === undefined ? { ok: true, state } : { ok: false, reason } : { ok: false, reason: "task-state-write-rejected" };
}
function writeTaskState(cwd, sessionId, taskId, state, fs) {
  const directory = sessionStateDir(cwd, sessionId);
  if (!ensureSafeStateDirectory(cwd, directory, fs))
    return false;
  const path = getTaskStatePath(cwd, sessionId, taskId);
  if (fs.existsSync(path) && readStateFile(path, cwd, fs).kind === "invalid")
    return false;
  const temporary = `${path}.${process.pid}.${Date.now()}.${digestStateKey(state.contract.runId).slice(0, 12)}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(state)}
`, { flag: "wx", mode: 384 });
    fs.renameSync(temporary, path);
    return true;
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function withTaskLock(cwd, sessionId, taskId, fs, action) {
  const directory = sessionStateDir(cwd, sessionId);
  if (!ensureSafeStateDirectory(cwd, directory, fs))
    return { ok: false, reason: "task-state-path-rejected" };
  const lock = join3(directory, `${digestStateKey(taskId)}.lock`);
  try {
    fs.mkdirSync(lock, { recursive: false, mode: 448 });
    if (!isSafeExistingStateDirectory(cwd, lock, fs)) {
      fs.rmSync(lock, { force: true, recursive: true });
      return { ok: false, reason: "task-state-lock-rejected" };
    }
  } catch (error) {
    if (error instanceof Error)
      return { ok: false, reason: "task-state-busy" };
    throw error;
  }
  try {
    return action();
  } finally {
    fs.rmSync(lock, { force: true, recursive: true });
  }
}
function isRunState(value) {
  return isRecord3(value) && typeof value["runId"] === "string" && typeof value["toolUseId"] === "string" && (value["status"] === "reserved" || value["status"] === "passed" || value["status"] === "failed") && (value["failureSignature"] === undefined || typeof value["failureSignature"] === "string");
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/directive.ts
import { readFileSync } from "node:fs";
var LAZYCODEX_EXECUTOR_VERIFY_DIRECTIVE = readFileSync(new URL("../directive.md", import.meta.url), "utf8");
function renderDirective(attempts, lastAssistantMessage) {
  return LAZYCODEX_EXECUTOR_VERIFY_DIRECTIVE.replaceAll("{{ATTEMPT_COUNT}}", String(attempts)).replaceAll("{{LAST_ASSISTANT_MESSAGE}}", lastAssistantMessage ?? "(last_assistant_message was omitted)");
}

// components/lazycodex-executor-verify/src/evidence-receipt.ts
import { lstatSync as nodeLstatSync2, realpathSync as nodeRealpathSync4 } from "node:fs";
import { isAbsolute as isAbsolute3, relative as relative3, resolve as resolve3 } from "node:path";
function hasValidEvidenceReceipt(lastAssistantMessage, context) {
  const receipt = extractEvidenceReceipt(lastAssistantMessage);
  if (receipt === null)
    return false;
  const evidenceRoot = resolve3(context.cwd, ".omo", "evidence");
  const resolvedPath = isAbsolute3(receipt.path) ? resolve3(receipt.path) : resolve3(context.cwd, receipt.path);
  if (!isPathInsideDirectory(resolvedPath, evidenceRoot))
    return false;
  try {
    if (!isNonEmptyFileInsideEvidenceRoot(resolvedPath, evidenceRoot, context))
      return false;
    if (receipt.kind === "ordinary")
      return true;
    return isCurrentFinalReceipt(resolvedPath, context);
  } catch (error) {
    if (error instanceof Error)
      return false;
    throw error;
  }
}
function isCurrentFinalReceipt(receiptPath, context) {
  const receipt = parseGitProvenance(context.fs.readFileSync(receiptPath, "utf8"));
  const current = context.readGitProvenance(context.cwd);
  return receipt !== null && current !== null && receipt.commitSha === current.commitSha && receipt.treeOid === current.treeOid;
}
function parseGitProvenance(raw) {
  try {
    const value = JSON.parse(raw);
    if (!isRecord4(value))
      return null;
    const commitSha = value["commitSha"];
    const treeOid = value["treeOid"];
    return typeof commitSha === "string" && typeof treeOid === "string" ? { commitSha, treeOid } : null;
  } catch (error) {
    if (error instanceof SyntaxError)
      return null;
    throw error;
  }
}
function extractEvidenceReceipt(message) {
  if (message === undefined)
    return null;
  const match = /(?:^|\n)(FINAL_EVIDENCE_RECORDED|EVIDENCE_RECORDED):\s*(\S+)/.exec(message);
  const marker = match?.[1];
  const path = match?.[2];
  if (marker === undefined || path === undefined)
    return null;
  return marker === "FINAL_EVIDENCE_RECORDED" ? { kind: "final", path } : { kind: "ordinary", path };
}
function isPathInsideDirectory(filePath, directoryPath) {
  const relativePath = relative3(directoryPath, filePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute3(relativePath);
}
function isNonEmptyFileInsideEvidenceRoot(filePath, evidenceRoot, context) {
  if (!context.fs.existsSync(filePath))
    return false;
  const realCwd = realPath(context.cwd, context.fs);
  const realEvidenceRoot = realPath(evidenceRoot, context.fs);
  const realFilePath = realPath(filePath, context.fs);
  if (!isPathInsideDirectory(realEvidenceRoot, realCwd))
    return false;
  if (!isPathInsideDirectory(realFilePath, realEvidenceRoot))
    return false;
  const linkStat = context.fs.lstatSync?.(filePath) ?? nodeLstatSync2(filePath);
  if (linkStat.isSymbolicLink?.() === true)
    return false;
  const stat = context.fs.statSync(filePath);
  return stat.size > 0 && (stat.isFile?.() ?? true);
}
function realPath(path, fs) {
  return fs.realpathSync?.(path) ?? nodeRealpathSync4(path);
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/state.ts
import { join as join4 } from "node:path";
var MAX_ATTEMPTS = 3;
function readAttemptState(cwd, sessionId, agentId, fs) {
  const statePath = getStatePath(cwd, sessionId, agentId);
  if (!fs.existsSync(statePath))
    return { attempts: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (isAttemptState(parsed))
      return parsed;
    return { attempts: 0 };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error)
      return { attempts: 0 };
    throw error;
  }
}
function writeAttemptState(cwd, sessionId, agentId, state, fs) {
  const stateDir = getStateDir(cwd);
  const statePath = getStatePath(cwd, sessionId, agentId);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(stateDir, { recursive: true, mode: 448 });
  fs.writeFileSync(tempPath, `${JSON.stringify(state)}
`);
  fs.renameSync(tempPath, statePath);
}
function clearAttemptState(cwd, sessionId, agentId, fs) {
  fs.rmSync(getStatePath(cwd, sessionId, agentId), { force: true });
}
function getStatePath(cwd, sessionId, agentId) {
  return join4(getStateDir(cwd), `${sanitizeKey(sessionId)}-${sanitizeKey(agentId)}.json`);
}
function getStateDir(cwd) {
  return join4(cwd, ".omo", "lazycodex-executor-verify");
}
function sanitizeKey(value) {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "missing";
}
function isAttemptState(value) {
  return isRecord5(value) && typeof value["attempts"] === "number" && Number.isInteger(value["attempts"]);
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/legacy-hook.ts
var LEGACY_EXECUTOR_AGENTS = [
  "executor",
  "lazycodex-executor",
  "lazycodex-worker-high",
  "lazycodex-worker-medium",
  "lazycodex-worker-low"
];
function runSubagentStopHook(input, fs, options = {}) {
  if (!isSubagentStopInput(input))
    return "";
  if (!LEGACY_EXECUTOR_AGENTS.some((agent) => agent === input.agent_type))
    return "";
  if (transcriptHasContextPressureMarker(input.transcript_path, fs))
    return "";
  if (hasValidEvidenceReceipt(input.last_assistant_message, {
    cwd: input.cwd,
    fs,
    readGitProvenance: options.readGitProvenance ?? readGitProvenance
  })) {
    clearAttemptState(input.cwd, input.session_id, input.agent_id, fs);
    return "";
  }
  const state = readAttemptState(input.cwd, input.session_id, input.agent_id, fs);
  if (state.attempts >= MAX_ATTEMPTS) {
    clearAttemptState(input.cwd, input.session_id, input.agent_id, fs);
    return "";
  }
  const attempts = state.attempts + 1;
  writeAttemptState(input.cwd, input.session_id, input.agent_id, { attempts }, fs);
  return JSON.stringify({ decision: "block", reason: renderDirective(attempts, input.last_assistant_message) });
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
function isSubagentStopInput(value) {
  return isRecord6(value) && value["hook_event_name"] === "SubagentStop" && typeof value["agent_type"] === "string" && typeof value["agent_id"] === "string" && typeof value["session_id"] === "string" && typeof value["cwd"] === "string" && typeof value["transcript_path"] === "string" && typeof value["model"] === "string" && typeof value["permission_mode"] === "string" && typeof value["stop_hook_active"] === "boolean" && optionalString(value["turn_id"]) && optionalString(value["last_assistant_message"]);
}
function optionalString(value) {
  return value === undefined || typeof value === "string";
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/codex-hook.ts
var EXECUTOR_AGENTS = [
  "general-purpose",
  "executor",
  "lazycodex-executor",
  "lazycodex-worker-high",
  "lazycodex-worker-medium",
  "lazycodex-worker-low"
];
var EXPLORE_AGENTS = ["explore", "explorer"];
var LAZYZ_AGENT_NAMESPACE = "lazyz:";
var BACKGROUND_STRUCTURED_EXECUTION_REASON = "structured-executor-background-unsupported";
function runPreToolUseHook(input, fs) {
  if (!isPreToolUseInput(input) || !isAgentTool(input.tool_name))
    return "";
  const call = parseAgentCall(input.tool_input);
  if (call === null)
    return "";
  const parsed = parseDispatchPrompt(call.prompt);
  if (parsed.kind === "malformed")
    return deny("PreToolUse", parsed.reason);
  if (parsed.kind === "structured" && call.runInBackground)
    return deny("PreToolUse", BACKGROUND_STRUCTURED_EXECUTION_REASON);
  if (parsed.kind === "absent")
    return isGovernedAgent(call.subagentType) ? deny("PreToolUse", "structured-dispatch-required") : "";
  const result = reserveRun(input.cwd, input.session_id, parsed.contract, input.tool_use_id, fs);
  return result.ok ? "" : deny("PreToolUse", result.reason);
}
function runPostToolUseHook(input, fs, options = {}) {
  if (!isPostToolUseInput(input) || !isAgentTool(input.tool_name))
    return "";
  const call = parseAgentCall(input.tool_input);
  if (call === null)
    return "";
  const parsed = parseDispatchPrompt(call.prompt);
  if (parsed.kind === "malformed")
    return postContext(parsed.reason);
  if (parsed.kind === "absent")
    return isGovernedAgent(call.subagentType) ? postContext("structured-dispatch-required") : "";
  const response = unwrapZCodeAgentResponse(input.tool_response);
  if (isBackgroundAgentResponse(response))
    return postContext("executor-background-unresolved");
  const receipt = validateStructuredReceipt(extractAssistantMessage(response), parsed.contract, {
    cwd: input.cwd,
    fs,
    readGitProvenance: options.readGitProvenance ?? readGitProvenance
  });
  const recorded = recordRunResult(input.cwd, input.session_id, parsed.contract, input.tool_use_id, receipt.ok ? { kind: "passed" } : { kind: "failed", signature: receipt.signature }, fs);
  if (!recorded.ok)
    return postContext(recorded.reason);
  return receipt.ok ? "" : postContext(receipt.signature);
}
function runPostToolUseFailureHook(input, fs) {
  if (!isPostToolUseFailureInput(input) || !isAgentTool(input.tool_name))
    return "";
  const call = parseAgentCall(input.tool_input);
  if (call === null)
    return "";
  const parsed = parseDispatchPrompt(call.prompt);
  if (parsed.kind === "malformed")
    return postFailureContext(parsed.reason);
  if (parsed.kind === "absent") {
    return isGovernedAgent(call.subagentType) ? postFailureContext("structured-dispatch-required") : "";
  }
  const recorded = recordRunResult(input.cwd, input.session_id, parsed.contract, input.tool_use_id, { kind: "failed", signature: "tool-execution-failed" }, fs);
  return postFailureContext(recorded.ok ? "tool-execution-failed" : recorded.reason);
}
function runStopHook(input, fs) {
  if (!isStopInput(input) || input.stop_hook_active)
    return "";
  const inspection = inspectSessionTasks(input.cwd, input.session_id, fs);
  if (inspection.invalid)
    return JSON.stringify({ decision: "block", reason: "Structured executor task state is invalid" });
  const unresolved = inspection.tasks.filter((task) => !task.runs.some((run) => run.status === "passed"));
  if (unresolved.length === 0 || unresolved.every((task) => task.exhausted))
    return "";
  const taskIds = unresolved.filter((task) => !task.exhausted).map((task) => task.contract.taskId).sort();
  return JSON.stringify({
    decision: "block",
    reason: `Structured executor work remains unresolved: ${taskIds.join(", ")}`
  });
}
function parseAgentCall(toolInput) {
  if (!isRecord7(toolInput) || typeof toolInput["prompt"] !== "string")
    return null;
  const subagentType = typeof toolInput["subagent_type"] === "string" ? toolInput["subagent_type"] : undefined;
  const runInBackground = toolInput["run_in_background"] === true;
  return subagentType === undefined ? { prompt: toolInput["prompt"], runInBackground } : { prompt: toolInput["prompt"], runInBackground, subagentType };
}
function isGovernedAgent(value) {
  if (value === undefined)
    return true;
  const normalized = normalizeAgentType(value);
  if (EXPLORE_AGENTS.some((agent) => agent === normalized))
    return false;
  return EXECUTOR_AGENTS.some((agent) => agent === normalized);
}
function normalizeAgentType(value) {
  const normalized = value.toLowerCase();
  return normalized.startsWith(LAZYZ_AGENT_NAMESPACE) ? normalized.slice(LAZYZ_AGENT_NAMESPACE.length) : normalized;
}
function unwrapZCodeAgentResponse(response) {
  if (!isRecord7(response) || !("response" in response))
    return response;
  return response["response"];
}
function isBackgroundAgentResponse(response) {
  return isRecord7(response) && response["status"] === "async_launched" && response["isAsync"] === true;
}
function extractAssistantMessage(response) {
  if (typeof response === "string")
    return response;
  if (!isRecord7(response))
    return;
  if (typeof response["text"] === "string")
    return response["text"];
  if (typeof response["content"] === "string")
    return response["content"];
  if (!Array.isArray(response["content"]))
    return;
  const text = response["content"].flatMap((item) => isRecord7(item) && item["type"] === "text" && typeof item["text"] === "string" ? [item["text"]] : []);
  return text.length === 0 ? undefined : text.join(`
`);
}
function deny(eventName, reason) {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, permissionDecision: "deny", permissionDecisionReason: reason }
  });
}
function postContext(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `Executor evidence failed: ${reason}. The persisted task remains unresolved.`
    }
  });
}
function postFailureContext(reason) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUseFailure",
      additionalContext: `Executor invocation failed: ${reason}. Error details were not persisted.`
    }
  });
}
function isPreToolUseInput(value) {
  return isCommonToolInput(value) && value["hook_event_name"] === "PreToolUse";
}
function isPostToolUseInput(value) {
  return isCommonToolInput(value) && value["hook_event_name"] === "PostToolUse";
}
function isPostToolUseFailureInput(value) {
  return isCommonToolInput(value) && value["hook_event_name"] === "PostToolUseFailure";
}
function isCommonToolInput(value) {
  return isRecord7(value) && typeof value["session_id"] === "string" && typeof value["cwd"] === "string" && typeof value["tool_name"] === "string" && typeof value["tool_use_id"] === "string" && Object.hasOwn(value, "tool_input");
}
function isStopInput(value) {
  return isRecord7(value) && value["hook_event_name"] === "Stop" && typeof value["session_id"] === "string" && typeof value["cwd"] === "string" && typeof value["stop_hook_active"] === "boolean";
}
function isAgentTool(value) {
  return value === "Agent" || value === "Task";
}
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// components/lazycodex-executor-verify/src/cli.ts
var nodeFileSystem = {
  existsSync,
  lstatSync: lstatSync2,
  mkdirSync,
  readFileSync: readFileSync2,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
};
var command = process.argv[2];
var subcommand = process.argv[3];
if (command === "hook" && ["pre-tool-use", "post-tool-use", "post-tool-use-failure", "stop", "subagent-stop"].includes(subcommand ?? "")) {
  await runHookCli();
} else {
  process.stderr.write(`Usage: lazycodex-executor-verify hook <pre-tool-use|post-tool-use|post-tool-use-failure|stop|subagent-stop>
`);
  process.exitCode = 1;
}
async function runHookCli() {
  const raw = await readStdin();
  if (raw.trim().length === 0)
    return;
  const parsed = parseHookInput(raw);
  const output = routeHook(parsed);
  if (output.length > 0)
    processStdout.write(output);
}
function routeHook(input) {
  switch (subcommand) {
    case "pre-tool-use":
      return runPreToolUseHook(input, nodeFileSystem);
    case "post-tool-use":
      return runPostToolUseHook(input, nodeFileSystem);
    case "post-tool-use-failure":
      return runPostToolUseFailureHook(input, nodeFileSystem);
    case "stop":
      return runStopHook(input, nodeFileSystem);
    case "subagent-stop":
      return runSubagentStopHook(input, nodeFileSystem);
    default:
      return "";
  }
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
