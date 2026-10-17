import { invalid, numberField, section, stringArray, textField } from "./quality-gate-fields.js";
function unique(values, field) {
    if (new Set(values).size !== values.length)
        invalid("Duplicate references are not allowed.", field);
}
export function parseQualityGateExecutions(value, artifactIds) {
    if (!Array.isArray(value) || value.length === 0)
        invalid("manualQa.executions must not be empty.", "manualQa.executions");
    const ids = new Set();
    return value.map((item, index) => {
        const field = `manualQa.executions[${index}]`;
        const row = section(item, field);
        const id = textField(row["id"], `${field}.id`);
        if (ids.has(id))
            invalid(`manualQa.executions contains duplicate ${id}.`, "manualQa.executions");
        ids.add(id);
        const exitCode = numberField(row["exitCode"], `${field}.exitCode`);
        if (!Number.isInteger(exitCode) || exitCode !== 0)
            invalid(`${field}.exitCode must be 0.`, `${field}.exitCode`);
        const criterionRefs = stringArray(row["criterionRefs"], `${field}.criterionRefs`);
        const artifactRefs = stringArray(row["artifactRefs"], `${field}.artifactRefs`);
        unique(criterionRefs, `${field}.criterionRefs`);
        unique(artifactRefs, `${field}.artifactRefs`);
        for (const artifactRef of artifactRefs)
            if (!artifactIds.has(artifactRef))
                invalid(`${field}.artifactRefs references unknown ${artifactRef}.`, `${field}.artifactRefs`);
        return { id, command: textField(row["command"], `${field}.command`), exitCode: 0, criterionRefs, artifactRefs };
    });
}
