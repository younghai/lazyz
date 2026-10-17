import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, rm, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { type UlwLoopScope, ulwLoopDir, ulwLoopRelativeDir } from "./paths.js";
import { assertSafeUlwLoopPath, ensureUlwLoopStateDir, readSafeTextFile } from "./state-path.js";
import { UlwLoopError } from "./types.js";

const LOCK_WAIT_MS = 10_000;
const LOCK_RETRY_MS = 20;
const OWNER_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const heldLocks = new AsyncLocalStorage<ReadonlySet<string>>();

type LockOwner = {
	readonly version: 1;
	readonly pid: number;
	readonly token: string;
	readonly acquiredAt: string;
};

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function mutationLockKey(repoRoot: string, scope?: UlwLoopScope): string {
	return `${resolve(repoRoot)}\0${ulwLoopRelativeDir(scope)}`;
}

export function isCrossProcessMutationLockHeld(repoRoot: string, scope?: UlwLoopScope): boolean {
	return heldLocks.getStore()?.has(mutationLockKey(repoRoot, scope)) ?? false;
}

function parseLockOwner(raw: string): LockOwner | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		if (error instanceof SyntaxError) return null;
		throw error;
	}
	if (typeof value !== "object" || value === null) return null;
	const version = Reflect.get(value, "version");
	const pid = Reflect.get(value, "pid");
	const token = Reflect.get(value, "token");
	const acquiredAt = Reflect.get(value, "acquiredAt");
	if (
		version !== 1 ||
		typeof pid !== "number" ||
		!Number.isSafeInteger(pid) ||
		pid <= 0 ||
		typeof token !== "string" ||
		!OWNER_TOKEN_PATTERN.test(token) ||
		typeof acquiredAt !== "string"
	)
		return null;
	return { version, pid, token, acquiredAt };
}

function ownerIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (hasCode(error, "ESRCH")) return false;
		return true;
	}
}

function waitForRetry(): Promise<void> {
	return new Promise((resolveWait) => setTimeout(resolveWait, LOCK_RETRY_MS));
}

function lockWaitMs(): number {
	const configured = Number.parseInt(process.env["OMO_ULW_LOOP_LOCK_WAIT_MS"] ?? "", 10);
	return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 60_000) : LOCK_WAIT_MS;
}

async function readOwner(lockPath: string): Promise<LockOwner | null | undefined> {
	try {
		return parseLockOwner(await readSafeTextFile(lockPath));
	} catch (error) {
		if (hasCode(error, "ENOENT")) return undefined;
		throw error;
	}
}

async function tryCreateOwnedFile(path: string, owner: LockOwner): Promise<boolean> {
	try {
		const handle = await open(
			path,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
		try {
			try {
				await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
			} finally {
				await handle.close();
			}
		} catch (error) {
			await rm(path, { force: true });
			throw error;
		}
		return true;
	} catch (error) {
		if (hasCode(error, "EEXIST")) return false;
		throw error;
	}
}

async function tryAcquireMutationLock(lockPath: string, owner: LockOwner): Promise<boolean> {
	const current = await readOwner(lockPath);
	if (current === undefined) return tryCreateOwnedFile(lockPath, owner);
	if (current === null || ownerIsAlive(current.pid)) return false;
	const stalePath = `${lockPath}.${current.token}.stale`;
	await rename(lockPath, stalePath);
	await rm(stalePath, { force: true });
	return tryCreateOwnedFile(lockPath, owner);
}

async function releaseOwnedFile(path: string, owner: LockOwner): Promise<void> {
	const current = await readOwner(path);
	if (current?.token !== owner.token) return;
	try {
		await unlink(path);
	} catch (error) {
		if (!hasCode(error, "ENOENT")) throw error;
	}
}

async function acquireLock(lockPath: string, recoveryPath: string): Promise<LockOwner> {
	const waitMs = lockWaitMs();
	const deadline = Date.now() + waitMs;
	while (Date.now() < deadline) {
		const recoveryOwner: LockOwner = {
			version: 1,
			pid: process.pid,
			token: randomUUID(),
			acquiredAt: new Date().toISOString(),
		};
		if (!(await tryCreateOwnedFile(recoveryPath, recoveryOwner))) {
			await waitForRetry();
			continue;
		}
		try {
			const owner: LockOwner = {
				version: 1,
				pid: process.pid,
				token: randomUUID(),
				acquiredAt: new Date().toISOString(),
			};
			if (await tryAcquireMutationLock(lockPath, owner)) return owner;
		} finally {
			await releaseOwnedFile(recoveryPath, recoveryOwner);
		}
		await waitForRetry();
	}
	throw new UlwLoopError("Timed out waiting for the ulw-loop mutation lock.", "ULW_LOOP_LOCK_TIMEOUT", {
		details: { lockPath, waitMs },
	});
}

export async function withCrossProcessMutationLock<T>(
	repoRoot: string,
	scope: UlwLoopScope | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	await ensureUlwLoopStateDir(repoRoot, scope);
	const lockPath = join(ulwLoopDir(repoRoot, scope), ".mutation.lock");
	const recoveryPath = `${lockPath}.recovery`;
	await assertSafeUlwLoopPath(repoRoot, lockPath);
	await assertSafeUlwLoopPath(repoRoot, recoveryPath);
	const owner = await acquireLock(lockPath, recoveryPath);
	try {
		const key = mutationLockKey(repoRoot, scope);
		const active = new Set(heldLocks.getStore() ?? []);
		active.add(key);
		return await heldLocks.run(active, fn);
	} finally {
		await releaseOwnedFile(lockPath, owner);
	}
}
