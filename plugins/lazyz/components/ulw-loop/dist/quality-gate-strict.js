import { isFinalRunCompletionCandidate } from "./goal-status.js";
import { validateQualityGate } from "./quality-gate.js";
import { validateBoundFile } from "./quality-gate-artifacts.js";
import { deriveQualityGatePlanFingerprint, expectedQualityGateCriterionRefs } from "./quality-gate-binding.js";
import { parseQualityGateExecutions } from "./quality-gate-executions.js";
import { invalid, numberField, section, stringArray, textField } from "./quality-gate-fields.js";
function exactUnique(actual, expected, field) {
    if (new Set(actual).size !== actual.length)
        invalid(`${field} contains duplicate references.`, field);
    const expectedSet = new Set(expected);
    if (expectedSet.size !== expected.length)
        invalid("The ulw-loop plan contains duplicate criterion references.", field);
    if (actual.length !== expected.length || actual.some((item) => !expectedSet.has(item))) {
        invalid(`${field} must exactly match the actual plan criteria.`, field);
    }
}
function requireUnique(values, field) {
    if (new Set(values).size !== values.length)
        invalid("Duplicate references are not allowed.", field);
}
function arrayField(value, field) {
    if (!Array.isArray(value))
        invalid(`${field} must be an array.`, field);
    return value;
}
function parseSource(value, expected) {
    if (expected === null)
        invalid("Current git provenance is unavailable; strict completion cannot proceed.", "binding.source");
    const source = section(value, "binding.source");
    const commitSha = textField(source["commitSha"], "binding.source.commitSha");
    const treeOid = textField(source["treeOid"], "binding.source.treeOid");
    if (commitSha !== expected.commitSha || treeOid !== expected.treeOid) {
        invalid("binding.source does not match the current repository source.", "binding.source");
    }
    return { commitSha, treeOid };
}
export function validateStrictQualityGate(input, context) {
    const base = validateQualityGate(input);
    const gate = section(input, "qualityGate");
    const binding = section(gate["binding"], "binding");
    const finalGoal = context.finalGoal;
    if (finalGoal === undefined)
        invalid("Strict completion requires the actual final goal.", "binding.finalGoalId");
    if (!context.plan.goals.includes(finalGoal) || !isFinalRunCompletionCandidate(context.plan, finalGoal)) {
        invalid("Strict completion requires the plan's current final completion candidate.", "binding.finalGoalId");
    }
    if (numberField(binding["schemaVersion"], "binding.schemaVersion") !== 2) {
        invalid("binding.schemaVersion must be 2.", "binding.schemaVersion");
    }
    const planFingerprint = textField(binding["planFingerprint"], "binding.planFingerprint");
    if (planFingerprint !== deriveQualityGatePlanFingerprint(context.plan))
        invalid("binding.planFingerprint does not match the actual plan.", "binding.planFingerprint");
    const finalGoalId = textField(binding["finalGoalId"], "binding.finalGoalId");
    const finalGoalObjective = textField(binding["finalGoalObjective"], "binding.finalGoalObjective");
    if (finalGoalId !== finalGoal.id || finalGoalObjective !== finalGoal.objective)
        invalid("binding final task does not match the actual final goal.", "binding.finalGoalId");
    const source = parseSource(binding["source"], context.source);
    const expectedCriteria = expectedQualityGateCriterionRefs(context.plan);
    const coverage = section(gate["criteriaCoverage"], "criteriaCoverage");
    if (base.criteriaCoverage.totalCriteria !== expectedCriteria.length)
        invalid("criteriaCoverage.totalCriteria must equal the actual plan count.", "criteriaCoverage.totalCriteria");
    if (base.criteriaCoverage.passCount !== expectedCriteria.length)
        invalid("criteriaCoverage.passCount must equal the actual passing count.", "criteriaCoverage.passCount");
    const criterionRefs = stringArray(coverage["criterionRefs"], "criteriaCoverage.criterionRefs");
    exactUnique(criterionRefs, expectedCriteria, "criteriaCoverage.criterionRefs");
    const manualQa = section(gate["manualQa"], "manualQa");
    const rawArtifacts = manualQa["artifactRefs"];
    if (!Array.isArray(rawArtifacts))
        invalid("manualQa.artifactRefs must be an array.", "manualQa.artifactRefs");
    const artifactIds = new Set();
    const artifactHashes = new Map();
    for (const [index, item] of rawArtifacts.entries()) {
        const row = section(item, `manualQa.artifactRefs[${index}]`);
        const id = textField(row["id"], `manualQa.artifactRefs[${index}].id`);
        artifactIds.add(id);
        const bound = validateBoundFile(context.repoRoot, row["path"], row["sha256"], `manualQa.artifactRefs[${index}]`, context.scope);
        artifactHashes.set(id, bound.sha256);
    }
    const executions = parseQualityGateExecutions(manualQa["executions"], artifactIds);
    exactUnique(executions.flatMap((execution) => execution.criterionRefs), expectedCriteria, "manualQa.executions.criterionRefs");
    exactUnique(executions.flatMap((execution) => execution.artifactRefs), [...artifactIds], "manualQa.executions.artifactRefs");
    const executionById = new Map(executions.map((execution) => [execution.id, execution]));
    const surfaceCriteria = [];
    const surfaceExecutionRefs = [];
    for (const [index, item] of arrayField(manualQa["surfaceEvidence"], "manualQa.surfaceEvidence").entries()) {
        const row = section(item, `manualQa.surfaceEvidence[${index}]`);
        const criterionRef = textField(row["criterionRef"], `manualQa.surfaceEvidence[${index}].criterionRef`);
        const executionRef = textField(row["executionRef"], `manualQa.surfaceEvidence[${index}].executionRef`);
        const execution = executionById.get(executionRef);
        const rowArtifacts = stringArray(row["artifactRefs"], `manualQa.surfaceEvidence[${index}].artifactRefs`);
        requireUnique(rowArtifacts, `manualQa.surfaceEvidence[${index}].artifactRefs`);
        if (execution === undefined ||
            !execution.criterionRefs.includes(criterionRef) ||
            execution.command !== textField(row["invocation"], `manualQa.surfaceEvidence[${index}].invocation`) ||
            rowArtifacts.some((artifact) => !execution.artifactRefs.includes(artifact)))
            invalid("surface evidence is not bound to its successful execution.", `manualQa.surfaceEvidence[${index}].executionRef`);
        surfaceCriteria.push(criterionRef);
        surfaceExecutionRefs.push(executionRef);
    }
    exactUnique(surfaceCriteria, expectedCriteria, "manualQa.surfaceEvidence.criterionRef");
    const adversarialExecutionRefs = [];
    for (const [index, item] of arrayField(manualQa["adversarialCases"], "manualQa.adversarialCases").entries()) {
        const row = section(item, `manualQa.adversarialCases[${index}]`);
        const criterionRef = textField(row["criterionRef"], `manualQa.adversarialCases[${index}].criterionRef`);
        if (!expectedCriteria.includes(criterionRef))
            invalid("adversarial case references an unknown criterion.", `manualQa.adversarialCases[${index}].criterionRef`);
        const executionRef = textField(row["executionRef"], `manualQa.adversarialCases[${index}].executionRef`);
        const execution = executionById.get(executionRef);
        const rowArtifacts = stringArray(row["artifactRefs"], `manualQa.adversarialCases[${index}].artifactRefs`);
        requireUnique(rowArtifacts, `manualQa.adversarialCases[${index}].artifactRefs`);
        if (execution === undefined ||
            !execution.criterionRefs.includes(criterionRef) ||
            rowArtifacts.some((artifact) => !execution.artifactRefs.includes(artifact)))
            invalid("adversarial case is not bound to its successful execution.", `manualQa.adversarialCases[${index}].executionRef`);
        adversarialExecutionRefs.push(executionRef);
    }
    const codeReview = section(gate["codeReview"], "codeReview");
    const codeReport = validateBoundFile(context.repoRoot, codeReview["reportPath"], codeReview["reportSha256"], "codeReview.report", context.scope);
    const gateReview = section(gate["gateReview"], "gateReview");
    const gateReport = validateBoundFile(context.repoRoot, gateReview["reportPath"], gateReview["reportSha256"], "gateReview.report", context.scope);
    exactUnique(base.iteration.rerunCommands, executions.map((execution) => execution.command), "iteration.rerunCommands");
    return {
        ...base,
        binding: { schemaVersion: 2, planFingerprint, finalGoalId, finalGoalObjective, source },
        codeReview: { ...base.codeReview, reportSha256: codeReport.sha256 },
        manualQa: {
            ...base.manualQa,
            surfaceEvidence: base.manualQa.surfaceEvidence.map((row, index) => ({
                ...row,
                executionRef: surfaceExecutionRefs[index] ?? invalid("Missing surface execution binding.", "manualQa.surfaceEvidence"),
            })),
            adversarialCases: base.manualQa.adversarialCases.map((row, index) => ({
                ...row,
                executionRef: adversarialExecutionRefs[index] ??
                    invalid("Missing adversarial execution binding.", "manualQa.adversarialCases"),
            })),
            artifactRefs: base.manualQa.artifactRefs.map((artifact) => ({
                ...artifact,
                sha256: artifactHashes.get(artifact.id) ?? invalid("Missing artifact hash binding.", "manualQa.artifactRefs"),
            })),
            executions,
        },
        gateReview: { ...base.gateReview, reportSha256: gateReport.sha256 },
        criteriaCoverage: { ...base.criteriaCoverage, criterionRefs },
    };
}
