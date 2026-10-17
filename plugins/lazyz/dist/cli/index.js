#!/usr/bin/env node

// runtime/cli.mjs
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join as join7 } from "node:path";

// runtime/arguments.mjs
var CliUsageError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
  }
};
function parseFlags(args, allowed) {
  const flags = /* @__PURE__ */ new Map();
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    if (!allowed.has(value)) throw new CliUsageError(`unknown option: ${value}`);
    if (allowed.get(value) === "boolean") {
      flags.set(value, true);
      continue;
    }
    const optionValue = args[index + 1];
    if (optionValue === void 0 || optionValue.startsWith("--")) throw new CliUsageError(`${value} requires a value`);
    flags.set(value, optionValue);
    index += 1;
  }
  return { flags, positional };
}

// runtime/doctor.mjs
import { constants as constants3 } from "node:fs";
import { access as access3, lstat as lstat3, readFile as readFile3, readdir as readdir3 } from "node:fs/promises";
import { isAbsolute as isAbsolute2, join as join4, posix as posix2 } from "node:path";

// runtime/artifact-integrity.mjs
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";
var DIGEST_PATTERN = /^[a-f0-9]{64}$/;
var MODE_PATTERN = /^0[0-7]{3}$/;
var CLI_OUTPUT = "dist/cli/index.js";
var CLI_PROVENANCE = "dist/cli/provenance.json";
var BUILD_CONTRACT = { entryPoint: "runtime/cli.mjs", format: "esm", platform: "node", target: "node20" };
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
  return typeof path === "string" && path.length > 0 && !path.includes("\\") && !isAbsolute(path) && posix.normalize(path) === path && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
async function regularFileInvalid(pluginRoot, path) {
  const parts = path.split("/");
  let parent = pluginRoot;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    const info2 = await lstat(parent);
    if (info2.isSymbolicLink() || !info2.isDirectory()) return `${path}: unsafe parent`;
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
    "package.json"
  ];
  const present = [];
  for (const path of candidates) {
    try {
      await access(join(pluginRoot, path), constants.R_OK);
      present.push(path);
    } catch {
    }
  }
  return [...new Set(present)].sort();
}
async function checkCliDistFreshness(pluginRoot) {
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
      if (expected === void 0) invalid.push(`${path}: missing from provenance`);
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
  return invalid.length === 0 ? { id: "cli-dist-freshness", status: "pass", sourcePresent, sources: sourcePresent ? sourcePaths.length : void 0 } : { id: "cli-dist-freshness", status: "fail", sourcePresent, invalid };
}
async function checkPayloadManifest(pluginRoot, { artifactMode, requiredFiles }) {
  const state = await readJsonState(join(pluginRoot, "payload-manifest.json"));
  if (state.kind === "missing") {
    return artifactMode === "release" ? { id: "payload-manifest", status: "fail", present: false, message: "payload manifest is required in release mode" } : { id: "payload-manifest", status: "pass", present: false };
  }
  if (state.kind === "malformed") {
    return { id: "payload-manifest", status: "fail", present: true, message: "payload manifest is malformed JSON" };
  }
  const manifest = state.value;
  if (manifest === null || typeof manifest !== "object" || manifest.schemaVersion !== 1 || manifest.artifactMode !== "release" || typeof manifest.sourceCommit !== "string" || manifest.sourceCommit.length === 0 || !Array.isArray(manifest.files)) {
    return { id: "payload-manifest", status: "fail", present: true, invalid: ["manifest schema is invalid"] };
  }
  const invalid = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of manifest.files) {
    if (entry === null || typeof entry !== "object" || !safePayloadPath(entry.path) || !DIGEST_PATTERN.test(entry.sha256) || !MODE_PATTERN.test(entry.mode)) {
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
      if ((info.mode & 511).toString(8).padStart(4, "0") !== entry.mode) invalid.push(`${entry.path}: mode mismatch`);
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
  return invalid.length === 0 ? { id: "payload-manifest", status: "pass", present: true, files: seen.size } : { id: "payload-manifest", status: "fail", present: true, invalid };
}

// runtime/doctor-environment.mjs
import { constants as constants2 } from "node:fs";
import { access as access2, lstat as lstat2, readFile as readFile2, readdir as readdir2 } from "node:fs/promises";
import { join as join3 } from "node:path";

// runtime/paths.mjs
import { existsSync, realpathSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function resolvePluginRoot(env = process.env, moduleUrl = import.meta.url) {
  const override = env.LAZYZ_PLUGIN_ROOT?.trim();
  if (override) return resolve(override);
  let cursor = dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join2(cursor, ".zcode-plugin", "plugin.json"))) return cursor;
    cursor = dirname(cursor);
  }
  return dirname(dirname(fileURLToPath(moduleUrl)));
}
function samePath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

