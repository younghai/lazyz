import { lstatSync as nodeLstatSync, realpathSync as nodeRealpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
export function hasValidEvidenceReceipt(lastAssistantMessage, context) {
    const receipt = extractEvidenceReceipt(lastAssistantMessage);
    if (receipt === null)
        return false;
    const evidenceRoot = resolve(context.cwd, ".omo", "evidence");
    const resolvedPath = isAbsolute(receipt.path) ? resolve(receipt.path) : resolve(context.cwd, receipt.path);
    if (!isPathInsideDirectory(resolvedPath, evidenceRoot))
        return false;
    try {
        if (!isNonEmptyFileInsideEvidenceRoot(resolvedPath, evidenceRoot, context))
            return false;
        if (receipt.kind === "ordinary")
            return true;
        return isCurrentFinalReceipt(resolvedPath, context);
    }
    catch (error) {
        if (error instanceof Error)
            return false;
        throw error;
    }
}
function isCurrentFinalReceipt(receiptPath, context) {
    const receipt = parseGitProvenance(context.fs.readFileSync(receiptPath, "utf8"));
    const current = context.readGitProvenance(context.cwd);
    return (receipt !== null &&
        current !== null &&
        receipt.commitSha === current.commitSha &&
        receipt.treeOid === current.treeOid);
}
function parseGitProvenance(raw) {
    try {
        const value = JSON.parse(raw);
        if (!isRecord(value))
            return null;
        const commitSha = value["commitSha"];
        const treeOid = value["treeOid"];
        return typeof commitSha === "string" && typeof treeOid === "string" ? { commitSha, treeOid } : null;
    }
    catch (error) {
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
    const relativePath = relative(directoryPath, filePath);
    return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
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
    const linkStat = context.fs.lstatSync?.(filePath) ?? nodeLstatSync(filePath);
    if (linkStat.isSymbolicLink?.() === true)
        return false;
    const stat = context.fs.statSync(filePath);
    return stat.size > 0 && (stat.isFile?.() ?? true);
}
function realPath(path, fs) {
    return fs.realpathSync?.(path) ?? nodeRealpathSync(path);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
