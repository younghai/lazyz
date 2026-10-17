export const DISPATCH_MARKER = "LAZYCODEX_DISPATCH_V1: ";
export const HARD_MAX_CALLS = 5;
export const HARD_MAX_SAME_FAILURE = 3;
const ROLES = ["implementer", "reviewer", "qa", "writer"];
const PHASES = ["execute", "verify", "final"];
export function parseDispatchPrompt(prompt) {
    const markerCount = prompt.split(DISPATCH_MARKER).length - 1;
    if (markerCount === 0)
        return { kind: "absent" };
    if (markerCount !== 1)
        return { kind: "malformed", reason: "dispatch-marker-count" };
    const markerLine = prompt.split("\n").find((line) => line.startsWith(DISPATCH_MARKER));
    if (markerLine === undefined)
        return { kind: "malformed", reason: "dispatch-marker-format" };
    const raw = markerLine.slice(DISPATCH_MARKER.length).trim();
    try {
        const value = JSON.parse(raw);
        return isDispatchContract(value)
            ? { kind: "structured", contract: value }
            : { kind: "malformed", reason: "dispatch-schema-invalid" };
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return { kind: "malformed", reason: "dispatch-json-invalid" };
        throw error;
    }
}
export function sameFrozenContract(left, right) {
    return (left.schemaVersion === right.schemaVersion &&
        left.workId === right.workId &&
        left.taskId === right.taskId &&
        left.role === right.role &&
        left.phase === right.phase &&
        left.budget.maxCalls === right.budget.maxCalls &&
        left.budget.maxSameFailure === right.budget.maxSameFailure &&
        left.criterionRefs.length === right.criterionRefs.length &&
        left.criterionRefs.every((criterion, index) => criterion === right.criterionRefs[index]));
}
function isDispatchContract(value) {
    if (!isRecord(value) ||
        !hasExactKeys(value, ["schemaVersion", "workId", "taskId", "runId", "role", "phase", "criterionRefs", "budget"]))
        return false;
    const budget = value["budget"];
    return (value["schemaVersion"] === 1 &&
        isSafeId(value["workId"]) &&
        isSafeId(value["taskId"]) &&
        isSafeId(value["runId"]) &&
        isStringMember(value["role"], ROLES) &&
        isStringMember(value["phase"], PHASES) &&
        isCriterionRefs(value["criterionRefs"]) &&
        isRecord(budget) &&
        hasExactKeys(budget, ["maxCalls", "maxSameFailure"]) &&
        isBoundedInteger(budget["maxCalls"], HARD_MAX_CALLS) &&
        isBoundedInteger(budget["maxSameFailure"], HARD_MAX_SAME_FAILURE));
}
function isCriterionRefs(value) {
    return (Array.isArray(value) &&
        value.length > 0 &&
        new Set(value).size === value.length &&
        value.every((criterion) => typeof criterion === "string" &&
            /^(?:[GC][0-9]{3,}|G[0-9]{3,}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\/C[0-9]{3,})$/.test(criterion)));
}
function isSafeId(value) {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function isBoundedInteger(value, maximum) {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum;
}
function isStringMember(value, members) {
    return typeof value === "string" && members.some((member) => member === value);
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