// runtime/doctor-environment.mjs
async function readJson(path) {
  try {
    return JSON.parse(await readFile2(path, "utf8"));
  } catch {
    return null;
  }
}
async function checkCodegraphVersion(pluginRoot) {
  const manifest = await readJson(join3(pluginRoot, "components", "codegraph", "package.json"));
  if (manifest === null) return { id: "codegraph-version", status: "warn", message: "package manifest unavailable" };
  const version = manifest.optionalDependencies?.["@colbymchenry/codegraph"];
  return version === "1.5.0" ? { id: "codegraph-version", status: "pass", version } : { id: "codegraph-version", status: "fail", version: version ?? null, message: "CodeGraph must be pinned to 1.5.0" };
}
async function checkLspSecurityFiles(pluginRoot) {
  const paths = [
    "vendor/lsp-daemon/dist/ipc-protocol.js",
    "vendor/lsp-daemon/dist/ownership.js",
    "vendor/lsp-daemon/dist/request-routing.js"
  ];
  const missing = [];
  for (const path of paths) {
    try {
      await access2(join3(pluginRoot, path), constants2.R_OK);
    } catch {
      missing.push(path);
    }
  }
  return missing.length === 0 ? { id: "lsp-auth-protocol", status: "pass", paths } : { id: "lsp-auth-protocol", status: "warn", missing, message: "missing required lsp-auth-protocol" };
}
async function checkLspDaemonState(home, currentVersion) {
  let entries;
  try {
    entries = await readdir2(join3(home, ".omo", "lsp-daemon"), { withFileTypes: true });
  } catch {
    return { id: "lsp-daemon-state", status: "pass", observed: false };
  }
  const expected = currentVersion === null ? null : `v${currentVersion}`;
  const staleVersions = entries.filter((entry) => entry.isDirectory() && /^v[A-Za-z0-9]/.test(entry.name) && entry.name !== expected).map((entry) => entry.name.slice(1)).sort();
  return staleVersions.length === 0 ? { id: "lsp-daemon-state", status: "pass", observed: true } : { id: "lsp-daemon-state", status: "warn", observed: true, staleVersions };
}
async function checkLazyzLink(home, pluginRoot) {
  const path = join3(home, ".local", "bin", "lazyz");
  try {
    const info = await lstat2(path);
    if (!info.isSymbolicLink()) return { id: "lazyz-symlink", status: "warn", path, message: "path is user-owned" };
    try {
      await access2(path, constants2.R_OK);
    } catch {
      return { id: "lazyz-symlink", status: "fail", path, message: "link is dangling" };
    }
    return samePath(path, join3(pluginRoot, "dist", "cli", "index.js")) ? { id: "lazyz-symlink", status: "pass", path } : { id: "lazyz-symlink", status: "warn", path, message: "link points outside this LazyZ payload" };
  } catch {
    return { id: "lazyz-symlink", status: "warn", path, message: "link is not installed" };
  }
}
async function checkLegacyOmo(home) {
  const path = join3(home, ".local", "bin", "omo");
  let info;
  try {
    info = await lstat2(path);
  } catch {
    return { id: "legacy-omo", status: "pass", present: false, owned: false };
  }
  const marker = await readJson(`${path}.lazyz-owned.json`);
  const wrapperOwned = info.isFile() && (await readFile2(path, "utf8")).includes("OMO_GENERATED_RUNTIME_WRAPPER");
  const owned = wrapperOwned || marker?.owner === "lazyz" && marker?.path === path;
  return owned ? { id: "legacy-omo", status: "warn", present: true, owned: true, path, message: "marker-owned legacy shim may be migrated" } : { id: "legacy-omo", status: "warn", present: true, owned: false, path, message: "user-owned legacy omo is preserved" };
}
async function checkExperimentalMemory(env, pluginRoot) {
  if (env.LAZYZ_EXPERIMENTAL_MEMORY !== "1") return { id: "experimental-memory", status: "pass", enabled: false, experimental: false };
  const policy = await readJson(join3(pluginRoot, "policies", "experimental-memory.json"));
  return {
    id: "experimental-memory",
    status: "warn",
    enabled: false,
    experimental: true,
    message: policy === null ? "unsupported: policy manifest is required; no memory runtime was loaded" : "policy manifest detected, but memory runtime remains deliberately unavailable pending security review"
  };
}
async function environmentChecks({ env, home, pluginRoot, version }) {
  return [
    await checkCodegraphVersion(pluginRoot),
    await checkLspSecurityFiles(pluginRoot),
    await checkLspDaemonState(home, version),
    await checkLazyzLink(home, pluginRoot),
    await checkLegacyOmo(home),
    await checkExperimentalMemory(env, pluginRoot)
  ];
}
async function codexMutationPlan(pluginRoot) {
  const hooks = await readFile2(join3(pluginRoot, "hooks", "hooks.json"), "utf8").catch(() => "");
  return /migrate-codex-config/.test(hooks) ? ["remove automatic Codex config migration hook"] : [];
}

