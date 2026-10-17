import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { samePath } from "./paths.mjs";

async function readJson(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

async function checkCodegraphVersion(pluginRoot) {
	const manifest = await readJson(join(pluginRoot, "components", "codegraph", "package.json"));
	if (manifest === null) return { id: "codegraph-version", status: "warn", message: "package manifest unavailable" };
	const version = manifest.optionalDependencies?.["@colbymchenry/codegraph"];
	return version === "1.5.0"
		? { id: "codegraph-version", status: "pass", version }
		: { id: "codegraph-version", status: "fail", version: version ?? null, message: "CodeGraph must be pinned to 1.5.0" };
}

async function checkLspSecurityFiles(pluginRoot) {
	const paths = [
		"vendor/lsp-daemon/dist/ipc-protocol.js",
		"vendor/lsp-daemon/dist/ownership.js",
		"vendor/lsp-daemon/dist/request-routing.js",
	];
	const missing = [];
	for (const path of paths) {
		try {
			await access(join(pluginRoot, path), constants.R_OK);
		} catch {
			missing.push(path);
		}
	}
	return missing.length === 0
		? { id: "lsp-auth-protocol", status: "pass", paths }
		: { id: "lsp-auth-protocol", status: "warn", missing, message: "missing required lsp-auth-protocol" };
}

async function checkLspDaemonState(home, currentVersion) {
	let entries;
	try {
		entries = await readdir(join(home, ".omo", "lsp-daemon"), { withFileTypes: true });
	} catch {
		return { id: "lsp-daemon-state", status: "pass", observed: false };
	}
	const expected = currentVersion === null ? null : `v${currentVersion}`;
	const staleVersions = entries
		.filter((entry) => entry.isDirectory() && /^v[A-Za-z0-9]/.test(entry.name) && entry.name !== expected)
		.map((entry) => entry.name.slice(1))
		.sort();
	return staleVersions.length === 0
		? { id: "lsp-daemon-state", status: "pass", observed: true }
		: { id: "lsp-daemon-state", status: "warn", observed: true, staleVersions };
}

async function checkLazyzLink(home, pluginRoot) {
	const path = join(home, ".local", "bin", "lazyz");
	try {
		const info = await lstat(path);
		if (!info.isSymbolicLink()) return { id: "lazyz-symlink", status: "warn", path, message: "path is user-owned" };
		try {
			await access(path, constants.R_OK);
		} catch {
			return { id: "lazyz-symlink", status: "fail", path, message: "link is dangling" };
		}
		return samePath(path, join(pluginRoot, "dist", "cli", "index.js"))
			? { id: "lazyz-symlink", status: "pass", path }
			: { id: "lazyz-symlink", status: "warn", path, message: "link points outside this LazyZ payload" };
	} catch {
		return { id: "lazyz-symlink", status: "warn", path, message: "link is not installed" };
	}
}

async function checkLegacyOmo(home) {
	const path = join(home, ".local", "bin", "omo");
	let info;
	try {
		info = await lstat(path);
	} catch {
		return { id: "legacy-omo", status: "pass", present: false, owned: false };
	}
	const marker = await readJson(`${path}.lazyz-owned.json`);
	const wrapperOwned = info.isFile() && (await readFile(path, "utf8")).includes("OMO_GENERATED_RUNTIME_WRAPPER");
	const owned = wrapperOwned || (marker?.owner === "lazyz" && marker?.path === path);
	return owned
		? { id: "legacy-omo", status: "warn", present: true, owned: true, path, message: "marker-owned legacy shim may be migrated" }
		: { id: "legacy-omo", status: "warn", present: true, owned: false, path, message: "user-owned legacy omo is preserved" };
}

async function checkExperimentalMemory(env, pluginRoot) {
	if (env.LAZYZ_EXPERIMENTAL_MEMORY !== "1") return { id: "experimental-memory", status: "pass", enabled: false, experimental: false };
	const policy = await readJson(join(pluginRoot, "policies", "experimental-memory.json"));
	return {
		id: "experimental-memory",
		status: "warn",
		enabled: false,
		experimental: true,
		message: policy === null
			? "unsupported: policy manifest is required; no memory runtime was loaded"
			: "policy manifest detected, but memory runtime remains deliberately unavailable pending security review",
	};
}

export async function environmentChecks({ env, home, pluginRoot, version }) {
	return [
		await checkCodegraphVersion(pluginRoot),
		await checkLspSecurityFiles(pluginRoot),
		await checkLspDaemonState(home, version),
		await checkLazyzLink(home, pluginRoot),
		await checkLegacyOmo(home),
		await checkExperimentalMemory(env, pluginRoot),
	];
}

export async function codexMutationPlan(pluginRoot) {
	const hooks = await readFile(join(pluginRoot, "hooks", "hooks.json"), "utf8").catch(() => "");
	return /migrate-codex-config/.test(hooks) ? ["remove automatic Codex config migration hook"] : [];
}
