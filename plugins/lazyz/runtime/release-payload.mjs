import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const ALLOWED_ROOT_DIRECTORIES = new Set([".zcode-plugin", "agents", "commands", "components", "dist", "docs", "hooks", "policies", "skills"]);
const ALLOWED_ROOT_FILES = new Set([".mcp.json", "AGENTS.md", "CHANGELOG.md", "LICENSE", "NOTICE", "README.md", "marketplace.json", "package.json"]);
const EXCLUDED_DIRECTORIES = new Set([
	"node_modules",
	"src",
	"test",
	"tests",
	".git",
	".github",
	".omo",
	".pytest_cache",
	".ruff_cache",
	"__pycache__",
	"release",
]);
const EXCLUDED_FILES = new Set([
	"bun.lock",
	"package-lock.json",
	"payload-manifest.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	".DS_Store",
]);
const VENDOR_RUNTIME_ROOTS = ["vendor/git-bash-mcp/dist", "vendor/lsp-daemon/dist"];

function normalizedRelative(root, path) {
	return relative(root, path).split("\\").join("/");
}

function allowedRootPath(path, isDirectory) {
	const [rootName] = path.split("/");
	if (ALLOWED_ROOT_DIRECTORIES.has(rootName)) return true;
	if (!isDirectory && ALLOWED_ROOT_FILES.has(path)) return true;
	if (path === "runtime" || path.startsWith("runtime/ast-grep-mcp")) return true;
	if (path === "scripts" || (!isDirectory && path === "scripts/run-hook.sh")) return true;
	return path === "vendor" || path.startsWith("vendor/");
}

function excludedPath(path, entryName, isDirectory) {
	if (entryName === "payload-manifest.json" || EXCLUDED_FILES.has(entryName) || entryName === ".env" || entryName.startsWith(".env.")) return true;
	return isDirectory && (EXCLUDED_DIRECTORIES.has(entryName) || path.split("/").some((part) => EXCLUDED_DIRECTORIES.has(part)));
}

function includeVendorPath(path, isDirectory) {
	if (path === "vendor") return isDirectory;
	if (!path.startsWith("vendor/")) return true;
	return VENDOR_RUNTIME_ROOTS.some((runtimeRoot) => {
		if (isDirectory) return runtimeRoot === path || runtimeRoot.startsWith(`${path}/`) || path.startsWith(`${runtimeRoot}/`);
		return path.startsWith(`${runtimeRoot}/`);
	});
}

function includeRuntimePath(path, isDirectory) {
	if (path === "runtime") return isDirectory;
	if (!path.startsWith("runtime/")) return true;
	const runtimeRoot = "runtime/ast-grep-mcp";
	return runtimeRoot === path || runtimeRoot.startsWith(`${path}/`) || path.startsWith(`${runtimeRoot}/`);
}

function includeScriptPath(path, isDirectory) {
	if (path === "scripts") return isDirectory;
	if (!path.startsWith("scripts/")) return true;
	return !isDirectory && path === "scripts/run-hook.sh";
}

async function collectFiles(root, excludedRoot, current = root) {
	const result = [];
	for (const entry of await readdir(current, { withFileTypes: true })) {
		const absolute = join(current, entry.name);
		const path = normalizedRelative(root, absolute);
		const resolved = resolve(absolute);
		if (resolved === excludedRoot || resolved.startsWith(`${excludedRoot}${sep}`)) continue;
		if (excludedPath(path, entry.name, entry.isDirectory())) continue;
		if (!allowedRootPath(path, entry.isDirectory())) continue;
		if (!includeVendorPath(path, entry.isDirectory())) continue;
		if (!includeRuntimePath(path, entry.isDirectory())) continue;
		if (!includeScriptPath(path, entry.isDirectory())) continue;
		if (entry.isSymbolicLink()) throw new Error(`release payload path must not be a symbolic link: ${path}`);
		if (entry.isDirectory()) result.push(...(await collectFiles(root, excludedRoot, absolute)));
		else if (entry.isFile()) result.push(path);
	}
	return result.sort();
}

function octalMode(mode) {
	return (mode & 0o777).toString(8).padStart(4, "0");
}

export async function buildReleasePayload({ outputRoot, sourceCommit, sourceRoot }) {
	await mkdir(outputRoot, { recursive: true, mode: 0o700 });
	const existing = await readdir(outputRoot);
	if (existing.length > 0) throw new Error(`payload output must be empty: ${outputRoot}`);
	const files = [];
	for (const path of await collectFiles(sourceRoot, resolve(outputRoot))) {
		const source = join(sourceRoot, path);
		const target = join(outputRoot, path);
		const info = await lstat(source);
		const content = await readFile(source);
		await mkdir(dirname(target), { recursive: true });
		await copyFile(source, target);
		await chmod(target, info.mode & 0o777);
		files.push({ path, sha256: createHash("sha256").update(content).digest("hex"), mode: octalMode(info.mode) });
	}
	const manifest = { artifactMode: "release", schemaVersion: 1, sourceCommit, files };
	await writeFile(join(outputRoot, "payload-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
	return manifest;
}
