import type { GitProvenanceReader } from "./git-provenance.js";
import type { HookFileSystem } from "./types.js";
export type EvidenceVerifierOptions = {
    readonly readGitProvenance?: GitProvenanceReader;
};
type EvidenceValidationContext = {
    readonly cwd: string;
    readonly fs: HookFileSystem;
    readonly readGitProvenance: GitProvenanceReader;
};
export declare function hasValidEvidenceReceipt(lastAssistantMessage: string | undefined, context: EvidenceValidationContext): boolean;
export {};
