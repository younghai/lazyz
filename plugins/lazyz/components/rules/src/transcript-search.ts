import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const DEFAULT_TRANSCRIPT_SEARCH_WINDOW_BYTES = 1024 * 1024;

export interface TranscriptSearchOptions {
	readonly latestCompactedReplacementOnly?: boolean;
	readonly maxWindowBytes?: number;
}

export interface TranscriptSearchMetrics {
	readonly fileBytes: number;
	readonly bytesRead: number;
	readonly windowStartByte: number;
	readonly parsedJsonLines: number;
	readonly truncated: boolean;
	readonly readCalls: 1;
}

export interface TranscriptSearchResult {
	readonly text: string;
	readonly rawText: string;
	readonly metrics: TranscriptSearchMetrics;
}

export function readTranscriptSearchText(transcriptPath: string, options: TranscriptSearchOptions = {}): string | null {
	return readTranscriptSearchWindow(transcriptPath, options)?.text ?? null;
}

export function readTranscriptSearchWindow(
	transcriptPath: string,
	options: TranscriptSearchOptions = {},
): TranscriptSearchResult | null {
	const window = readTranscriptWindow(transcriptPath, options.maxWindowBytes);
	if (window === null) return null;
	if (options.latestCompactedReplacementOnly === true) {
		const compacted = latestCompactedReplacementSearchText(window.rawText);
		return compacted === null ? null : toResult(window, compacted.text, compacted.parsedJsonLines);
	}
	const collected = collectJsonLineStrings(window.rawText);
	return toResult(window, [window.rawText, ...collected.values].join("\n"), collected.parsedJsonLines);
}

export function readTranscriptRecoverySearchText(
	transcriptPath: string,
	options: Omit<TranscriptSearchOptions, "latestCompactedReplacementOnly"> = {},
): TranscriptSearchResult | null {
	const window = readTranscriptWindow(transcriptPath, options.maxWindowBytes);
	if (window === null) return null;
	const compacted = latestCompactedReplacementSearchText(window.rawText);
	if (compacted !== null) return toResult(window, compacted.text, compacted.parsedJsonLines);
	const collected = collectJsonLineStrings(window.rawText);
	return toResult(window, [window.rawText, ...collected.values].join("\n"), collected.parsedJsonLines);
}

interface TranscriptWindow {
	readonly rawText: string;
	readonly fileBytes: number;
	readonly bytesRead: number;
	readonly windowStartByte: number;
}

function readTranscriptWindow(transcriptPath: string, requestedMaxBytes: number | undefined): TranscriptWindow | null {
	const maxBytes = normalizeWindowBytes(requestedMaxBytes);
	let fd: number | undefined;
	try {
		fd = openSync(transcriptPath, "r");
		const fileBytes = fstatSync(fd).size;
		const bytesToRead = Math.min(fileBytes, maxBytes);
		const windowStartByte = fileBytes - bytesToRead;
		const buffer = Buffer.allocUnsafe(bytesToRead);
		const bytesRead = bytesToRead === 0 ? 0 : readSync(fd, buffer, 0, bytesToRead, windowStartByte);
		return { rawText: buffer.subarray(0, bytesRead).toString("utf8"), fileBytes, bytesRead, windowStartByte };
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		return null;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

function normalizeWindowBytes(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		return DEFAULT_TRANSCRIPT_SEARCH_WINDOW_BYTES;
	}
	return Math.floor(value);
}

function toResult(window: TranscriptWindow, text: string, parsedJsonLines: number): TranscriptSearchResult {
	return {
		text,
		rawText: window.rawText,
		metrics: {
			fileBytes: window.fileBytes,
			bytesRead: window.bytesRead,
			windowStartByte: window.windowStartByte,
			parsedJsonLines,
			truncated: window.windowStartByte > 0,
			readCalls: 1,
		},
	};
}

function latestCompactedReplacementSearchText(
	rawTranscript: string,
): { readonly text: string; readonly parsedJsonLines: number } | null {
	const lines = rawTranscript.split(/\r?\n/);
	let latestCompactedLineIndex = -1;
	let replacementHistory: unknown[] | null = null;
	let parsedJsonLines = 0;
	for (const [index, line] of lines.entries()) {
		const parsed = parseJsonLine(line);
		if (parsed !== null) parsedJsonLines += 1;
		if (!isRecord(parsed) || parsed["type"] !== "compacted") continue;
		const payload = parsed["payload"];
		if (!isRecord(payload)) continue;
		const candidateReplacementHistory = payload["replacement_history"];
		if (!Array.isArray(candidateReplacementHistory)) continue;
		latestCompactedLineIndex = index;
		replacementHistory = candidateReplacementHistory;
	}
	if (replacementHistory === null) return null;
	const values: string[] = [];
	collectStrings(replacementHistory, values);
	const laterTranscript = lines.slice(latestCompactedLineIndex + 1).join("\n");
	const later = collectJsonLineStrings(laterTranscript);
	values.push(laterTranscript, ...later.values);
	return { text: values.join("\n"), parsedJsonLines };
}

function collectJsonLineStrings(rawTranscript: string): {
	readonly values: readonly string[];
	readonly parsedJsonLines: number;
} {
	const values: string[] = [];
	let parsedJsonLines = 0;
	for (const line of rawTranscript.split(/\r?\n/)) {
		const parsed = parseJsonLine(line);
		if (parsed === null) continue;
		parsedJsonLines += 1;
		collectStrings(parsed, values);
	}
	return { values, parsedJsonLines };
}

function parseJsonLine(line: string): unknown | null {
	if (line.trim().length === 0) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(line);
		return parsed;
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return null;
	}
}

function collectStrings(value: unknown, output: string[]): void {
	if (typeof value === "string") {
		output.push(value);
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			collectStrings(item, output);
		}
		return;
	}

	if (!isRecord(value)) {
		return;
	}

	for (const item of Object.values(value)) {
		collectStrings(item, output);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
