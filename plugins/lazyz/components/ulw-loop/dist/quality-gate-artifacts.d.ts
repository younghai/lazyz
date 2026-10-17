import type { UlwLoopScope } from "./paths.js";
export declare function validateBoundFile(repoRoot: string, pathValue: unknown, hashValue: unknown, field: string, scope?: UlwLoopScope): {
    readonly path: string;
    readonly sha256: string;
};
