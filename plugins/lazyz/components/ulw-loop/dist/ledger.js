import { join } from "node:path";
import { ulwLoopDir } from "./paths.js";
import { readOptional, readRecords, reconcilePlan } from "./plan-log.js";
export function readLedgerAt(dir) {
    const entries = new Map();
    const lines = (readOptional(join(dir, "ledger.jsonl")) ?? "").split(/\r?\n/);
    // A materialized view is sorted by revision, so a line that carries no revision (or revision 0)
    // AFTER a published revision was appended out-of-band (the removed tool path) and belongs to the
    // newest revision before it - not to the pre-store past a later ledgerResetRevision would discard.
    let reached = 0;
    for (const [index, line] of lines.entries()) {
        if (line.trim().length === 0)
            continue;
        try {
            const entry = JSON.parse(line);
            entry.revision = entry.revision || reached;
            reached = Math.max(reached, entry.revision);
            entry.id ??= `legacy-${index + 1}`;
            entries.set(entry.id, entry);
        }
        catch (error) {
            if (!(error instanceof SyntaxError))
                throw error;
        }
    }
    for (const record of readRecords(dir))
        for (const [seq, entry] of record.ledger.entries()) {
            const id = entry.id ?? `${record.revision}-${seq}`;
            entries.set(id, { ...entry, revision: record.revision, id });
        }
    const reset = reconcilePlan(dir)?.ledgerResetRevision ?? 0;
    const sequence = (entry) => Number(entry.id?.split("-").at(-1) ?? 0);
    return [...entries.values()]
        .filter((entry) => (entry.revision ?? 0) >= reset)
        .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0) || sequence(a) - sequence(b));
}
export function readLedger(repoRoot, scope) {
    return readLedgerAt(ulwLoopDir(repoRoot, scope));
}
