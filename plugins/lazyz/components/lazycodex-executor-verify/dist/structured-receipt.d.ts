import type { DispatchContract } from "./dispatch-contract.js";
import type { GitProvenanceReader } from "./git-provenance.js";
import type { HookFileSystem } from "./types.js";
export type ReceiptValidation = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly signature: string;
};
export type StructuredReceiptOptions = {
    readonly cwd: string;
    readonly fs: HookFileSystem;
    readonly readGitProvenance: GitProvenanceReader;
};
export declare function validateStructuredReceipt(message: string | undefined, contract: DispatchContract, options: StructuredReceiptOptions): ReceiptValidation;
