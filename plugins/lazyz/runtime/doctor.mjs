import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";

import { checkCliDistFreshness, checkPayloadManifest } from "./artifact-integrity.mjs";
import { codexMutationPlan, environmentChecks } from "./doctor-environment.mjs";
import { inspectZcodeHooks, ZCODE_HOST_CONTRACT } from "./zcode-contract.mjs";

const ENTRYPOINTS = [
	"dist/cli/index.js",
	"components/bootstrap/dist/cli.js",
	"components/codegraph/dist/cli.js",
	"components/ulw-loop/dist/cli.js",
];
const MANIFESTS = ["package.json", ".zcode-plugin/plugin.json", "hooks/hooks.json", ".mcp.json"];

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

async function checkFiles(pluginRoot, paths, id) {
	const missing = [];
	for (const path of paths) {
		try {
			await access(join(pluginRoot, path), constants.R_OK);
		} catch {
			missing.push(path);
		}
	}
	return missing.length === 0
		? { id, status: "pass", paths }
		: { id, status: "fail", missing, message: `missing required ${id}` };
}

function mcpEntrypoints(manifest) {
	const paths = [];
	for (const server of Object.values(manifest?.mcpServers ?? {})) {
		if (server === null || typeof server !== "object" || typeof server.url === "string") continue;
		const cwd = typeof server.cwd === "string" ? server.cwd : ".";
		const candidates = [server.command, ...(Array.isArray(server.args) ? server.args : [])];
		for (const candidate of candidates) {
			if (typeof candidate !== "string" || isAbsolute(candidate) || !/\.(?:[cm]?js|sh)$/.test(candidate)) continue;
			paths.push(posix.normalize(posix.join(cwd.replaceAll("\\", "/"), candidate.replaceAll("\\", "/"))));
		}
	}
	return paths;
}

async function configuredEntrypoints(pluginRoot) {
	const hooks = await readJson(join(pluginRoot, "hooks", "hooks.json"));
	const mcp = await readJson(join(pluginRoot, ".mcp.json"));
	const invalid = [];
	const hookContract = inspectZcodeHooks(hooks);
	if (hooks === null) invalid.push("hooks/hooks.json: invalid JSON");
	if (mcp === null) invalid.push(".mcp.json: invalid JSON");
	return {
		paths: [...new Set([...ENTRYPOINTS, ...hookContract.paths, ...mcpEntrypoints(mcp)])].sort(),
		hookContract,
		invalid,
	};
}

async function checkEntrypoints(pluginRoot, configured) {
	const invalid = [...configured.invalid];
	for (const path of configured.paths) {
		if (!safeManifestPath(path)) {
			invalid.push(`${path}: unsafe path`);
			continue;
		}
		try {
			const absolute = join(pluginRoot, path);
			const info = await lstat(absolute);
			if (info.isSymbolicLink()) {
				try {
					await access(absolute, constants.R_OK);
					invalid.push(`${path}: symbolic link is not allowed`);
				} catch {
					invalid.push(`${path}: dangling symbolic link`);
				}
			} else if (!info.isFile()) invalid.push(`${path}: not a regular file`);
			else if (info.size === 0) invalid.push(`${path}: empty file`);
		} catch {
			invalid.push(`${path}: missing or unreadable`);
		}
	}
	return invalid.length === 0
		? { id: "entrypoints", status: "pass", paths: configured.paths }
		: { id: "entrypoints", status: "fail", paths: configured.paths, invalid, message: "invalid local command entrypoints" };
}

async function checkVersions(pluginRoot) {
	const packageManifest = await readJson(join(pluginRoot, "package.json"));
	const pluginManifest = await readJson(join(pluginRoot, ".zcode-plugin", "plugin.json"));
	const packageVersion = packageManifest?.version;
	const pluginVersion = pluginManifest?.version;
	if (typeof packageVersion !== "string" || typeof pluginVersion !== "string") {
		return { check: { id: "versions", status: "fail", message: "version is missing from a manifest" }, version: null };
	}
	if (packageVersion !== pluginVersion) {
		return {
			check: { id: "versions", status: "fail", packageVersion, pluginVersion, message: "manifest versions differ" },
			version: packageVersion,
		};
	}
	const mismatchedComponents = [];
	let componentEntries = [];
	try {
		componentEntries = await readdir(join(pluginRoot, "components"), { withFileTypes: true });
	} catch {
		componentEntries = [];
	}
	for (const entry of componentEntries.filter((candidate) => candidate.isDirectory())) {
		const manifest = await readJson(join(pluginRoot, "components", entry.name, "package.json"));
		if (manifest !== null && typeof manifest.version === "string" && manifest.version !== packageVersion) {
			mismatchedComponents.push(`${entry.name}:${manifest.version}`);
		}
	}
	if (mismatchedComponents.length > 0) {
		return {
			check: { id: "versions", status: "fail", version: packageVersion, mismatchedComponents },
			version: packageVersion,
		};
	}
	return { check: { id: "versions", status: "pass", version: packageVersion }, version: packageVersion };
}

async function checkPermissions(pluginRoot, entrypoints) {
	const unsafe = [];
	for (const path of entrypoints) {
		try {
			const info = await lstat(join(pluginRoot, path));
			const directlyExecutable = path === "dist/cli/index.js" || path.endsWith(".sh");
			if ((info.mode & 0o022) !== 0 || (directlyExecutable && (info.mode & 0o111) === 0)) unsafe.push(path);
		} catch {
			// The entrypoint check owns missing paths.
		}
	}
	return unsafe.length === 0
		? { id: "permissions", status: "pass" }
		: { id: "permissions", status: "fail", paths: unsafe, message: "entrypoints must not be group/world writable; direct launchers must be executable" };
}

function safeManifestPath(path) {
	return typeof path === "string" && path.length > 0 && !path.includes("\0") && !isAbsolute(path)
		&& !/^[A-Za-z]:/.test(path) && !path.startsWith("\\") && !path.replaceAll("\\", "/").split("/").includes("..");
}

export async function runDoctor({ env = process.env, home, pluginRoot }) {
	const versions = await checkVersions(pluginRoot);
	const entrypoints = await configuredEntrypoints(pluginRoot);
	const requestedMode = env.LAZYZ_ARTIFACT_MODE;
	const artifactMode = requestedMode === "development" || requestedMode === "release"
		? requestedMode
		: (await access(join(pluginRoot, "runtime", "cli.mjs"), constants.R_OK).then(() => "development").catch(() => "release"));
	const requiredPayloadFiles = [...new Set([...MANIFESTS, ...entrypoints.paths, "dist/cli/provenance.json"])].sort();
	const hostChecks = await environmentChecks({ env, home, pluginRoot, version: versions.version });
	const checks = [
		entrypoints.hookContract,
		await checkEntrypoints(pluginRoot, entrypoints),
		await checkFiles(pluginRoot, MANIFESTS, "manifests"),
		versions.check,
		await checkPermissions(pluginRoot, entrypoints.paths),
		await checkCliDistFreshness(pluginRoot),
		await checkPayloadManifest(pluginRoot, { artifactMode, requiredFiles: requiredPayloadFiles }),
		...hostChecks,
	];
	const codex = await codexMutationPlan(pluginRoot);
	return {
		product: "LazyZ",
		version: versions.version,
		artifactMode,
		hostContract: ZCODE_HOST_CONTRACT,
		ok: checks.every((check) => check.status !== "fail"),
		checks,
		mutationPlan: { codex },
	};
}
