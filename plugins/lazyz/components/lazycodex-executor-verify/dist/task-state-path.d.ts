import type { HookFileSystem } from "./types.js";
export declare function getTaskStatePath(cwd: string, sessionId: string, taskId: string): string;
export declare function sessionStateDir(cwd: string, sessionId: string): string;
export declare function ensureSafeStateDirectory(cwd: string, directory: string, fs: HookFileSystem): boolean;
export declare function isSafeExistingStateDirectory(cwd: string, directory: string, fs: HookFileSystem): boolean;
export declare function isInside(path: string, directory: string): boolean;
export declare function digestStateKey(value: string): string;
