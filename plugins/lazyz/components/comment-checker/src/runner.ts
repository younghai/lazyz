import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { CommentCheckerHookInput } from "./core.js";

export type ProcessResult = {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut?: boolean;
	readonly cancelled?: boolean;
};

export const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;

export interface ProcessExecutionOptions {
	readonly maxOutputBytes?: number;
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
}

export type ProcessExecutor = (
	command: string,
	args: string[],
	stdin: string,
	options?: ProcessExecutionOptions,
) => Promise<ProcessResult>;

export type RunCommentCheckerOptions = {
	binaryPath?: string;
	customPrompt?: string;
	resolveBinary?: () => string | undefined;
	executor?: ProcessExecutor;
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
};

export type CommentCheckerRunResult = {
	status: "pass" | "warning" | "error" | "missing";
	message: string;
	binaryPath?: string;
	exitCode?: number | null;
	stdout?: string;
	stderr?: string;
};

export interface CommentCheckerRunnerOptions {
	readonly signal?: AbortSignal;
}

export type CommentCheckerRunner = (
	input: CommentCheckerHookInput,
	options?: CommentCheckerRunnerOptions,
) => Promise<CommentCheckerRunResult>;

export async function runCommentChecker(
	input: CommentCheckerHookInput,
	options: RunCommentCheckerOptions = {},
): Promise<CommentCheckerRunResult> {
	const binaryPath =
		options.binaryPath ?? (options.resolveBinary ? options.resolveBinary() : resolveCommentCheckerBinary());
	if (!binaryPath) {
		return {
			status: "missing",
			message: "comment-checker binary not found. Run npm install for the codex-comment-checker plugin.",
		};
	}

	const args = ["check"];
	if (options.customPrompt) {
		args.push("--prompt", options.customPrompt);
	}

	const executor = options.executor ?? spawnProcess;
	const result = await executor(binaryPath, args, JSON.stringify(input), {
		timeoutMs: options.timeoutMs ?? 4_000,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	const message = result.stderr || result.stdout;
	if (result.timedOut === true || result.cancelled === true) {
		return {
			status: "error",
			message,
			binaryPath,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}
	if (result.exitCode === 0) {
		return {
			status: "pass",
			message: "",
			binaryPath,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}
	if (result.exitCode === 2) {
		return {
			status: "warning",
			message,
			binaryPath,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}
	return {
		status: "error",
		message,
		binaryPath,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

export function resolveCommentCheckerBinary(): string | undefined {
	const binaryName = process.platform === "win32" ? "comment-checker.exe" : "comment-checker";
	const fromPackageApi = resolvePackageApiBinary();
	if (fromPackageApi) return fromPackageApi;
	const fromPackage = resolvePackageBinary(binaryName);
	if (fromPackage) return fromPackage;
	return undefined;
}

function resolvePackageApiBinary(): string | undefined {
	try {
		const require = createRequire(import.meta.url);
		const packageExports: unknown = require(commentCheckerPackageName());
		if (!isCommentCheckerPackage(packageExports)) return undefined;
		const binaryPath = packageExports.getBinaryPath();
		return existsSync(binaryPath) ? binaryPath : undefined;
	} catch {
		return undefined;
	}
}

function resolvePackageBinary(binaryName: string): string | undefined {
	try {
		const require = createRequire(import.meta.url);
		const packagePath = require.resolve(`${commentCheckerPackageName()}/package.json`);
		const binaryPath = join(dirname(packagePath), "bin", binaryName);
		return existsSync(binaryPath) ? binaryPath : undefined;
	} catch {
		return undefined;
	}
}

function commentCheckerPackageName(): string {
	return ["@code-yeongyu", "comment-checker"].join("/");
}

function isCommentCheckerPackage(value: unknown): value is { getBinaryPath: () => string } {
	return isRecord(value) && typeof value["getBinaryPath"] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

interface OutputAccumulator {
	text: string;
	bytes: number;
	truncated: boolean;
}

function appendOutput(output: OutputAccumulator, chunk: string, maxOutputBytes: number): void {
	if (output.truncated) return;

	const remainingBytes = maxOutputBytes - output.bytes;
	const chunkBytes = Buffer.byteLength(chunk, "utf8");
	if (chunkBytes <= remainingBytes) {
		output.text += chunk;
		output.bytes += chunkBytes;
		return;
	}

	if (remainingBytes > 0) {
		output.text += Buffer.from(chunk, "utf8").subarray(0, remainingBytes).toString("utf8");
		output.bytes += remainingBytes;
	}
	output.truncated = true;
}

function formatOutput(output: OutputAccumulator, streamName: "stdout" | "stderr", maxOutputBytes: number): string {
	if (!output.truncated) return output.text;
	return `${output.text}\n[${streamName} truncated after ${maxOutputBytes} bytes]`;
}

export function spawnProcess(
	command: string,
	args: string[],
	stdin: string,
	options: number | ProcessExecutionOptions = {},
): Promise<ProcessResult> {
	return new Promise((resolve) => {
		const executionOptions = typeof options === "number" ? { maxOutputBytes: options } : options;
		const maxOutputBytes = executionOptions.maxOutputBytes ?? MAX_PROCESS_OUTPUT_BYTES;
		const outputByteLimit = Number.isFinite(maxOutputBytes) && maxOutputBytes > 0 ? Math.floor(maxOutputBytes) : 0;
		const proc = spawn(command, args, {
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: OutputAccumulator = { text: "", bytes: 0, truncated: false };
		const stderr: OutputAccumulator = { text: "", bytes: 0, truncated: false };
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const finish = (result: ProcessResult): void => {
			if (settled) return;
			settled = true;
			if (timeout !== undefined) clearTimeout(timeout);
			executionOptions.signal?.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const capturedResult = (exitCode: number | null, timedOut = false, cancelled = false): ProcessResult => ({
			exitCode,
			stdout: formatOutput(stdout, "stdout", outputByteLimit),
			stderr: formatOutput(stderr, "stderr", outputByteLimit),
			timedOut,
			cancelled,
		});
		const stop = (timedOut: boolean, cancelled: boolean): void => {
			proc.kill("SIGTERM");
			finish(capturedResult(null, timedOut, cancelled));
		};
		const onAbort = (): void => stop(false, true);

		proc.stdout.setEncoding("utf-8");
		proc.stderr.setEncoding("utf-8");
		proc.stdout.on("data", (chunk: string) => {
			appendOutput(stdout, chunk, outputByteLimit);
		});
		proc.stderr.on("data", (chunk: string) => {
			appendOutput(stderr, chunk, outputByteLimit);
		});
		proc.once("error", (error) => {
			appendOutput(stderr, error.message, outputByteLimit);
			finish(capturedResult(null));
		});
		proc.once("close", (exitCode) => {
			finish(capturedResult(exitCode));
		});
		proc.stdin.on("error", (error) => appendOutput(stderr, error.message, outputByteLimit));
		if (executionOptions.timeoutMs !== undefined && executionOptions.timeoutMs > 0) {
			timeout = setTimeout(() => stop(true, false), executionOptions.timeoutMs);
			timeout.unref?.();
		}
		if (executionOptions.signal?.aborted) {
			onAbort();
			return;
		}
		executionOptions.signal?.addEventListener("abort", onAbort, { once: true });
		proc.stdin.end(stdin);
	});
}
