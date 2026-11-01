import { UlwLoopError } from "./types.js";
const PLACEHOLDER_PATTERN = /^(?:<replace:[^>]+>|placeholder|todo|tbd|n\/a|stub)$/i;
let activeCollector;
/** A recorded defect poisons only its field; consumers skip dependent checks while preserving valid siblings and entry identity. */
export function withQualityGateCollector(operation) {
    const previous = activeCollector;
    const collector = { defects: [], poisonedFields: new Set(), poisonedArtifactKinds: new Set() };
    activeCollector = collector;
    try {
        const result = operation();
        if (collector.defects.length === 0)
            return result;
        throwQualityGateDefects(collector.defects);
    }
    finally {
        activeCollector = previous;
    }
}
export function throwQualityGateDefects(defects) {
    const uniqueDefects = [
        ...new Map(defects.map((defect) => [`${defect.field}\u0000${defect.message}`, defect])).values(),
    ];
    const fields = uniqueDefects.slice(0, 25);
    const truncated = uniqueDefects.length > fields.length;
    const message = [
        `Final quality gate has ${fields.length}${truncated ? "+" : ""} validation defects:`,
        ...fields.map((item) => `- ${item.field}: ${item.message}`),
    ].join("\n");
    throw new UlwLoopError(message, "ULW_LOOP_QUALITY_GATE_INVALID", {
        details: { field: fields[0]?.field, fields, ...(truncated ? { truncated: true } : {}) },
    });
}
export function invalid(message, field) {
    if (activeCollector === undefined)
        throw new UlwLoopError(message, "ULW_LOOP_QUALITY_GATE_INVALID", { details: { field } });
    activeCollector.defects.push({ field, message });
    activeCollector.poisonedFields.add(field);
    return undefined;
}
export function isPoisoned(field) {
    return activeCollector?.poisonedFields.has(field) ?? false;
}
export function poisonField(field) {
    activeCollector?.poisonedFields.add(field);
}
export function markPoisonedArtifactKind(id) {
    activeCollector?.poisonedArtifactKinds.add(id);
}
export function isPoisonedArtifactKind(id) {
    return activeCollector?.poisonedArtifactKinds.has(id) ?? false;
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function section(value, field) {
    if (isRecord(value))
        return value;
    invalid(`Final quality gate is missing ${field} evidence (accepted input: a bare object with manualQa/gateReview/iteration/criteriaCoverage and optional codeReview, or the same object under a top-level "qualityGate" key).`, field);
    return {};
}
export function textField(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        invalid(`Final quality gate requires non-empty ${field}.`, field);
        return "";
    }
    const trimmed = value.trim();
    if (PLACEHOLDER_PATTERN.test(trimmed))
        invalid(`Final quality gate rejects placeholder ${field}.`, field);
    return trimmed;
}
export function numberField(value, field) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    invalid(`Final quality gate requires numeric ${field}.`, field);
    return 0;
}
export function stringArray(value, field) {
    if (!Array.isArray(value) || value.length === 0) {
        invalid(`Final quality gate requires ${field}.`, field);
        return [];
    }
    return value.map((item) => textField(item, field));
}
export function emptyBlockers(value, field) {
    if (Array.isArray(value) && value.length === 0)
        return [];
    invalid(`${field} must be empty.`, field);
    return [];
}
export function literal(value, expected, field) {
    if (value === expected)
        return expected;
    invalid(`${field} must be ${String(expected)}.`, field);
    return expected;
}
