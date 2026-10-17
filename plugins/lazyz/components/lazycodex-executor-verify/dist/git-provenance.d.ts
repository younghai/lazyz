import { type Stats } from "node:fs";
export type GitProvenance = {
    readonly commitSha: string;
    readonly treeOid: string;
};
export type GitProvenanceReader = (cwd: string) => GitProvenance | null;
type ProvenanceCounters = {
    gitCalls: number;
    gitOutputBytes: number;
    untrackedFiles: number;
    untrackedBytes: number;
};
export declare function fingerprintUntrackedContent(path: string, stat: Stats): string | Buffer;
export declare function inspectGitProvenance(cwd: string): {
    readonly provenance: GitProvenance | null;
    readonly metrics: Readonly<ProvenanceCounters> & {
        readonly durationMs: number;
        readonly status: "complete" | "budget-exceeded" | "unavailable";
    };
};
export declare const readGitProvenance: GitProvenanceReader;
export {};
