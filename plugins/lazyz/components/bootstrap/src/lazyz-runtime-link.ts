import { chmod, copyFile, lstat, mkdir, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { windowsNodeDiscoveryLines } from "../../../vendor/omo-codex/src/install/codex-cache-command-shim.ts";
import { RUNTIME_WRAPPER_MARKER } from "../../../vendor/omo-codex/src/install/codex-cache-runtime-wrapper.ts";

export const LAZYZ_CLI_MARKER = "LAZYZ_GENERATED_CLI_LINK";

interface LazyzRuntimeLinkOptions {
	readonly binDir: string;
	readonly cliPath: string;
	readonly platform: NodeJS.Platform;
}

export async function linkLazyzRuntimeBin(options: LazyzRuntimeLinkOptions): Promise<string> {
	await mkdir(options.binDir, { recursive: true, mode: 0o700 });
	const linkPath = join(options.binDir, options.platform === "win32" ? "lazyz.cmd" : "lazyz");
	const markerPath = `${linkPath}.lazyz-owned.json`;
	await assertReplaceableLazyzLink(linkPath, markerPath);
	const temporary = `${linkPath}.${process.pid}.tmp`;
	await rm(temporary, { force: true });
	if (options.platform === "win32") await writeFile(temporary, windowsLazyzWrapper(options.cliPath));
	else await symlink(options.cliPath, temporary);
	await rename(temporary, linkPath);
	if (options.platform !== "win32") await chmod(linkPath, 0o755);
	const markerTemporary = `${markerPath}.${process.pid}.tmp`;
	await writeFile(markerTemporary, `${JSON.stringify({ marker: LAZYZ_CLI_MARKER, owner: "lazyz", path: linkPath })}\n`, {
		mode: 0o600,
	});
	await rename(markerTemporary, markerPath);
	return linkPath;
}

async function assertReplaceableLazyzLink(linkPath: string, markerPath: string): Promise<void> {
	try {
		await lstat(linkPath);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	const marker = await readOwnershipMarker(markerPath);
	if (marker?.["marker"] !== LAZYZ_CLI_MARKER || marker["owner"] !== "lazyz" || marker["path"] !== linkPath) {
		throw new Error(`${linkPath} exists without a matching LazyZ ownership marker`);
	}
}

export async function retireManagedLegacyOmo(binDir: string, platform: NodeJS.Platform): Promise<void> {
	const legacyPath = join(binDir, platform === "win32" ? "omo.cmd" : "omo");
	let info;
	try {
		info = await lstat(legacyPath);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	const markerPath = `${legacyPath}.lazyz-owned.json`;
	const marker = await readOwnershipMarker(markerPath);
	const sidecarOwned = marker?.["owner"] === "lazyz" && marker["path"] === legacyPath;
	const wrapperOwned = info.isFile() && (await readFile(legacyPath, "utf8")).includes(RUNTIME_WRAPPER_MARKER);
	if (!sidecarOwned && !wrapperOwned) return;
	const backupPath = `${legacyPath}.lazyz-backup-${Date.now()}`;
	if (info.isSymbolicLink()) await symlink(await readlink(legacyPath), backupPath);
	else await copyFile(legacyPath, backupPath);
	await rm(legacyPath, { force: true });
	if (sidecarOwned) await rm(markerPath, { force: true });
}

async function readOwnershipMarker(path: string): Promise<Record<string, unknown> | null> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (isRecord(parsed)) return parsed;
		return null;
	} catch (error) {
		if (error instanceof Error) return null;
		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function windowsLazyzWrapper(cliPath: string): string {
	return [
		"@echo off",
		`rem ${LAZYZ_CLI_MARKER}`,
		...windowsNodeDiscoveryLines(),
		"if not defined OMO_NODE_BINARY (",
		"  echo lazyz: Node.js 20+ is required to run the LazyZ CLI 1>&2",
		"  exit /b 127",
		")",
		`\"%OMO_NODE_BINARY%\" \"${cliPath}\" %*`,
		"exit /b %ERRORLEVEL%",
		"",
	].join("\r\n");
}
