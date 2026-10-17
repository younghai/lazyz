import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ulwLoopBriefPath, ulwLoopDir, ulwLoopGoalsPath, ulwLoopLedgerPath } from "./paths.js";
import { UlwLoopError } from "./types.js";
function hasCode(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
function pathEscape(path, cause) {
    return new UlwLoopError(`Refusing unsafe ulw-loop state path: ${path}.`, "ULW_LOOP_PATH_ESCAPE", {
        ...(cause === undefined ? {} : { cause }),
        details: { path },
    });
}
function isWithinRoot(path, root) {
    const child = relative(root, path);
    return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}
export async function assertSafeUlwLoopPath(repoRoot, targetPath) {
    const lexicalRoot = resolve(repoRoot);
    const lexicalTarget = resolve(targetPath);
    if (!isWithinRoot(lexicalTarget, lexicalRoot))
        throw pathEscape(lexicalTarget);
    const actualRoot = await realpath(lexicalRoot);
    const child = relative(lexicalRoot, lexicalTarget);
    let current = lexicalRoot;
    for (const segment of child.split(sep).filter(Boolean)) {
        current = resolve(current, segment);
        try {
            const info = await lstat(current);
            if (info.isSymbolicLink())
                throw pathEscape(current);
            const actual = await realpath(current);
            if (!isWithinRoot(actual, actualRoot))
                throw pathEscape(current);
        }
        catch (error) {
            if (hasCode(error, "ENOENT"))
                return;
            throw error;
        }
    }
}
export async function ensureUlwLoopStateDir(repoRoot, scope) {
    const directory = ulwLoopDir(repoRoot, scope);
    await assertSafeUlwLoopPath(repoRoot, directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertSafeUlwLoopPath(repoRoot, directory);
}
export async function assertUlwLoopStatePaths(repoRoot, scope) {
    await Promise.all([
        assertSafeUlwLoopPath(repoRoot, ulwLoopBriefPath(repoRoot, scope)),
        assertSafeUlwLoopPath(repoRoot, ulwLoopGoalsPath(repoRoot, scope)),
        assertSafeUlwLoopPath(repoRoot, ulwLoopLedgerPath(repoRoot, scope)),
    ]);
}
export async function readSafeTextFile(path) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        return await handle.readFile("utf8");
    }
    finally {
        await handle.close();
    }
}
export async function writeSafeTextFile(path, content) {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
        try {
            await handle.writeFile(content, "utf8");
        }
        finally {
            await handle.close();
        }
        await rename(temporary, path);
    }
    catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}
export async function appendSafeTextFile(path, content) {
    const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
        await handle.writeFile(content, "utf8");
    }
    finally {
        await handle.close();
    }
}
export async function safeFileExists(repoRoot, path) {
    await assertSafeUlwLoopPath(repoRoot, path);
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (hasCode(error, "ENOENT"))
            return false;
        throw error;
    }
}
