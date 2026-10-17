import { createHash } from "node:crypto";
import { lstatSync as nodeLstatSync, readFileSync as nodeReadFileSync, realpathSync as nodeRealpathSync, } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
const MAX_RECEIPT_BYTES = 1024 * 1024;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACTS = 32;
const MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024;
export function validateStructuredReceipt(message, contract, options) {
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
    if (current === null ||
        receipt.source.commitSha !== current.commitSha ||
        receipt.source.treeOid !== current.treeOid) {
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
        if (!isRecord(value) ||
            !hasExactKeys(value, ["schemaVersion", "taskId", "runId", "role", "phase", "source", "criteria", "artifacts"]))
            return null;
        const source = value["source"];
        if (!isRecord(source) || !hasExactKeys(source, ["commitSha", "treeOid"]))
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
            artifacts: value["artifacts"],
        };
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return null;
        throw error;
    }
}
function matchesDispatch(receipt, contract) {
    return (receipt.taskId === contract.taskId &&
        receipt.runId === contract.runId &&
        receipt.role === contract.role &&
        receipt.phase === contract.phase);
}
function matchesCriteria(receipt, contract) {
    return (receipt.criteria.length === contract.criterionRefs.length &&
        receipt.criteria.every((criterion, index) => criterion.criterionRef === contract.criterionRefs[index]));
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
        return inside(realRoot, realCwd) &&
            inside(realFile, realRoot) &&
            link.isSymbolicLink?.() !== true &&
            stat.size > 0 &&
            stat.size <= maxBytes &&
            (stat.isFile?.() ?? true)
            ? resolved
            : null;
    }
    catch (error) {
        if (error instanceof Error)
            return null;
        throw error;
    }
}
function isCriterion(value) {
    return (isRecord(value) &&
        hasExactKeys(value, ["criterionRef", "outcome", "invocation", "exitCode", "artifactIds"]) &&
        typeof value["criterionRef"] === "string" &&
        value["outcome"] === "passed" &&
        typeof value["invocation"] === "string" &&
        value["invocation"].trim().length > 0 &&
        value["exitCode"] === 0 &&
        Array.isArray(value["artifactIds"]) &&
        value["artifactIds"].length > 0 &&
        value["artifactIds"].every((id) => typeof id === "string" && id.length > 0));
}
function isArtifact(value) {
    return (isRecord(value) &&
        hasExactKeys(value, ["id", "path", "sha256"]) &&
        typeof value["id"] === "string" &&
        value["id"].length > 0 &&
        typeof value["path"] === "string" &&
        typeof value["sha256"] === "string" &&
        /^[a-f0-9]{64}$/.test(value["sha256"]));
}
function isRole(value) {
    return value === "implementer" || value === "reviewer" || value === "qa" || value === "writer";
}
function isPhase(value) {
    return value === "execute" || value === "verify" || value === "final";
}
function sha256(path) {
    return createHash("sha256").update(nodeReadFileSync(path)).digest("hex");
}
function inside(path, directory) {
    const rel = relative(directory, path);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function failure(signature) {
    return { ok: false, signature };
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
