import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export function readAdmissionBreaker(sessionId) {
    const dataDir = process.env["PLUGIN_DATA"];
    if (typeof dataDir !== "string")
        return null;
    try {
        const value = JSON.parse(readFileSync(join(dataDir, "spawn-breaker", `${sessionId}.json`), "utf8"));
        return typeof value === "object" && value !== null && "reason" in value && typeof value.reason === "string"
            ? value.reason
            : "capacity limit";
    }
    catch {
        return null;
    }
}
// These hook budget files are not plan/audit state and remain outside the log.
export function atomicWriteJson(targetPath, data) {
    const tmp = join(dirname(targetPath), `.tmp-${randomBytes(6).toString("hex")}`);
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, targetPath);
}
export function isNonEmptyFile(path) {
    try {
        return existsSync(path) && statSync(path).size > 0;
    }
    catch (error) {
        if (error instanceof Error)
            return false;
        throw error;
    }
}
export function readCount(counterPath) {
    try {
        const parsed = JSON.parse(readFileSync(counterPath, "utf8"));
        return typeof parsed === "object" &&
            parsed !== null &&
            "count" in parsed &&
            typeof parsed.count === "number" &&
            parsed.count >= 0
            ? parsed.count
            : 0;
    }
    catch (error) {
        if (error instanceof Error)
            return 0;
        throw error;
    }
}
export function readCounts(counterPath) {
    try {
        const parsed = JSON.parse(readFileSync(counterPath, "utf8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            return {};
        const counts = {};
        for (const [key, value] of Object.entries(parsed))
            if (typeof value === "number" && value >= 0)
                counts[key] = value;
        return counts;
    }
    catch (error) {
        if (error instanceof Error)
            return {};
        throw error;
    }
}
