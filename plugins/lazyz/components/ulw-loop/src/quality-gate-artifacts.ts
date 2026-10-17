import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { UlwLoopScope } from "./paths.js";
import { ulwLoopRelativeDir } from "./paths.js";
import { invalid, textField } from "./quality-gate-fields.js";
import { UlwLoopError } from "./types.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function qaRelativeRoot(scope?: UlwLoopScope): string {
	return `${ulwLoopRelativeDir(scope)}/qa`;
}

function within(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function canonicalArtifactPath(repoRoot: string, path: string, field: string, scope?: UlwLoopScope): string {
	if (isAbsolute(path)) invalid(`${field} must be repository-relative.`, field);
	const normalized = path.replaceAll("\\", "/");
	const qaRoot = qaRelativeRoot(scope);
	if (!normalized.startsWith(`${qaRoot}/`) || normalized.includes("/../") || normalized.endsWith("/..")) {
		invalid(`${field} must be confined to ${qaRoot}.`, field);
	}
	const canonicalRepo = realpathSync(repoRoot);
	const expected = join(canonicalRepo, ...normalized.split("/"));
	const absolute = resolve(repoRoot, path);
	const stat = lstatSync(absolute);
	if (stat.isSymbolicLink() || !stat.isFile()) invalid(`${field} must be a regular file, not a link.`, field);
	const canonical = realpathSync(absolute);
	const canonicalQa = realpathSync(join(repoRoot, qaRoot));
	if (canonical !== expected || !within(canonicalQa, canonical))
		invalid(`${field} escapes the scoped QA directory.`, field);
	return canonical;
}

function fileSha256(path: string, field: string): string {
	const before = lstatSync(path);
	const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const opened = fstatSync(descriptor);
		if (!opened.isFile() || opened.ino !== before.ino || opened.size !== before.size) {
			invalid(`${field} changed while it was opened.`, field);
		}
		const digest = createHash("sha256").update(readFileSync(descriptor)).digest("hex");
		const after = fstatSync(descriptor);
		if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) {
			invalid(`${field} changed while it was hashed.`, field);
		}
		return digest;
	} finally {
		closeSync(descriptor);
	}
}

export function validateBoundFile(
	repoRoot: string,
	pathValue: unknown,
	hashValue: unknown,
	field: string,
	scope?: UlwLoopScope,
): { readonly path: string; readonly sha256: string } {
	const path = textField(pathValue, `${field}.path`);
	const sha256 = textField(hashValue, `${field}.sha256`);
	if (!SHA256_PATTERN.test(sha256)) invalid(`${field}.sha256 must be a lowercase SHA-256 digest.`, `${field}.sha256`);
	let canonical: string;
	try {
		canonical = canonicalArtifactPath(repoRoot, path, `${field}.path`, scope);
	} catch (error) {
		if (error instanceof UlwLoopError) throw error;
		invalid(`${field}.path must point to an existing scoped QA file.`, `${field}.path`);
	}
	try {
		if (fileSha256(canonical, `${field}.path`) !== sha256)
			invalid(`${field}.sha256 does not match the file.`, `${field}.sha256`);
	} catch (error) {
		if (error instanceof UlwLoopError) throw error;
		invalid(`${field}.path could not be hashed safely.`, `${field}.path`);
	}
	return { path, sha256 };
}
