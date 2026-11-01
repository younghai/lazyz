type QualityGateDefect = {
    readonly field: string;
    readonly message: string;
};
/** A recorded defect poisons only its field; consumers skip dependent checks while preserving valid siblings and entry identity. */
export declare function withQualityGateCollector<T>(operation: () => T): T;
export declare function throwQualityGateDefects(defects: readonly QualityGateDefect[]): never;
export declare function invalid(message: string, field: string): undefined;
export declare function isPoisoned(field: string): boolean;
export declare function poisonField(field: string): void;
export declare function markPoisonedArtifactKind(id: string): void;
export declare function isPoisonedArtifactKind(id: string): boolean;
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function section(value: unknown, field: string): Record<string, unknown>;
export declare function textField(value: unknown, field: string): string;
export declare function numberField(value: unknown, field: string): number;
export declare function stringArray(value: unknown, field: string): readonly string[];
export declare function emptyBlockers(value: unknown, field: string): readonly [];
export declare function literal<T extends string | boolean>(value: unknown, expected: T, field: string): T;
export {};
