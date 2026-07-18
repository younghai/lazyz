#!/usr/bin/env node
/**
 * LazyZ secret redaction scrubber.
 *
 * Scans `.omo/evidence/` and `.omo/*/ledger.jsonl` for common secret patterns
 * and reports (or with --fix, masks) them in place. This is a best-effort
 * post-hoc scrubber — the first line of defense is the LLM prose rule
 * ("redact secrets before writing evidence"). This tool catches what the LLM
 * missed.
 *
 * Usage:
 *   node scripts/redact-secrets.mjs [--fix] [--cwd <path>]
 *
 * Without --fix, exits 0 if clean, 1 if secrets found (CI gate).
 * With --fix, masks matches in place: sk-xxx... → sk-REDACTED
 *
 * Patterns (regex, case-insensitive where noted):
 *   - API keys: sk-[A-Za-z0-9]{20,}, AIza[A-Za-z0-9_-]{35}, AKIA[A-Z0-9]{16}
 *   - GitHub tokens: ghp_/gho_/ghu_/ghs_[A-Za-z0-9]{36}
 *   - JWT: eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*
 *   - Bearer tokens: Bearer\s+[A-Za-z0-9._-]{20,}
 *   - Generic key=value: (password|passwd|secret|token|api_key|apikey)["']?\s*[:=]\s*["']?[A-Za-z0-9/+=_-]{16,}
 *   - Connection strings: (postgres|mongodb|redis|mysql|amqp)://[^@\s]+@[^\s'"]+
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const CWD = process.argv.includes("--cwd")
	? process.argv[process.argv.indexOf("--cwd") + 1]
	: process.cwd();
const FIX = process.argv.includes("--fix");

const PATTERNS = [
	{ name: "OpenAI/Claude API key", re: /sk-[A-Za-z0-9]{20,}/g },
	{ name: "Google API key", re: /AIza[A-Za-z0-9_-]{35}/g },
	{ name: "AWS access key", re: /AKIA[A-Z0-9]{16}/g },
	{ name: "GitHub token", re: /gh[opusr]_[A-Za-z0-9]{36}/g },
	{ name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g },
	{ name: "Bearer token", re: /Bearer\s+[A-Za-z0-9._-]{20,}/gi },
	{
		name: "Generic key=value secret",
		re: /(password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9/+._=-]{16,}/gi,
	},
	{
		name: "Connection string with credentials",
		re: /(postgres|mongodb|redis|mysql|amqp):\/\/[^:@\s]+:[^@\s]+@[^\s'"]+/gi,
	},
];

const BINARY_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".pdf", ".zip", ".gz", ".tar"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — skip very large files

function scanFile(filePath) {
	const ext = extname(filePath).toLowerCase();
	if (BINARY_EXTS.has(ext)) return [];
	let content;
	try {
		const stat = statSync(filePath);
		if (stat.size > MAX_FILE_BYTES) return [];
		content = readFileSync(filePath, "utf8");
	} catch {
		return [];
	}

	const findings = [];
	for (const { name, re } of PATTERNS) {
		re.lastIndex = 0;
		const matches = [...content.matchAll(re)];
		for (const m of matches) {
			const lineNum = content.slice(0, m.index).split("\n").length;
			const preview = m[0].slice(0, 8) + "...";
			findings.push({ file: filePath, line: lineNum, type: name, preview });
		}
	}

	if (FIX && findings.length > 0) {
		let redacted = content;
		for (const { re } of PATTERNS) {
			redacted = redacted.replace(re, (m) => {
				if (m.startsWith("Bearer ")) return "Bearer REDACTED";
				if (m.includes("=") || m.includes(":")) {
					// key=value → key=REDACTED (preserve the key name)
					return m.replace(/[:=]\s*["']?[A-Za-z0-9/+._=-]{16,}/, "=REDACTED");
				}
				if (m.includes("://")) {
					// connection string → protocol://REDACTED@
					return m.replace(/\/\/[^:@\s]+:[^@\s]+@/, "//REDACTED:REDACTED@");
				}
				return m.slice(0, 4) + "REDACTED";
			});
		}
		writeFileSync(filePath, redacted, "utf8");
	}

	return findings;
}

function walkDir(dir, results = []) {
	if (!existsSync(dir)) return results;
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
		const full = join(dir, entry);
		try {
			const stat = statSync(full);
			if (stat.isDirectory()) {
				walkDir(full, results);
			} else {
				results.push(full);
			}
		} catch {
			continue;
		}
	}
	return results;
}

const targets = [
	join(CWD, ".omo", "evidence"),
	join(CWD, ".omo", "start-work"),
	join(CWD, ".omo", "ulw-loop"),
];

let allFindings = [];
for (const target of targets) {
	const files = walkDir(target);
	for (const file of files) {
		allFindings = allFindings.concat(scanFile(file));
	}
}

if (allFindings.length === 0) {
	console.log("[LazyZ redact] No secrets found in .omo/ evidence and ledger files.");
	process.exit(0);
}

if (FIX) {
	console.log(`[LazyZ redact] Masked ${allFindings.length} secret(s) in place.`);
	for (const f of allFindings.slice(0, 20)) {
		console.log(`  ${f.file}:${f.line} ${f.type} ${f.preview}`);
	}
	if (allFindings.length > 20) console.log(`  ... and ${allFindings.length - 20} more`);
	process.exit(0);
}

console.error(`[LazyZ redact] Found ${allFindings.length} potential secret(s). Run with --fix to mask.`);
for (const f of allFindings.slice(0, 20)) {
	console.error(`  ${f.file}:${f.line} ${f.type} ${f.preview}`);
}
if (allFindings.length > 20) console.error(`  ... and ${allFindings.length - 20} more`);
process.exit(1);
