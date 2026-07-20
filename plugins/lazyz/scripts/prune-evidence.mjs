#!/usr/bin/env node
/**
 * LazyZ evidence + ledger retention pruner.
 *
 * `.omo/evidence/`, `.omo/start-work/ledger.jsonl`, and
 * `.omo/ulw-loop/ledger.jsonl` grow without bound. This script trims them
 * to a retention window so they don't consume unbounded disk.
 *
 * Usage:
 *   node scripts/prune-evidence.mjs [--cwd <path>] [--days 30] [--max-bytes 104857600]
 *
 * Defaults: keep evidence files modified within the last 30 days OR under
 * 100 MB total, whichever is tighter. Ledger files are tail-truncated to
 * the last 10,000 lines.
 *
 * This is a manual maintenance tool — run it periodically. A future sprint
 * may auto-trigger it from SessionStart.
 */

import { readdirSync, statSync, unlinkSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv;
const CWD = args.includes("--cwd") ? args[args.indexOf("--cwd") + 1] : process.cwd();
const DAYS = args.includes("--days") ? parseInt(args[args.indexOf("--days") + 1], 10) : 30;
const MAX_BYTES = args.includes("--max-bytes")
	? parseInt(args[args.indexOf("--max-bytes") + 1], 10)
	: 100 * 1024 * 1024; // 100 MB
const LEDGER_MAX_LINES = 10_000;

const now = Date.now();
const cutoffMs = DAYS * 24 * 60 * 60 * 1000;

// --- 1. Prune evidence files by age ---
const evidenceDir = join(CWD, ".omo", "evidence");
let prunedFiles = 0;
let prunedBytes = 0;

function pruneDir(dir) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			pruneDir(full);
		} else {
			const ageMs = now - stat.mtimeMs;
			if (ageMs > cutoffMs) {
				unlinkSync(full);
				prunedFiles += 1;
				prunedBytes += stat.size;
			}
		}
	}
}

pruneDir(evidenceDir);

// --- 2. Check total evidence size; if over MAX_BYTES, prune oldest ---
function dirSize(dir) {
	if (!existsSync(dir)) return 0;
	let total = 0;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			total += dirSize(full);
		} else {
			total += stat.size;
		}
	}
	return total;
}

function oldestFiles(dir, acc = []) {
	if (!existsSync(dir)) return acc;
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			oldestFiles(full, acc);
		} else {
			acc.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
		}
	}
	return acc;
}

let totalSize = dirSize(evidenceDir);
if (totalSize > MAX_BYTES) {
	const files = oldestFiles(evidenceDir).sort((a, b) => a.mtimeMs - b.mtimeMs);
	for (const f of files) {
		if (totalSize <= MAX_BYTES) break;
		unlinkSync(f.path);
		totalSize -= f.size;
		prunedFiles += 1;
		prunedBytes += f.size;
	}
}

// --- 3. Tail-truncate ledger files ---
let truncatedLedgers = 0;
for (const ledgerRel of [".omo/start-work/ledger.jsonl", ".omo/ulw-loop/ledger.jsonl"]) {
	const ledgerPath = join(CWD, ledgerRel);
	if (!existsSync(ledgerPath)) continue;
	try {
		const content = readFileSync(ledgerPath, "utf8");
		const lines = content.split("\n");
		if (lines.length > LEDGER_MAX_LINES) {
			const kept = lines.slice(-LEDGER_MAX_LINES).join("\n");
			writeFileSync(ledgerPath, kept, "utf8");
			truncatedLedgers += 1;
		}
	} catch {
		// skip unreadable ledger
	}
}

console.log(
	`[LazyZ prune] evidence: removed ${prunedFiles} file(s), ${(prunedBytes / 1024 / 1024).toFixed(1)} MB freed. ` +
		`ledgers: truncated ${truncatedLedgers} file(s) to last ${LEDGER_MAX_LINES} lines.`,
);
