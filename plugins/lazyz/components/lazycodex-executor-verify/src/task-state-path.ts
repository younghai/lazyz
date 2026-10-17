import { createHash } from "node:crypto";
import { realpathSync as nodeRealpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { HookFileSystem } from "./types.js";

export function getTaskStatePath(cwd: string, sessionId: string, taskId: string): string {
	return join(sessionStateDir(cwd, sessionId), `${digest(taskId)}.json`);
}

export function sessionStateDir(cwd: string, sessionId: string): string {
	return join(cwd, ".omo", "lazycodex-executor-verify", "tasks", digest(sessionId));
}

export function ensureSafeStateDirectory(cwd: string, directory: string, fs: HookFileSystem): boolean {
	try {
		for (const ancestor of ancestorsBetween(cwd, directory)) {
			if (fs.existsSync(ancestor) && fs.lstatSync?.(ancestor).isSymbolicLink?.() === true) return false;
		}
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		return isSafeExistingStateDirectory(cwd, directory, fs);
	} catch (error) {
		if (error instanceof Error) return false;
		throw error;
	}
}

export function isSafeExistingStateDirectory(cwd: string, directory: string, fs: HookFileSystem): boolean {
	const realCwd = fs.realpathSync?.(cwd) ?? nodeRealpathSync(cwd);
	const realDirectory = fs.realpathSync?.(directory) ?? nodeRealpathSync(directory);
	return isInside(realDirectory, realCwd) && fs.lstatSync?.(directory).isSymbolicLink?.() !== true;
}

export function isInside(path: string, directory: string): boolean {
	const rel = relative(directory, path);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function digestStateKey(value: string): string {
	return digest(value);
}

function ancestorsBetween(cwd: string, directory: string): readonly string[] {
	const root = resolve(cwd);
	const result: string[] = [];
	let current = resolve(directory);
	while (current !== root && isInside(current, root)) {
		result.push(current);
		current = dirname(current);
	}
	return result.reverse();
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}
