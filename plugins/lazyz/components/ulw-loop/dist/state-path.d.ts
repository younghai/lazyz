import { type UlwLoopScope } from "./paths.js";
export declare function assertSafeUlwLoopPath(repoRoot: string, targetPath: string): Promise<void>;
export declare function ensureUlwLoopStateDir(repoRoot: string, scope?: UlwLoopScope): Promise<void>;
export declare function assertUlwLoopStatePaths(repoRoot: string, scope?: UlwLoopScope): Promise<void>;
export declare function readSafeTextFile(path: string): Promise<string>;
export declare function writeSafeTextFile(path: string, content: string): Promise<void>;
export declare function appendSafeTextFile(path: string, content: string): Promise<void>;
export declare function safeFileExists(repoRoot: string, path: string): Promise<boolean>;
