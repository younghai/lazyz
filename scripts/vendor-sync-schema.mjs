import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, posix, resolve, sep } from "node:path";

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

function fail(message) {
	throw new Error(message);
}

function requireObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		fail(`${label} must be an object`);
	}
	return value;
}

function requireString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		fail(`${label} must be a non-empty string`);
	return value;
}

function requireDigest(value, pattern, label) {
	const digest = requireString(value, label);
	if (!pattern.test(digest)) fail(`${label} has an invalid digest`);
	return digest;
}

function requireStringArray(value, label) {
	if (!Array.isArray(value) || value.length === 0)
		fail(`${label} must be a non-empty array`);
	for (const [index, item] of value.entries())
		requireString(item, `${label}[${index}]`);
}

function repositoryPath(root, value, label) {
	const relativePath = requireString(value, label);
	if (
		isAbsolute(relativePath) ||
		relativePath.includes("\\") ||
		posix.normalize(relativePath) !== relativePath ||
		relativePath.startsWith("../")
	) {
		fail(`${label} must be a safe repository-relative path`);
	}
	const absolutePath = resolve(root, relativePath);
	if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
		fail(`${label} must be a safe repository-relative path`);
	}
	return absolutePath;
}

function validateSource(value, label) {
	const source = requireObject(value, label);
	requireString(source.repository, `${label}.repository`);
	if (source.canonicalRepository !== undefined)
		requireString(source.canonicalRepository, `${label}.canonicalRepository`);
	requireDigest(source.commit, HEX_40, `${label}.commit`);
	if (source.ref !== undefined) requireString(source.ref, `${label}.ref`);
	if (source.importCommit !== undefined)
		requireDigest(source.importCommit, HEX_40, `${label}.importCommit`);
}

function validatePackage(value, label) {
	const packageRecord = requireObject(value, label);
	requireString(packageRecord.name, `${label}.name`);
	requireString(packageRecord.version, `${label}.version`);
	if (packageRecord.trackDistTag !== undefined)
		requireString(packageRecord.trackDistTag, `${label}.trackDistTag`);
	requireString(packageRecord.tarball, `${label}.tarball`);
	requireString(packageRecord.integrity, `${label}.integrity`);
	requireDigest(packageRecord.shasum, HEX_40, `${label}.shasum`);
	requireDigest(packageRecord.sha256, HEX_64, `${label}.sha256`);
}

export function validateLock(root, lock) {
	const document = requireObject(lock, "vendor lock");
	if (document.schemaVersion !== 1) fail("vendor lock schemaVersion must be 1");
	if (!Array.isArray(document.vendors) || document.vendors.length === 0)
		fail("vendor lock vendors must be a non-empty array");
	const ids = new Set();
	for (const [index, value] of document.vendors.entries()) {
		const label = `vendors[${index}]`;
		const vendor = requireObject(value, label);
		const id = requireString(vendor.id, `${label}.id`);
		if (ids.has(id)) fail(`${label}.id duplicates ${id}`);
		ids.add(id);
		if (!["git-subtree", "npm-fork"].includes(vendor.kind))
			fail(`${label}.kind is unsupported`);
		validateSource(vendor.source, `${label}.source`);
		if (vendor.kind === "npm-fork" && vendor.localPath !== undefined) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(vendor.syncedAt ?? ""))
				fail(`${label}.syncedAt must be YYYY-MM-DD`);
			requireStringArray(vendor.importedPaths, `${label}.importedPaths`);
			requireStringArray(vendor.excludedFeatures, `${label}.excludedFeatures`);
			requireStringArray(vendor.zcodePatches, `${label}.zcodePatches`);
		}
		if (vendor.localPath !== undefined) {
			const localPath = repositoryPath(
				root,
				vendor.localPath,
				`${label}.localPath`,
			);
			if (!existsSync(localPath) || !statSync(localPath).isDirectory())
				fail(`${vendor.localPath} is not a directory`);
		}
		if (vendor.package !== undefined)
			validatePackage(vendor.package, `${label}.package`);
		if (vendor.kind === "npm-fork" && vendor.package === undefined)
			fail(`${label}.package is required for npm-fork`);
		if (!Array.isArray(vendor.anchors))
			fail(`${label}.anchors must be an array`);
		for (const [anchorIndex, anchorValue] of vendor.anchors.entries()) {
			const anchorLabel = `${label}.anchors[${anchorIndex}]`;
			const anchor = requireObject(anchorValue, anchorLabel);
			const absolutePath = repositoryPath(
				root,
				anchor.path,
				`${anchorLabel}.path`,
			);
			const expected = requireDigest(
				anchor.sha256,
				HEX_64,
				`${anchorLabel}.sha256`,
			);
			if (anchor.upstreamRuntimeSha256 !== undefined)
				requireDigest(
					anchor.upstreamRuntimeSha256,
					HEX_64,
					`${anchorLabel}.upstreamRuntimeSha256`,
				);
			if (!existsSync(absolutePath) || !statSync(absolutePath).isFile())
				fail(`${anchor.path} is not a file`);
			if (
				createHash("sha256")
					.update(readFileSync(absolutePath))
					.digest("hex") !== expected
			)
				fail(`${anchor.path} hash mismatch`);
		}
		if (vendor.runtimes === undefined) continue;
		if (!Array.isArray(vendor.runtimes))
			fail(`${label}.runtimes must be an array`);
		for (const [runtimeIndex, runtimeValue] of vendor.runtimes.entries()) {
			const runtime = requireObject(
				runtimeValue,
				`${label}.runtimes[${runtimeIndex}]`,
			);
			repositoryPath(
				root,
				runtime.path,
				`${label}.runtimes[${runtimeIndex}].path`,
			);
			requireDigest(
				runtime.sha256,
				HEX_64,
				`${label}.runtimes[${runtimeIndex}].sha256`,
			);
		}
	}
}
