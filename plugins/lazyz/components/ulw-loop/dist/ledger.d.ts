import { type UlwLoopScope } from "./paths.js";
import type { UlwLoopLedgerEntry } from "./types.js";
export declare function readLedgerAt(dir: string): UlwLoopLedgerEntry[];
export declare function readLedger(repoRoot: string, scope?: UlwLoopScope): UlwLoopLedgerEntry[];
