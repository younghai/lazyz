import { lstatSync as nodeLstatSync, realpathSync as nodeRealpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import type { GitProvenance, GitProvenanceReader } from "./git-provenance.js";
import type { HookFileSystem } from "./types.js";

type EvidenceReceiptReference =
	| { readonly kind: "ordinary"; readonly path: string }
	| { readonly kind: "final"; readonly path: string };

export type EvidenceVerifierOptions = {
	readonly readGitProvenance?: GitProvenanceReader;
};

type EvidenceValidationContext = {
	readonly cwd: string;
	readonly fs: HookFileSystem;
	readonly readGitProvenance: GitProvenanceReader;
};

export function hasValidEvidenceReceipt(
	lastAssistantMessage: string | undefined,
	context: EvidenceValidationContext,
): boolean {
	const receipt = extractEvidenceReceipt(lastAssistantMessage);
	if (receipt === null) return false;
	const evidenceRoot = resolve(context.cwd, ".omo", "evidence");
	const resolvedPath = isAbsolute(receipt.path) ? resolve(receipt.path) : resolve(context.cwd, receipt.path);
	if (!isPathInsideDirectory(resolvedPath, evidenceRoot)) return false;
	try {
		if (!isNonEmptyFileInsideEvidenceRoot(resolvedPath, evidenceRoot, context)) return false;
		if (receipt.kind === "ordinary") return true;
		return isCurrentFinalReceipt(resolvedPath, context);
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

function isCurrentFinalReceipt(receiptPath: string, context: EvidenceValidationContext): boolean {
	const receipt = parseGitProvenance(context.fs.readFileSync(receiptPath, "utf8"));
	const current = context.readGitProvenance(context.cwd);
	return (
		receipt !== null &&
		current !== null &&
		receipt.commitSha === current.commitSha &&
		receipt.treeOid === current.treeOid
	);
}

function parseGitProvenance(raw: string): GitProvenance | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (!isRecord(value)) return null;
		const commitSha = value["commitSha"];
		const treeOid = value["treeOid"];
		return typeof commitSha === "string" && typeof treeOid === "string" ? { commitSha, treeOid } : null;
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
}

function extractEvidenceReceipt(message: string | undefined): EvidenceReceiptReference | null {
	if (message === undefined) return null;
	const match = /(?:^|\n)(FINAL_EVIDENCE_RECORDED|EVIDENCE_RECORDED):\s*(\S+)/.exec(message);
	const marker = match?.[1];
	const path = match?.[2];
	if (marker === undefined || path === undefined) return null;
	return marker === "FINAL_EVIDENCE_RECORDED" ? { kind: "final", path } : { kind: "ordinary", path };
}

function isPathInsideDirectory(filePath: string, directoryPath: string): boolean {
	const relativePath = relative(directoryPath, filePath);
	return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isNonEmptyFileInsideEvidenceRoot(
	filePath: string,
	evidenceRoot: string,
	context: EvidenceValidationContext,
): boolean {
	if (!context.fs.existsSync(filePath)) return false;
	const realCwd = realPath(context.cwd, context.fs);
	const realEvidenceRoot = realPath(evidenceRoot, context.fs);
	const realFilePath = realPath(filePath, context.fs);
	if (!isPathInsideDirectory(realEvidenceRoot, realCwd)) return false;
	if (!isPathInsideDirectory(realFilePath, realEvidenceRoot)) return false;
	const linkStat = context.fs.lstatSync?.(filePath) ?? nodeLstatSync(filePath);
	if (linkStat.isSymbolicLink?.() === true) return false;
	const stat = context.fs.statSync(filePath);
	return stat.size > 0 && (stat.isFile?.() ?? true);
}

function realPath(path: string, fs: HookFileSystem): string {
	return fs.realpathSync?.(path) ?? nodeRealpathSync(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
