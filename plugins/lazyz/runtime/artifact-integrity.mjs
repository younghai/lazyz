import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const MODE_PATTERN = /^0[0-7]{3}$/;
const CLI_OUTPUT = "dist/cli/index.js";
const CLI_PROVENANCE = "dist/cli/provenance.json";
const BUILD_CONTRACT = { entryPoint: "runtime/cli.mjs", format: "esm", platform: "node", target: "node20" };

function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}

async function readJsonState(path) {
	try {
		return { kind: "parsed", value: JSON.parse(await readFile(path, "utf8")) };
	} catch (error) {
		if (error?.code === "ENOENT") return { kind: "missing" };
		return { kind: "malformed" };
	}
}

function safePayloadPath(path) {
	return (
		typeof path === "string" &&
		path.length > 0 &&
		!path.includes("\\") &&
		!isAbsolute(path) &&
		posix.normalize(path) === path &&
		path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
	);
}

async function regularFileInvalid(pluginRoot, path) {
	const parts = path.split("/");
	let parent = pluginRoot;
	for (const part of parts.slice(0, -1)) {
		parent = join(parent, part);
		const info = await lstat(parent);
		if (info.isSymbolicLink() || !info.isDirectory()) return `${path}: unsafe parent`;
	}
	const info = await lstat(join(pluginRoot, path));
	return !info.isFile() || info.isSymbolicLink() ? `${path}: not a regular file` : null;
}

async function payloadFiles(pluginRoot, current = pluginRoot, prefix = "") {
	const files = [];
	const invalid = [];
	for (const entry of await readdir(current, { withFileTypes: true })) {
		const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		if (path === "payload-manifest.json") continue;
		if (entry.isSymbolicLink()) {
			invalid.push(`${path}: symbolic link is not allowed`);
			continue;
		}
		if (entry.isDirectory()) {
			const nested = await payloadFiles(pluginRoot, join(current, entry.name), path);
			files.push(...nested.files);
			invalid.push(...nested.invalid);
		} else if (entry.isFile()) files.push(path);
		else invalid.push(`${path}: not a regular file`);
	}
	return { files: files.sort(), invalid };
}

function provenanceSchemaInvalid(provenance) {
	if (provenance === null || typeof provenance !== "object") return true;
	if (provenance.schemaVersion !== 1) return true;
	if (JSON.stringify(provenance.build) !== JSON.stringify(BUILD_CONTRACT)) return true;
	if (provenance.buildConfigSha256 !== sha256(JSON.stringify(BUILD_CONTRACT))) return true;
	if (provenance.output?.path !== CLI_OUTPUT || !DIGEST_PATTERN.test(provenance.output?.sha256)) return true;
	if (!Array.isArray(provenance.sources) || provenance.sources.length === 0) return true;
	return provenance.sources.some((source) => !safePayloadPath(source?.path) || !DIGEST_PATTERN.test(source?.sha256));
}

async function expectedBuildSources(pluginRoot) {
	const runtimeNames = await readdir(join(pluginRoot, "runtime")).catch(() => []);
	const candidates = [
		...runtimeNames.filter((name) => name.endsWith(".mjs")).map((name) => `runtime/${name}`),
		"scripts/build-cli.mjs",
		"package.json",
	];
	const present = [];
	for (const path of candidates) {
		try {
			await access(join(pluginRoot, path), constants.R_OK);
			present.push(path);
		} catch {
			// Optional fixture inputs are absent; real developer trees contain them.
		}
	}
	return [...new Set(present)].sort();
}

