#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { runSubagentStopHook } from "./codex-hook.js";
const nodeFileSystem = {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
};
const command = process.argv[2];
const subcommand = process.argv[3];
if (command === "hook" && subcommand === "subagent-stop") {
    await runHookCli();
}
else {
    process.stderr.write("Usage: lazycodex-executor-verify hook subagent-stop\n");
    process.exitCode = 1;
}
async function runHookCli() {
    const raw = await readStdin();
    if (raw.trim().length === 0)
        return;
    const parsed = parseHookInput(raw);
    const output = runSubagentStopHook(parsed, nodeFileSystem);
    if (output.length > 0)
        processStdout.write(output);
}
function parseHookInput(raw) {
    try {
        const parsed = JSON.parse(raw);
        return parsed;
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return undefined;
        throw error;
    }
}
function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        processStdin.setEncoding("utf8");
        processStdin.on("data", (chunk) => {
            data += chunk;
        });
        processStdin.once("error", () => resolve(data));
        processStdin.once("end", () => resolve(data));
    });
}
