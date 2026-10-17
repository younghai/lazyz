import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Only this plugin is imported. Public root documentation belongs to this repo.
const roots = new Set([
  ".zcode-plugin", "agents", "commands", "components", "dist", "docs", "hooks",
  "policies", "runtime", "scripts", "shared", "skills", "test", "vendor",
  ".mcp.json", "AGENTS.md", "CHANGELOG.md", "README.md", "LICENSE", "NOTICE",
  "package.json", "package-lock.json", "bun.lock", "marketplace.json",
]);
const excluded = new Set([
  ".git", "node_modules", ".omo", ".zcode", ".senpi", ".gjc", ".codegraph",
  ".codex", ".claude", ".cache", "coverage", ".pytest_cache", ".ruff_cache",
  "__pycache__", ".DS_Store", "Thumbs.db",
]);
const skip = (name) => excluded.has(name) || name === ".env" || name.startsWith(".env.")
  || name.startsWith(".tmp-") || /\.(log|tsbuildinfo|pyc)$/.test(name);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const missing = (error) => error?.code === "ENOENT";
const targetRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetPlugin = join(targetRoot, "plugins/lazyz");
const manifestPath = join(targetRoot, "docs/reports/source-snapshot.json");

async function statOrNull(path) {
  try { return await lstat(path); } catch (error) { if (missing(error)) return null; throw error; }
}

async function assertTarget(path, wantDirectory = false) {
  const rel = relative(targetRoot, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(targetRoot, rel) !== path) {
    throw new Error(`Target escapes publication root: ${path}`);
  }
  let current = targetRoot;
  const parts = rel.split(sep).filter(Boolean);
  for (let i = 0; i <= parts.length; i += 1) {
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw new Error(`Target symlink rejected: ${current}`);
    if (stat && (i < parts.length || wantDirectory) && !stat.isDirectory()) {
      throw new Error(`Target parent is not a directory: ${current}`);
    }
    if (stat && i === parts.length && !wantDirectory && !stat.isFile()) {
      throw new Error(`Target is not a regular file: ${current}`);
    }
    if (i < parts.length) current = join(current, parts[i]);
  }
}

async function inventory(root) {
  const files = new Map();
  async function walk(folder, prefix = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (skip(entry.name) || (!prefix && !roots.has(entry.name))) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Source/target symlink rejected: ${rel}`);
      if (entry.isDirectory()) await walk(path, rel);
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        const stat = await lstat(path);
        files.set(rel, { sha256: digest(bytes), bytes: bytes.length, mode: stat.mode & 0o777 });
      } else throw new Error(`Non-regular source/target rejected: ${rel}`);
    }
  }
  await walk(root);
  return files;
}

function parseArgs(argv) {
  let source;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source" && argv[i + 1] && !argv[i + 1].startsWith("--")) source = argv[++i];
    else if (argv[i] === "--apply") apply = true;
    else throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
  }
  if (!source) throw new Error("--source <development-workspace> is required; no default source is inferred.");
  return { source: resolve(source), apply };
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === "--help") {
    console.log("Usage: node scripts/sync-from-workspace.mjs --source <workspace> [--apply]\nDefault: read-only comparison. --apply copies allowed plugin files, backs up overwritten files, records hashes, and never deletes target-only files.");
    return;
  }
  const { source, apply } = parseArgs(process.argv.slice(2));
  if (await realpath(targetRoot) !== targetRoot || await realpath(source) !== source) {
    throw new Error("Use canonical, non-symlink workspace paths.");
  }
  const sourcePlugin = join(source, "plugins/lazyz");
  if (sourcePlugin === targetPlugin || source.startsWith(`${targetRoot}${sep}`) || targetRoot.startsWith(`${source}${sep}`)) {
    throw new Error("Source and publication checkout must be separate sibling workspaces.");
  }
  if (await realpath(sourcePlugin) !== sourcePlugin) throw new Error("Source plugin must not be a symlink.");
  await assertTarget(targetPlugin, true);
  await assertTarget(manifestPath);
  const sourcePackage = JSON.parse(await readFile(join(sourcePlugin, "package.json"), "utf8"));
  const plugin = JSON.parse(await readFile(join(sourcePlugin, ".zcode-plugin/plugin.json"), "utf8"));
  if (plugin.name !== "lazyz" || plugin.version !== sourcePackage.version) throw new Error("LazyZ package/manifest version mismatch.");
  const [incoming, existing] = await Promise.all([inventory(sourcePlugin), inventory(targetPlugin)]);
  const changed = [...incoming].filter(([path, info]) => {
    const old = existing.get(path);
    return !old || old.sha256 !== info.sha256 || old.mode !== info.mode;
  });
  for (const [path] of changed) await assertTarget(join(targetPlugin, path));
  const retained = [...existing.keys()].filter((path) => !incoming.has(path)).sort();
  const git = (...args) => execFileSync("git", ["-C", source, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
  const manifest = {
    schemaVersion: 1, capturedAt: new Date().toISOString(), pluginVersion: plugin.version,
    sourceCommit: git("rev-parse", "HEAD"), includesUncommittedChanges: git("status", "--porcelain").length > 0,
    targetBaseCommit: execFileSync("git", ["-C", targetRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    scope: "plugins/lazyz source and prebuilt artifacts; not a runtime-only release or a live-host certification",
    retainedTargetOnly: retained,
    files: Object.fromEntries([...incoming].sort(([a], [b]) => a.localeCompare(b))),
  };
  const summary = { mode: apply ? "apply" : "dry-run", version: plugin.version, files: incoming.size,
    changed: changed.length, added: changed.filter(([path]) => !existing.has(path)).length, retainedTargetOnly: retained };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }
  const backup = await mkdtemp(join(tmpdir(), "lazyz-publication-backup-"));
  for (const [path, info] of changed) {
    const from = join(sourcePlugin, path);
    const to = join(targetPlugin, path);
    if (existing.has(path)) {
      const saved = join(backup, "plugins/lazyz", path);
      await mkdir(dirname(saved), { recursive: true });
      await copyFile(to, saved);
    }
    if (digest(await readFile(from)) !== info.sha256) throw new Error(`Source changed during sync: ${path}; backup: ${backup}`);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    await chmod(to, info.mode);
  }
  if (await statOrNull(manifestPath)) await copyFile(manifestPath, join(backup, "source-snapshot.json"));
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  await writeFile(join(backup, "operation.json"), `${JSON.stringify({ ...summary, paths: changed.map(([path]) => path) }, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, backup }, null, 2));
}

main().catch((error) => { console.error(`Publication sync failed: ${error.message}`); process.exitCode = 1; });
