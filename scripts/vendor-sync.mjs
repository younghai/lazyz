#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLock } from "./vendor-sync-schema.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
	throw new Error(message);
}

function verifyImportCommits(root, vendors) {
	if (!existsSync(join(root, ".git"))) return;
	for (const vendor of vendors) {
		if (vendor.source.importCommit === undefined) continue;
		execFileSync(
			"git",
			["cat-file", "-e", `${vendor.source.importCommit}^{commit}`],
			{ cwd: root, stdio: "pipe" },
		);
	}
}

function verifyPackage(vendor) {
	const spec = `${vendor.package.name}@${vendor.package.version}`;
	const metadata = JSON.parse(
		execFileSync("npm", ["view", spec, "--json"], { encoding: "utf8" }),
	);
	for (const [actual, expected, label] of [
		[metadata.version, vendor.package.version, "version"],
		[metadata.gitHead, vendor.source.commit, "gitHead"],
		[metadata.dist?.integrity, vendor.package.integrity, "integrity"],
		[metadata.dist?.shasum, vendor.package.shasum, "shasum"],
		[metadata.dist?.tarball, vendor.package.tarball, "tarball"],
	]) {
		if (actual !== expected) fail(`${spec} upstream ${label} mismatch`);
	}

	const scratch = mkdtempSync(join(tmpdir(), "lazyz-vendor-sync-"));
	try {
		const packed = JSON.parse(
			execFileSync("npm", ["pack", spec, "--json", "--ignore-scripts"], {
				cwd: scratch,
				encoding: "utf8",
			}),
		);
		const archivePath = join(scratch, packed[0].filename);
		const archive = readFileSync(archivePath);
		const sha512 = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
		if (sha512 !== vendor.package.integrity)
			fail(`${spec} tarball integrity mismatch`);
		if (
			createHash("sha256").update(archive).digest("hex") !==
			vendor.package.sha256
		)
			fail(`${spec} tarball sha256 mismatch`);
		for (const runtime of vendor.runtimes ?? []) {
			const contents = execFileSync(
				"tar",
				["-xOf", archivePath, `package/${runtime.path}`],
				{ maxBuffer: 64 * 1024 * 1024 },
			);
			if (
				createHash("sha256").update(contents).digest("hex") !== runtime.sha256
			)
				fail(`${spec} runtime ${runtime.path} hash mismatch`);
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

function verifyForkCommit(vendor) {
	if (vendor.source.canonicalRepository === undefined) return;
	const refs = execFileSync("git", ["ls-remote", vendor.source.repository], {
		encoding: "utf8",
	});
	if (!refs.split("\n").some((line) => line.startsWith(vendor.source.commit)))
		fail(`${vendor.id} fork does not advertise ${vendor.source.commit}`);
}

function verifyLatestDistTags(vendors) {
	for (const vendor of vendors) {
		const tag = vendor.package?.trackDistTag;
		if (tag === undefined) continue;
		const spec = `${vendor.package.name}@${tag}`;
		const latest = JSON.parse(
			execFileSync("npm", ["view", spec, "version", "--json"], {
				encoding: "utf8",
			}),
		);
		if (typeof latest !== "string") fail(`${spec} returned a non-string version`);
		if (latest !== vendor.package.version) {
			fail(
				`${vendor.id} ${tag} drift: pinned ${vendor.package.version}, latest ${latest}`,
			);
		}
	}
}

function verifyUpstream(vendors) {
	for (const vendor of vendors) {
		if (vendor.package !== undefined) {
			verifyPackage(vendor);
			verifyForkCommit(vendor);
			continue;
		}
		const scratch = mkdtempSync(join(tmpdir(), "lazyz-vendor-git-"));
		try {
			execFileSync("git", ["init", "--quiet"], { cwd: scratch });
			execFileSync(
				"git",
				[
					"fetch",
					"--quiet",
					"--depth=1",
					vendor.source.repository,
					vendor.source.commit,
				],
				{ cwd: scratch },
			);
			const fetched = execFileSync("git", ["rev-parse", "FETCH_HEAD"], {
				cwd: scratch,
				encoding: "utf8",
			}).trim();
			if (fetched !== vendor.source.commit)
				fail(`${vendor.id} upstream commit mismatch`);
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	}
}

function parseArgs(argv) {
	let root = DEFAULT_ROOT;
	let upstream = false;
	let latest = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--check") continue;
		if (argument === "--check-latest") {
			latest = true;
			continue;
		}
		if (argument === "--verify-upstream") {
			upstream = true;
			continue;
		}
		if (argument === "--root" && argv[index + 1] !== undefined) {
			root = resolve(argv[index + 1]);
			index += 1;
			continue;
		}
		fail(`unknown argument: ${argument}`);
	}
	return { latest, root, upstream };
}

function main() {
	const { latest, root, upstream } = parseArgs(process.argv.slice(2));
	const lock = JSON.parse(readFileSync(join(root, "vendor.lock.json"), "utf8"));
	validateLock(root, lock);
	verifyImportCommits(root, lock.vendors);
	if (upstream) verifyUpstream(lock.vendors);
	if (latest) verifyLatestDistTags(lock.vendors);
	console.log(
		`vendor lock OK (${lock.vendors.length} records${upstream ? ", upstream verified" : ""}${latest ? ", latest dist-tags verified" : ""})`,
	);
}

try {
	main();
} catch (error) {
	console.error(
		`vendor sync check failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
}
