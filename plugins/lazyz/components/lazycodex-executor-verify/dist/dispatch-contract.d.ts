export declare const DISPATCH_MARKER = "LAZYCODEX_DISPATCH_V1: ";
export declare const HARD_MAX_CALLS = 5;
export declare const HARD_MAX_SAME_FAILURE = 3;
declare const ROLES: readonly ["implementer", "reviewer", "qa", "writer"];
declare const PHASES: readonly ["execute", "verify", "final"];
export type DispatchRole = (typeof ROLES)[number];
export type DispatchPhase = (typeof PHASES)[number];
export type DispatchContract = {
    readonly schemaVersion: 1;
    readonly workId: string;
    readonly taskId: string;
    readonly runId: string;
    readonly role: DispatchRole;
    readonly phase: DispatchPhase;
    readonly criterionRefs: readonly string[];
    readonly budget: {
        readonly maxCalls: number;
        readonly maxSameFailure: number;
    };
};
export type DispatchPromptResult = {
    readonly kind: "absent";
} | {
    readonly kind: "malformed";
    readonly reason: string;
} | {
    readonly kind: "structured";
    readonly contract: DispatchContract;
};
export declare function parseDispatchPrompt(prompt: string): DispatchPromptResult;
export declare function sameFrozenContract(left: DispatchContract, right: DispatchContract): boolean;
export {};
