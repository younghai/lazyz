import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync } from "node:fs";
import { join } from "node:path";
const MAX_GIT_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 32 * 1024 * 1024;
const MAX_UNTRACKED_FILES = 2_000;
const SOURCE_PATHS = [
    ".",
    ":(exclude).omo/evidence",
    ":(exclude).omo/ulw-loop",
    ":(exclude).omo/lazycodex-executor-verify",
];
class ProvenanceBudgetError extends Error {
    constructor() {
        super(...arguments);
        this.name = "ProvenanceBudgetError";
    }
}
function gitOutput(cwd, args, counters) {
    counters.gitCalls += 1;
    const output = execFileSync("git", ["-C", cwd, ...args], {
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        timeout: 1_000,
        stdio: ["ignore", "pipe", "ignore"],
    });
    counters.gitOutputBytes += output.length;
    return output;
}
function gitText(cwd, args, counters) {
    return gitOutput(cwd, args, counters).toString("utf8").trim();
}
function updateFingerprint(hash, label, value) {
    const content = typeof value === "string" ? Buffer.from(value) : value;
    hash.update(`${label}\0${content.length}\0`);
    hash.update(content);
}
function nonRegularType(stat) {
    if (stat.isFIFO())
        return "fifo";
    if (stat.isSocket())
        return "socket";
    if (stat.isCharacterDevice())
        return "character-device";
    if (stat.isBlockDevice())
        return "block-device";
    if (stat.isDirectory())
        return "directory";
    return "other";
}
export function fingerprintUntrackedContent(path, stat) {
    if (stat.isSymbolicLink())
        return readlinkSync(path);
    if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES)
            throw new ProvenanceBudgetError("untracked file exceeds byte budget");
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const current = fstatSync(fd);
            if (!current.isFile() || current.ino !== stat.ino || current.size !== stat.size) {
                throw new ProvenanceBudgetError("untracked file changed during fingerprint");
            }
            const content = Buffer.alloc(current.size + 1);
            let offset = 0;
            while (offset < content.length) {
                const bytes = readSync(fd, content, offset, content.length - offset, offset);
                if (bytes === 0)
                    break;
                offset += bytes;
            }
            const after = fstatSync(fd);
            if (offset !== current.size || after.mtimeMs !== current.mtimeMs || after.size !== current.size) {
                throw new ProvenanceBudgetError("untracked file changed during fingerprint");
            }
            return content.subarray(0, offset);
        }
        finally {
            closeSync(fd);
        }
    }
    return `non-regular:${nonRegularType(stat)}`;
}
function dirtyTreeFingerprint(cwd, diff, input) {
    const hash = createHash("sha256");
    updateFingerprint(hash, "schema", "lazyz-worktree-v1");
    updateFingerprint(hash, "tracked-diff", diff);
    if (input.paths.length > MAX_UNTRACKED_FILES)
        throw new ProvenanceBudgetError("untracked file count exceeds budget");
    for (const path of [...input.paths].sort()) {
        const absolutePath = join(cwd, path);
        const stat = lstatSync(absolutePath);
        if (stat.isFile() && input.counters.untrackedBytes + stat.size > MAX_TOTAL_FILE_BYTES) {
            throw new ProvenanceBudgetError("untracked files exceed total byte budget");
        }
        const content = fingerprintUntrackedContent(absolutePath, stat);
        input.counters.untrackedFiles += 1;
        if (stat.isFile())
            input.counters.untrackedBytes += Buffer.byteLength(content);
        updateFingerprint(hash, "untracked-path", path);
        updateFingerprint(hash, "untracked-mode", (stat.mode & 0o177777).toString(8));
        updateFingerprint(hash, "untracked-content", content);
    }
    return hash.digest("hex");
}
export function inspectGitProvenance(cwd) {
    const started = performance.now();
    const counters = { gitCalls: 0, gitOutputBytes: 0, untrackedFiles: 0, untrackedBytes: 0 };
    try {
        const commitSha = gitText(cwd, ["rev-parse", "HEAD"], counters);
        const headTreeOid = gitText(cwd, ["rev-parse", "HEAD^{tree}"], counters);
        const diff = gitOutput(cwd, ["diff", "--binary", "HEAD", "--", ...SOURCE_PATHS], counters);
        const untrackedPaths = gitOutput(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...SOURCE_PATHS], counters)
            .toString("utf8")
            .split("\0")
            .filter((path) => path.length > 0);
        const treeOid = diff.length === 0 && untrackedPaths.length === 0
            ? headTreeOid
            : dirtyTreeFingerprint(cwd, diff, { paths: untrackedPaths, counters });
        const provenance = commitSha.length > 0 && treeOid.length > 0 ? { commitSha, treeOid } : null;
        return {
            provenance,
            metrics: {
                ...counters,
                durationMs: performance.now() - started,
                status: provenance === null ? "unavailable" : "complete",
            },
        };
    }
    catch (error) {
        if (error instanceof Error)
            return {
                provenance: null,
                metrics: {
                    ...counters,
                    durationMs: performance.now() - started,
                    status: error instanceof ProvenanceBudgetError ? "budget-exceeded" : "unavailable",
                },
            };
        throw error;
    }
}
export const readGitProvenance = (cwd) => inspectGitProvenance(cwd).provenance;