export async function checkCliDistFreshness(pluginRoot) {
	const sourcePaths = await expectedBuildSources(pluginRoot);
	const sourcePresent = sourcePaths.some((path) => path.startsWith("runtime/"));
	const state = await readJsonState(join(pluginRoot, CLI_PROVENANCE));
	if (!sourcePresent && state.kind === "missing") return { id: "cli-dist-freshness", status: "pass", sourcePresent: false };
	if (state.kind !== "parsed") {
		return { id: "cli-dist-freshness", status: "fail", sourcePresent, message: "CLI build provenance is missing or malformed" };
	}
	if (provenanceSchemaInvalid(state.value)) {
		return { id: "cli-dist-freshness", status: "fail", sourcePresent, invalid: ["provenance schema is invalid"] };
	}
	const invalid = [];
	const sourceMap = new Map(state.value.sources.map((source) => [source.path, source.sha256]));
	if (sourcePresent) {
		for (const path of sourcePaths) {
			const expected = sourceMap.get(path);
			if (expected === undefined) invalid.push(`${path}: missing from provenance`);
			else if (sha256(await readFile(join(pluginRoot, path))) !== expected) invalid.push(`${path}: sha256 mismatch`);
		}
		for (const path of sourceMap.keys()) {
			if (!sourcePaths.includes(path)) invalid.push(`${path}: unexpected provenance source`);
		}
	}
	try {
		if (sha256(await readFile(join(pluginRoot, CLI_OUTPUT))) !== state.value.output.sha256) invalid.push(`${CLI_OUTPUT}: sha256 mismatch`);
	} catch {
		invalid.push(`${CLI_OUTPUT}: missing or unreadable`);
	}
	return invalid.length === 0
		? { id: "cli-dist-freshness", status: "pass", sourcePresent, sources: sourcePresent ? sourcePaths.length : undefined }
		: { id: "cli-dist-freshness", status: "fail", sourcePresent, invalid };
}

export async function checkPayloadManifest(pluginRoot, { artifactMode, requiredFiles }) {
	const state = await readJsonState(join(pluginRoot, "payload-manifest.json"));
	if (state.kind === "missing") {
		return artifactMode === "release"
			? { id: "payload-manifest", status: "fail", present: false, message: "payload manifest is required in release mode" }
			: { id: "payload-manifest", status: "pass", present: false };
	}
	if (state.kind === "malformed") {
		return { id: "payload-manifest", status: "fail", present: true, message: "payload manifest is malformed JSON" };
	}
	const manifest = state.value;
	if (
		manifest === null ||
		typeof manifest !== "object" ||
		manifest.schemaVersion !== 1 ||
		manifest.artifactMode !== "release" ||
		typeof manifest.sourceCommit !== "string" ||
		manifest.sourceCommit.length === 0 ||
		!Array.isArray(manifest.files)
	) {
		return { id: "payload-manifest", status: "fail", present: true, invalid: ["manifest schema is invalid"] };
	}
	const invalid = [];
	const seen = new Set();
	for (const entry of manifest.files) {
		if (
			entry === null ||
			typeof entry !== "object" ||
			!safePayloadPath(entry.path) ||
			!DIGEST_PATTERN.test(entry.sha256) ||
			!MODE_PATTERN.test(entry.mode)
		) {
			invalid.push("unsafe or malformed manifest entry");
			continue;
		}
		if (seen.has(entry.path)) {
			invalid.push(`${entry.path}: duplicate path`);
			continue;
		}
		seen.add(entry.path);
		try {
			const fileInvalid = await regularFileInvalid(pluginRoot, entry.path);
			if (fileInvalid !== null) {
				invalid.push(fileInvalid);
				continue;
			}
			const absolute = join(pluginRoot, entry.path);
			const info = await lstat(absolute);
			if (sha256(await readFile(absolute)) !== entry.sha256) invalid.push(`${entry.path}: sha256 mismatch`);
			if ((info.mode & 0o777).toString(8).padStart(4, "0") !== entry.mode) invalid.push(`${entry.path}: mode mismatch`);
		} catch {
			invalid.push(`${entry.path}: missing or unreadable`);
		}
	}
	for (const path of requiredFiles) {
		if (!seen.has(path)) invalid.push(`${path}: required file missing from manifest`);
	}
	if (artifactMode === "release") {
		const actual = await payloadFiles(pluginRoot);
		invalid.push(...actual.invalid);
		for (const path of actual.files) {
			if (!seen.has(path)) invalid.push(`${path}: unexpected payload file`);
		}
	}
	return invalid.length === 0
		? { id: "payload-manifest", status: "pass", present: true, files: seen.size }
		: { id: "payload-manifest", status: "fail", present: true, invalid };
}
