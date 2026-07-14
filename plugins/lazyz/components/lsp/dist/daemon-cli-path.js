import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const requireFromHere = createRequire(import.meta.url);
const PACKAGE_LSP_DAEMON_CLI = "@code-yeongyu/lsp-daemon/dist/cli.js";
const CODEX_LSP_DAEMON_CLI_ENV = "CODEX_LSP_DAEMON_CLI";
const CODEX_LSP_DAEMON_VERSION_ENV = "CODEX_LSP_DAEMON_VERSION";
export function ensureLspDaemonCliEnv(env = process.env) {
    const configuredCli = env[CODEX_LSP_DAEMON_CLI_ENV]?.trim();
    const resolution = configuredCli ? resolveConfiguredLspDaemonCli(configuredCli) : resolveLspDaemonCli();
    if (!configuredCli)
        env[CODEX_LSP_DAEMON_CLI_ENV] = resolution.cliPath;
    if (!env[CODEX_LSP_DAEMON_VERSION_ENV]?.trim() && resolution.version !== null) {
        env[CODEX_LSP_DAEMON_VERSION_ENV] = resolution.version;
    }
}
export function resolveLspDaemonCliPath() {
    return resolveLspDaemonCli().cliPath;
}
function resolveLspDaemonCli() {
    const packageCli = resolvePackageLspDaemonCliPath();
    if (packageCli !== null)
        return resolveConfiguredLspDaemonCli(packageCli);
    const bundledCli = fileURLToPath(new URL("../../vendor/lsp-daemon/dist/cli.js", import.meta.url));
    if (existsSync(bundledCli))
        return resolveConfiguredLspDaemonCli(bundledCli);
    return resolveConfiguredLspDaemonCli(bundledCli);
}
function resolvePackageLspDaemonCliPath() {
    try {
        return requireFromHere.resolve(PACKAGE_LSP_DAEMON_CLI);
    }
    catch {
        return null;
    }
}
function resolveConfiguredLspDaemonCli(cliPath) {
    return {
        cliPath,
        version: readDaemonPackageVersion(cliPath),
    };
}
function readDaemonPackageVersion(cliPath) {
    try {
        const parsed = JSON.parse(readFileSync(join(dirname(cliPath), "package.json"), "utf8"));
        if (isRecord(parsed) && typeof parsed["version"] === "string" && parsed["version"].length > 0) {
            return parsed["version"];
        }
    }
    catch { }
    return null;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
