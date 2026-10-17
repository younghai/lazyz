import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const pluginRoot = resolve(import.meta.dirname, "..");
const sourceCli = join(pluginRoot, "runtime", "cli.mjs");
const build = { entryPoint: "runtime/cli.mjs", format: "esm", platform: "node", target: "node20" };

function digest(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runDoctor(root, artifactMode = "release") {
	return spawnSync(process.execPath, [sourceCli, "doctor", "--json"], {
		env: { ...process.env, LAZYZ_ARTIFACT_MODE: artifactMode, LAZYZ_PLUGIN_ROOT: root },
		encoding: "utf8",
	});
}

async function makePluginFixture() {
	const root = await mkdtemp(join(tmpdir(), "lazyz-release-test-"));
	for (const path of [
		".zcode-plugin",
		"hooks",
		"dist/cli",
		"components/bootstrap/dist",
		"components/codegraph/dist",
		"components/ulw-loop/dist",
	]) mkdirSync(join(root, path), { recursive: true });
	for (const path of [
		"dist/cli/index.js",
		"components/bootstrap/dist/cli.js",
		"components/codegraph/dist/cli.js",
		"components/ulw-loop/dist/cli.js",
	]) writeFileSync(join(root, path), "#!/usr/bin/env node\n", { mode: 0o755 });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@lazyz/plugin", version: "1.2.3" }));
	writeFileSync(join(root, ".zcode-plugin/plugin.json"), JSON.stringify({ name: "lazyz", version: "1.2.3" }));
	writeFileSync(join(root, "hooks/hooks.json"), JSON.stringify({ hooks: {} }));
	writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
	return root;
}

function fixtureFiles(root, current = root) {
	const files = [];
	for (const entry of readdirSync(current, { withFileTypes: true })) {
		const absolute = join(current, entry.name);
		if (entry.isDirectory()) files.push(...fixtureFiles(root, absolute));
		else if (entry.isFile() && entry.name !== "payload-manifest.json") files.push(absolute.slice(root.length + 1));
	}
	return files.sort();
}

function writeReleaseManifest(root, { omitted = [] } = {}) {
	const provenancePath = join(root, "dist/cli/provenance.json");
	writeFileSync(provenancePath, JSON.stringify({
		build,
		buildConfigSha256: createHash("sha256").update(JSON.stringify(build)).digest("hex"),
		output: { path: "dist/cli/index.js", sha256: digest(join(root, "dist/cli/index.js")) },
		schemaVersion: 1,
		sources: [{ path: "runtime/cli.mjs", sha256: "1".repeat(64) }],
	}));
	const omittedPaths = new Set(omitted);
	const files = fixtureFiles(root).filter((path) => !omittedPaths.has(path)).map((path) => {
		const info = lstatSync(join(root, path));
		return { mode: (info.mode & 0o777).toString(8).padStart(4, "0"), path, sha256: digest(join(root, path)) };
	});
	writeFileSync(join(root, "payload-manifest.json"), JSON.stringify({ artifactMode: "release", files, schemaVersion: 1, sourceCommit: "abc123" }));
}

test("Given a payload manifest with a bad digest, when doctor runs, then it fails the payload integrity check", async () => {
	const fixture = await makePluginFixture();
	writeReleaseManifest(fixture);
	const manifestPath = join(fixture, "payload-manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	manifest.files.find((file) => file.path === "package.json").sha256 = "0".repeat(64);
	writeFileSync(manifestPath, JSON.stringify(manifest));
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.deepEqual(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").invalid, ["package.json: sha256 mismatch"]);
});

test("Given release mode without a payload manifest, when doctor runs, then it fails closed", async () => {
	const fixture = await makePluginFixture();
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.match(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").message, /required/i);
});

test("Given malformed payload JSON, when doctor runs in release mode, then it distinguishes corruption from absence", async () => {
	const fixture = await makePluginFixture();
	writeFileSync(join(fixture, "payload-manifest.json"), "{broken-json\n");
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.match(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").message, /malformed/i);
});

test("Given a source-free release with complete manifest provenance, when doctor runs, then it validates without runtime sources", async () => {
	const fixture = await makePluginFixture();
	writeReleaseManifest(fixture);
	const result = runDoctor(fixture);
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const report = JSON.parse(result.stdout);
	assert.equal(report.checks.find((check) => check.id === "payload-manifest").status, "pass");
	assert.equal(report.checks.find((check) => check.id === "cli-dist-freshness").sourcePresent, false);
});

test("Given malformed provenance inside a hashed source-free release, when doctor runs, then it rejects the provenance schema", async () => {
	const fixture = await makePluginFixture();
	writeReleaseManifest(fixture);
	const provenancePath = join(fixture, "dist/cli/provenance.json");
	writeFileSync(provenancePath, JSON.stringify({ schemaVersion: 1 }));
	const manifestPath = join(fixture, "payload-manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	manifest.files.find((file) => file.path === "dist/cli/provenance.json").sha256 = digest(provenancePath);
	writeFileSync(manifestPath, JSON.stringify(manifest));
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.deepEqual(JSON.parse(result.stdout).checks.find((check) => check.id === "cli-dist-freshness").invalid, ["provenance schema is invalid"]);
});

test("Given an unlisted file in a release payload, when doctor runs, then it rejects unexpected content", async () => {
	const fixture = await makePluginFixture();
	writeReleaseManifest(fixture);
	writeFileSync(join(fixture, "unexpected.txt"), "not declared\n");
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.ok(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").invalid.includes("unexpected.txt: unexpected payload file"));
});

test("Given a release manifest omitting a required entrypoint, when doctor runs, then it rejects incomplete coverage", async () => {
	const fixture = await makePluginFixture();
	writeReleaseManifest(fixture, { omitted: ["components/bootstrap/dist/cli.js"] });
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.ok(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").invalid.includes("components/bootstrap/dist/cli.js: required file missing from manifest"));
});

test("Given a manifest path below a symbolic-link parent, when doctor runs, then it rejects the unsafe parent", async () => {
	const fixture = await makePluginFixture();
	const outside = await mkdtemp(join(tmpdir(), "lazyz-release-outside-"));
	writeFileSync(join(outside, "payload.txt"), "outside\n");
	symlinkSync(outside, join(fixture, "linked"));
	writeReleaseManifest(fixture);
	const manifestPath = join(fixture, "payload-manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	manifest.files.push({ mode: "0644", path: "linked/payload.txt", sha256: digest(join(outside, "payload.txt")) });
	writeFileSync(manifestPath, JSON.stringify(manifest));
	const result = runDoctor(fixture);
	assert.equal(result.status, 1);
	assert.ok(JSON.parse(result.stdout).checks.find((check) => check.id === "payload-manifest").invalid.includes("linked/payload.txt: unsafe parent"));
});

test("Given source content drift with backdated mtimes, when doctor runs, then provenance detects stale output", async () => {
	const fixture = await makePluginFixture();
	mkdirSync(join(fixture, "runtime"));
	writeFileSync(join(fixture, "runtime/cli.mjs"), "export const behavior = 'before';\n");
	writeFileSync(join(fixture, "dist/cli/provenance.json"), JSON.stringify({
		build,
		buildConfigSha256: createHash("sha256").update(JSON.stringify(build)).digest("hex"),
		output: { path: "dist/cli/index.js", sha256: digest(join(fixture, "dist/cli/index.js")) },
		schemaVersion: 1,
		sources: [{ path: "runtime/cli.mjs", sha256: digest(join(fixture, "runtime/cli.mjs")) }],
	}));
	const old = new Date(1_000);
	utimesSync(join(fixture, "runtime/cli.mjs"), old, old);
	utimesSync(join(fixture, "dist/cli/index.js"), old, old);
	writeFileSync(join(fixture, "runtime/cli.mjs"), "export const behavior = 'after';\n");
	utimesSync(join(fixture, "runtime/cli.mjs"), old, old);
	const result = runDoctor(fixture, "development");
	assert.equal(result.status, 1);
	assert.ok(JSON.parse(result.stdout).checks.find((check) => check.id === "cli-dist-freshness").invalid.includes("runtime/cli.mjs: sha256 mismatch"));
});
