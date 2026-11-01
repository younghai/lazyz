import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve(import.meta.dirname, "vendor-sync.mjs");

function createFixture(overrides = {}) {
	const root = join(tmpdir(), `lazyz-vendor-sync-${randomUUID()}`);
	mkdirSync(join(root, "vendor", "example"), { recursive: true });
	writeFileSync(join(root, "vendor", "example", "anchor.txt"), "pinned\n");
	const lock = {
		schemaVersion: 1,
		vendors: [
			{
				id: "example",
				kind: "git-subtree",
				localPath: "vendor/example",
				source: {
					repository: "https://example.com/upstream.git",
					commit: "0123456789abcdef0123456789abcdef01234567",
					importCommit: "89abcdef0123456789abcdef0123456789abcdef",
				},
				anchors: [
					{
						path: "vendor/example/anchor.txt",
						sha256: createHash("sha256").update("pinned\n").digest("hex"),
					},
				],
			},
		],
		...overrides,
	};
	writeFileSync(
		join(root, "vendor.lock.json"),
		`${JSON.stringify(lock, null, 2)}\n`,
	);
	return root;
}

function runCheck(root, args = [], env = process.env) {
	return spawnSync(process.execPath, [scriptPath, "--check", "--root", root, ...args], {
		encoding: "utf8",
		env,
	});
}

function installFakeNpm(root, latestVersion) {
	const bin = join(root, "bin");
	mkdirSync(bin);
	const executable = join(bin, process.platform === "win32" ? "npm.cmd" : "npm");
	const body =
		process.platform === "win32"
			? `@echo off\r\necho "${latestVersion}"\r\n`
			: `#!/bin/sh\nprintf '"%s"\\n' '${latestVersion}'\n`;
	writeFileSync(executable, body);
	if (process.platform !== "win32") chmodSync(executable, 0o755);
	return { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
}

test("given the repository lock when checking vendors then every local provenance anchor passes", () => {
	const result = runCheck(resolve(import.meta.dirname, ".."));

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /vendor lock OK/);
});

test("given a missing local vendor path when checking then the command fails with the path", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	const lockPath = join(root, "vendor.lock.json");
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	lock.vendors[0].localPath = "vendor/missing";
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

	const result = runCheck(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /vendor\/missing/);
});

test("given a changed provenance anchor when checking then the command reports hash drift", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	writeFileSync(join(root, "vendor", "example", "anchor.txt"), "changed\n");

	const result = runCheck(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /hash mismatch/);
});

test("given a path outside the repository when checking then the command rejects traversal", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	const lockPath = join(root, "vendor.lock.json");
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	lock.vendors[0].anchors[0].path = "../outside.txt";
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

	const result = runCheck(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /safe repository-relative path/);
});

test("given an unsupported lock schema when checking then the command rejects it", (context) => {
	const root = createFixture({ schemaVersion: 2 });
	context.after(() => rmSync(root, { recursive: true, force: true }));

	const result = runCheck(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /schemaVersion must be 1/);
});

test("given a local npm fork without selective sync metadata when checking then the command rejects it", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	const lockPath = join(root, "vendor.lock.json");
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	lock.vendors[0].kind = "npm-fork";
	lock.vendors[0].package = {
		name: "example",
		version: "1.0.0",
		tarball: "https://example.com/example.tgz",
		integrity: "sha512-example",
		shasum: "0123456789abcdef0123456789abcdef01234567",
		sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	};
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

	const result = runCheck(root);

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /syncedAt must be YYYY-MM-DD/);
});

test("given a tracked npm dist-tag with a newer release when checking latest then the command reports drift", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	const lockPath = join(root, "vendor.lock.json");
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	lock.vendors[0].package = {
		name: "example",
		version: "1.0.0",
		trackDistTag: "beta",
		tarball: "https://example.com/example.tgz",
		integrity: "sha512-example",
		shasum: "0123456789abcdef0123456789abcdef01234567",
		sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	};
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

	const result = runCheck(root, ["--check-latest"], installFakeNpm(root, "1.1.0"));

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /example beta drift: pinned 1\.0\.0, latest 1\.1\.0/);
});

test("given a tracked npm dist-tag matching the lock when checking latest then the command passes", (context) => {
	const root = createFixture();
	context.after(() => rmSync(root, { recursive: true, force: true }));
	const lockPath = join(root, "vendor.lock.json");
	const lock = JSON.parse(readFileSync(lockPath, "utf8"));
	lock.vendors[0].package = {
		name: "example",
		version: "1.0.0",
		trackDistTag: "beta",
		tarball: "https://example.com/example.tgz",
		integrity: "sha512-example",
		shasum: "0123456789abcdef0123456789abcdef01234567",
		sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	};
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

	const result = runCheck(root, ["--check-latest"], installFakeNpm(root, "1.0.0"));

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /latest dist-tags verified/);
});