// runtime/zcode-contract.mjs
var ZCODE_HOST_CONTRACT = Object.freeze({
  schemaVersion: 1,
  reviewedAt: "2026-10-07",
  source: "https://zcode.z.ai/en/docs/hooks",
  hostVerified: false,
  sourceVersion: "3.14.3",
  sourceCommit: "29628c9acdb81b703bbd4080c207a0e7ce5e276e",
  agentDiscovery: "enabled-plugin-agents",
  defaultAgentModel: "inherit",
  governedAgentExecution: "foreground",
  events: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "PostToolUseFailure", "Stop"],
  executor: "process",
  minimumNodeMajor: 20,
  stopConsecutiveBlockLimit: 3,
  defaultMaxOutputBytes: 32768,
  pluginDataEnvironment: "ZCODE_PLUGIN_DATA",
  transcriptLifetime: "hook-invocation",
  optionalMetadata: ["model", "turn_id"],
  unsupportedEvents: ["PostCompact", "SubagentStop"]
});
function inspectZcodeHooks(manifest) {
  const invalid = [];
  const paths = [];
  let processCount = 0;
  let commandCount = 0;
  if (!manifest || typeof manifest.hooks !== "object" || manifest.hooks === null || Array.isArray(manifest.hooks)) {
    return { id: "zcode-hooks", status: "fail", invalid: ["hooks must be an event map"], paths };
  }
  for (const [event, groups] of Object.entries(manifest.hooks)) {
    if (!ZCODE_HOST_CONTRACT.events.includes(event)) invalid.push(`${event}: unsupported ZCode event`);
    if (!Array.isArray(groups)) {
      invalid.push(`${event}: groups must be an array`);
      continue;
    }
    for (const [groupIndex, group] of groups.entries()) {
      const label = `${event}[${groupIndex}]`;
      if (!Array.isArray(group?.hooks)) {
        invalid.push(`${label}: hooks must be an array`);
        continue;
      }
      if (group.matcher !== void 0 && typeof group.matcher !== "string") invalid.push(`${label}: invalid matcher`);
      for (const hook of group.hooks) {
        if (!hook || typeof hook.command !== "string" || !hook.command.trim()) {
          invalid.push(`${label}: command is required`);
          continue;
        }
        if (hook.type === "process") {
          processCount += 1;
          if (!Array.isArray(hook.args) || hook.args.some((arg) => typeof arg !== "string")) {
            invalid.push(`${label}: process args must be a string array`);
            continue;
          }
          if (hook.async === true) invalid.push(`${label}: process hooks cannot run asynchronously`);
          for (const arg of [hook.command, ...hook.args]) {
            if (arg.startsWith("${ZCODE_PLUGIN_ROOT}/")) paths.push(arg.slice("${ZCODE_PLUGIN_ROOT}/".length));
          }
        } else if (hook.type === "command") {
          commandCount += 1;
          for (const match of hook.command.matchAll(/\$\{ZCODE_PLUGIN_ROOT\}\/([^\s"']+)/g)) paths.push(match[1]);
          if (hook.async === true && ["PreToolUse", "PermissionRequest", "Stop"].includes(event)) {
            invalid.push(`${label}: asynchronous output cannot enforce a decision`);
          }
        } else invalid.push(`${label}: unsupported hook type`);
        const timeout = hook.timeoutMs ?? (hook.timeout === void 0 ? void 0 : hook.timeout * 1e3);
        if (timeout !== void 0 && (!Number.isFinite(timeout) || timeout <= 0)) invalid.push(`${label}: invalid timeout`);
      }
    }
  }
  return { id: "zcode-hooks", status: invalid.length === 0 ? "pass" : "fail", invalid, paths: [...new Set(paths)].sort(), processCount, commandCount };
}

// runtime/doctor.mjs
var ENTRYPOINTS = [
  "dist/cli/index.js",
  "components/bootstrap/dist/cli.js",
  "components/codegraph/dist/cli.js",
  "components/ulw-loop/dist/cli.js"
];
var MANIFESTS = ["package.json", ".zcode-plugin/plugin.json", "hooks/hooks.json", ".mcp.json"];
async function readJson2(path) {
  try {
    return JSON.parse(await readFile3(path, "utf8"));
  } catch {
    return null;
  }
}
async function checkFiles(pluginRoot, paths, id) {
  const missing = [];
  for (const path of paths) {
    try {
      await access3(join4(pluginRoot, path), constants3.R_OK);
    } catch {
      missing.push(path);
    }
  }
  return missing.length === 0 ? { id, status: "pass", paths } : { id, status: "fail", missing, message: `missing required ${id}` };
}
function mcpEntrypoints(manifest) {
  const paths = [];
  for (const server of Object.values(manifest?.mcpServers ?? {})) {
    if (server === null || typeof server !== "object" || typeof server.url === "string") continue;
    const cwd = typeof server.cwd === "string" ? server.cwd : ".";
    const candidates = [server.command, ...Array.isArray(server.args) ? server.args : []];
    for (const candidate of candidates) {
      if (typeof candidate !== "string" || isAbsolute2(candidate) || !/\.(?:[cm]?js|sh)$/.test(candidate)) continue;
      paths.push(posix2.normalize(posix2.join(cwd.replaceAll("\\", "/"), candidate.replaceAll("\\", "/"))));
    }
  }
  return paths;
}
async function configuredEntrypoints(pluginRoot) {
  const hooks = await readJson2(join4(pluginRoot, "hooks", "hooks.json"));
  const mcp = await readJson2(join4(pluginRoot, ".mcp.json"));
  const invalid = [];
  const hookContract = inspectZcodeHooks(hooks);
  if (hooks === null) invalid.push("hooks/hooks.json: invalid JSON");
  if (mcp === null) invalid.push(".mcp.json: invalid JSON");
  return {
    paths: [.../* @__PURE__ */ new Set([...ENTRYPOINTS, ...hookContract.paths, ...mcpEntrypoints(mcp)])].sort(),
    hookContract,
    invalid
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
      const absolute = join4(pluginRoot, path);
      const info = await lstat3(absolute);
      if (info.isSymbolicLink()) {
        try {
          await access3(absolute, constants3.R_OK);
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
  return invalid.length === 0 ? { id: "entrypoints", status: "pass", paths: configured.paths } : { id: "entrypoints", status: "fail", paths: configured.paths, invalid, message: "invalid local command entrypoints" };
}
async function checkVersions(pluginRoot) {
  const packageManifest = await readJson2(join4(pluginRoot, "package.json"));
  const pluginManifest = await readJson2(join4(pluginRoot, ".zcode-plugin", "plugin.json"));
  const packageVersion = packageManifest?.version;
  const pluginVersion = pluginManifest?.version;
  if (typeof packageVersion !== "string" || typeof pluginVersion !== "string") {
    return { check: { id: "versions", status: "fail", message: "version is missing from a manifest" }, version: null };
  }
  if (packageVersion !== pluginVersion) {
    return {
      check: { id: "versions", status: "fail", packageVersion, pluginVersion, message: "manifest versions differ" },
      version: packageVersion
    };
  }
  const mismatchedComponents = [];
  let componentEntries = [];
  try {
    componentEntries = await readdir3(join4(pluginRoot, "components"), { withFileTypes: true });
  } catch {
    componentEntries = [];
  }
  for (const entry of componentEntries.filter((candidate) => candidate.isDirectory())) {
    const manifest = await readJson2(join4(pluginRoot, "components", entry.name, "package.json"));
    if (manifest !== null && typeof manifest.version === "string" && manifest.version !== packageVersion) {
      mismatchedComponents.push(`${entry.name}:${manifest.version}`);
    }
  }
  if (mismatchedComponents.length > 0) {
    return {
      check: { id: "versions", status: "fail", version: packageVersion, mismatchedComponents },
      version: packageVersion
    };
  }
  return { check: { id: "versions", status: "pass", version: packageVersion }, version: packageVersion };
}
async function checkPermissions(pluginRoot, entrypoints) {
  const unsafe = [];
  for (const path of entrypoints) {
    try {
      const info = await lstat3(join4(pluginRoot, path));
      const directlyExecutable = path === "dist/cli/index.js" || path.endsWith(".sh");
      if ((info.mode & 18) !== 0 || directlyExecutable && (info.mode & 73) === 0) unsafe.push(path);
    } catch {
    }
  }
  return unsafe.length === 0 ? { id: "permissions", status: "pass" } : { id: "permissions", status: "fail", paths: unsafe, message: "entrypoints must not be group/world writable; direct launchers must be executable" };
}
function safeManifestPath(path) {
  return typeof path === "string" && path.length > 0 && !path.includes("\0") && !isAbsolute2(path) && !/^[A-Za-z]:/.test(path) && !path.startsWith("\\") && !path.replaceAll("\\", "/").split("/").includes("..");
}
async function runDoctor({ env = process.env, home, pluginRoot }) {
  const versions = await checkVersions(pluginRoot);
  const entrypoints = await configuredEntrypoints(pluginRoot);
  const requestedMode = env.LAZYZ_ARTIFACT_MODE;
  const artifactMode = requestedMode === "development" || requestedMode === "release" ? requestedMode : await access3(join4(pluginRoot, "runtime", "cli.mjs"), constants3.R_OK).then(() => "development").catch(() => "release");
  const requiredPayloadFiles = [.../* @__PURE__ */ new Set([...MANIFESTS, ...entrypoints.paths, "dist/cli/provenance.json"])].sort();
  const hostChecks = await environmentChecks({ env, home, pluginRoot, version: versions.version });
  const checks = [
    entrypoints.hookContract,
    await checkEntrypoints(pluginRoot, entrypoints),
    await checkFiles(pluginRoot, MANIFESTS, "manifests"),
    versions.check,
    await checkPermissions(pluginRoot, entrypoints.paths),
    await checkCliDistFreshness(pluginRoot),
    await checkPayloadManifest(pluginRoot, { artifactMode, requiredFiles: requiredPayloadFiles }),
    ...hostChecks
  ];
  const codex = await codexMutationPlan(pluginRoot);
  return {
    product: "LazyZ",
    version: versions.version,
    artifactMode,
    hostContract: ZCODE_HOST_CONTRACT,
    ok: checks.every((check) => check.status !== "fail"),
    checks,
    mutationPlan: { codex }
  };
}

// runtime/setup.mjs
import { createHash as createHash2 } from "node:crypto";
import { constants as constants4 } from "node:fs";
import { copyFile, lstat as lstat5, mkdir, readFile as readFile4, readlink, readdir as readdir4, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname as dirname2, join as join6 } from "node:path";

// runtime/setup-paths.mjs
import { lstat as lstat4, realpath } from "node:fs/promises";
import { isAbsolute as isAbsolute3, join as join5, relative, resolve as resolve2, sep } from "node:path";
var UnsafeSetupPathError = class extends Error {
  constructor(path) {
    super(`Refusing unsafe setup directory: ${path}`);
    this.name = "UnsafeSetupPathError";
  }
};
async function assertSetupDirectory(home, directory) {
  const relativePath = relative(resolve2(home), resolve2(directory));
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute3(relativePath)) {
    throw new UnsafeSetupPathError(directory);
  }
  let current = await realpath(home);
  for (const part of relativePath.split(sep).filter(Boolean)) {
    current = join5(current, part);
    try {
      const info = await lstat4(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new UnsafeSetupPathError(current);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  }
}

// runtime/setup.mjs
var OWNERSHIP_MARKER = ".lazyz-owned.json";
async function exists(path) {
  try {
    await lstat5(path);
    return true;
  } catch {
    return false;
  }
}
async function atomicCopy(source, target) {
  await mkdir(dirname2(target), { recursive: true, mode: 448 });
  const temporary = join6(dirname2(target), `.${basename(target)}.lazyz-${process.pid}.tmp`);
  await copyFile(source, temporary, constants4.COPYFILE_EXCL);
  await rename(temporary, target);
}
async function atomicSymlink(source, target) {
  await mkdir(dirname2(target), { recursive: true, mode: 448 });
  const temporary = join6(dirname2(target), `.${basename(target)}.lazyz-${process.pid}.tmp`);
  await symlink(source, temporary);
  await rename(temporary, target);
}
async function sourceAgents(pluginRoot, target) {
  if (target === "zcode") {
    const names = (await readdir4(join6(pluginRoot, "agents"))).filter((name) => name.endsWith(".md")).sort();
    return names.map((name) => ({ name, source: join6(pluginRoot, "agents", name) }));
  }
  const components = await readdir4(join6(pluginRoot, "components"), { withFileTypes: true });
  const agents = [];
  for (const component of components.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = join6(pluginRoot, "components", component.name, "agents");
    if (!await exists(directory)) continue;
    for (const name of (await readdir4(directory)).filter((value) => value.endsWith(".toml")).sort()) {
      agents.push({ name, source: join6(directory, name) });
    }
  }
  return agents;
}
function setupPaths(home, target) {
  return target === "zcode" ? { agents: join6(home, ".zcode", "agents"), bin: join6(home, ".local", "bin") } : { agents: join6(home, ".codex", "agents"), bin: join6(home, ".local", "bin") };
}
async function legacyOmoRetirement(home) {
  const target = join6(home, ".local", "bin", "omo");
  const marker = `${target}.lazyz-owned.json`;
  try {
    const parsed = JSON.parse(await readFile4(marker, "utf8"));
    return parsed?.owner === "lazyz" && parsed?.path === target && await exists(target) ? { kind: "retire-legacy-omo", marker, target } : null;
  } catch {
    return null;
  }
}
async function buildSetupPlan({ dryRun, home, pluginRoot, target }) {
  const paths = setupPaths(home, target);
  const agents = await sourceAgents(pluginRoot, target);
  const legacyRetirement = await legacyOmoRetirement(home);
  return {
    target,
    dryRun,
    home,
    operations: [
      ...agents.map((agent) => ({ kind: "install-agent", source: agent.source, target: join6(paths.agents, agent.name) })),
      { kind: "install-cli-link", source: join6(pluginRoot, "dist", "cli", "index.js"), target: join6(paths.bin, "lazyz") },
      ...legacyRetirement === null ? [] : [legacyRetirement]
    ],
    codexConfigWrites: []
  };
}
async function applySetupPlan(plan) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-");
  const firstAgent = plan.operations.find((operation) => operation.kind === "install-agent");
  const agentDirectory = firstAgent === void 0 ? void 0 : dirname2(firstAgent.target);
  const backupDir = join6(agentDirectory ?? join6(plan.home, ".local", "bin"), ".lazyz-backups", stamp);
  for (const operation of plan.operations) await assertSetupDirectory(plan.home, dirname2(operation.target));
  await assertSetupDirectory(plan.home, backupDir);
  const installed = [];
  for (const operation of plan.operations) {
    await assertSetupDirectory(plan.home, dirname2(operation.target));
    if (await exists(operation.target)) {
      await mkdir(backupDir, { recursive: true, mode: 448 });
      const info = await lstat5(operation.target);
      if (info.isSymbolicLink()) {
        await writeFile(join6(backupDir, `${basename(operation.target)}.symlink`), await readlink(operation.target));
      } else {
        await copyFile(operation.target, join6(backupDir, basename(operation.target)));
      }
    }
    if (operation.kind === "retire-legacy-omo") {
      await copyFile(operation.marker, join6(backupDir, basename(operation.marker)));
      await rm(operation.target, { force: true });
      await rm(operation.marker, { force: true });
      continue;
    }
    if (operation.kind === "install-cli-link") {
      await atomicSymlink(operation.source, operation.target);
      const linkMarker = `${operation.target}.lazyz-owned.json`;
      const markerTemporary = `${linkMarker}.${process.pid}.tmp`;
      await writeFile(
        markerTemporary,
        `${JSON.stringify({ marker: "LAZYZ_GENERATED_CLI_LINK", owner: "lazyz", path: operation.target })}
`,
        { mode: 384, flag: "wx" }
      );
      await rename(markerTemporary, linkMarker);
    } else await atomicCopy(operation.source, operation.target);
    const content = operation.kind === "install-agent" ? await readFile4(operation.source) : Buffer.from(operation.source);
    installed.push({ path: operation.target, sha256: createHash2("sha256").update(content).digest("hex") });
  }
  if (agentDirectory) {
    const markerPath = join6(agentDirectory, OWNERSHIP_MARKER);
    const temporary = `${markerPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ owner: "lazyz", target: plan.target, installed }, null, 2)}
`, { mode: 384, flag: "wx" });
    await rename(temporary, markerPath);
  }
  return { ...plan, applied: true, backupDir: await exists(backupDir) ? backupDir : null };
}

// runtime/cli.mjs
var HELP = `LazyZ command line

Usage:
  lazyz doctor [--json]
  lazyz capabilities [--json]
  lazyz setup [--target zcode|codex] [--dry-run] [--yes] [--json]
  lazyz ulw-loop <subcommand> [args]
  lazyz codegraph sweep --dry-run [--json]
  lazyz help | --help | -h
`;
function writeResult(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
    return;
  }
  process.stdout.write(`${value.product ?? "LazyZ"}: ${value.ok === false ? "issues found" : "ok"}
`);
  for (const check of value.checks ?? []) process.stdout.write(`  ${check.status.toUpperCase()} ${check.id}${check.message ? `: ${check.message}` : ""}
`);
}
async function doctorCommand(args, context) {
  const parsed = parseFlags(args, /* @__PURE__ */ new Map([["--json", "boolean"]]));
  if (parsed.positional.length > 0) throw new CliUsageError("doctor does not accept positional arguments");
  const report = await runDoctor(context);
  writeResult(report, parsed.flags.has("--json"));
  return report.ok ? 0 : 1;
}
async function setupCommand(args, context) {
  const parsed = parseFlags(
    args,
    /* @__PURE__ */ new Map([
      ["--dry-run", "boolean"],
      ["--yes", "boolean"],
      ["--json", "boolean"],
      ["--target", "value"]
    ])
  );
  if (parsed.positional.length > 0) throw new CliUsageError("setup does not accept positional arguments");
  const target = parsed.flags.get("--target") ?? "zcode";
  if (target !== "zcode" && target !== "codex") throw new CliUsageError("--target must be zcode or codex");
  const dryRun = parsed.flags.has("--dry-run");
  if (!dryRun && !parsed.flags.has("--yes")) {
    throw new CliUsageError("setup requires explicit consent: pass --yes, or inspect changes with --dry-run");
  }
  const plan = await buildSetupPlan({ ...context, dryRun, target });
  const report = dryRun ? plan : await applySetupPlan(plan);
  if (parsed.flags.has("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}
`);
  else process.stdout.write(`[LazyZ] ${dryRun ? "planned" : "completed"} ${target} setup (${plan.operations.length} operations)
`);
  return 0;
}
function ulwLoopCommand(args, pluginRoot) {
  const entrypoint = join7(pluginRoot, "components", "ulw-loop", "dist", "cli.js");
  const result = spawnSync(process.execPath, [entrypoint, "ulw-loop", ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
function codegraphCommand(args, pluginRoot) {
  if (args[0] !== "sweep") throw new CliUsageError("codegraph requires the sweep subcommand");
  const parsed = parseFlags(
    args.slice(1),
    /* @__PURE__ */ new Map([
      ["--dry-run", "boolean"],
      ["--json", "boolean"]
    ])
  );
  if (parsed.positional.length > 0 || !parsed.flags.has("--dry-run")) {
    throw new CliUsageError("the LazyZ root surface only permits codegraph sweep --dry-run");
  }
  const entrypoint = join7(pluginRoot, "components", "codegraph", "dist", "cli.js");
  const result = spawnSync(process.execPath, [entrypoint, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
async function runCli(args = process.argv.slice(2), env = process.env) {
  const command = args[0];
  if (command === void 0 || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  const context = { env, home: env.HOME?.trim() || homedir(), pluginRoot: resolvePluginRoot(env) };
  if (command === "doctor") return doctorCommand(args.slice(1), context);
  if (command === "capabilities") {
    const parsed = parseFlags(args.slice(1), /* @__PURE__ */ new Map([["--json", "boolean"]]));
    if (parsed.positional.length > 0) throw new CliUsageError("capabilities does not accept positional arguments");
    process.stdout.write(parsed.flags.has("--json") ? `${JSON.stringify(ZCODE_HOST_CONTRACT, null, 2)}
` : `LazyZ: ZCode ${ZCODE_HOST_CONTRACT.sourceVersion} source contract (${ZCODE_HOST_CONTRACT.reviewedAt})
Direct process hooks; inherited agent model; governed agents run in foreground.
Stop continuation limit: ${ZCODE_HOST_CONTRACT.stopConsecutiveBlockLimit}. Installed host is not probed.
`);
    return 0;
  }
  if (command === "setup") return setupCommand(args.slice(1), context);
  if (command === "ulw-loop") return ulwLoopCommand(args.slice(1), context.pluginRoot);
  if (command === "codegraph") return codegraphCommand(args.slice(1), context.pluginRoot);
  throw new CliUsageError(`unknown command: ${command}`);
}
runCli().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  if (error instanceof CliUsageError) {
    process.stderr.write(`[LazyZ] ${error.message}
${HELP}`);
    process.exitCode = 2;
    return;
  }
  process.stderr.write(`[LazyZ] ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
export {
  runCli
};
