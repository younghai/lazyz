export declare function readAdmissionBreaker(sessionId: string): string | null;
export declare function atomicWriteJson(targetPath: string, data: unknown): void;
export declare function isNonEmptyFile(path: string): boolean;
export declare function readCount(counterPath: string): number;
export declare function readCounts(counterPath: string): Record<string, number>;
