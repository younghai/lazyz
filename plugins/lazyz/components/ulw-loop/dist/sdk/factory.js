import { checkpointUlwLoop } from "../checkpoint.js";
import { checkpointTemplate } from "../checkpoint-template.js";
import { recordEvidence } from "../evidence.js";
import { normalizeUlwLoopSessionId, ulwLoopAttemptEvidenceDir, ulwLoopEvidenceRoot, ulwLoopGoalsRelativePath, } from "../paths.js";
import { addUlwLoopGoal, createUlwLoopPlan, startNextUlwLoop, summarizeUlwLoopPlan } from "../plan-crud.js";
import { listUlwLoopSessionIds, readUlwLoopPlan } from "../plan-io.js";
import { planMissingError } from "../plan-missing-recovery.js";
import { recordFinalReviewBlockers } from "../review-blockers.js";
import { UlwLoopError } from "../runtime.js";
import { statusNextActions } from "../status-next-actions.js";
import { steerUlwLoop } from "../steering.js";
import { ULW_LOOP_MANIFEST } from "./manifest.js";
// The SDK takes inline values only, so a snapshot that is not JSON is a caller error - normalize it
// to the same stable code the CLI reports instead of letting it surface as a generic failure.
function validateCodexGoalJson(raw) {
    if (raw === undefined)
        return;
    try {
        JSON.parse(raw);
    }
    catch (error) {
        throw new UlwLoopError(`Invalid codexGoal: ${error instanceof Error ? error.message : "not valid JSON"}`, "ULW_LOOP_CODEX_GOAL_JSON_INVALID", { cause: error });
    }
}
function validateContext(context) {
    if (!context.cwd.trim())
        throw new UlwLoopError("cwd is required.", "ULW_LOOP_CWD_REQUIRED");
    const sessionId = context.sessionId.trim();
    if (!sessionId)
        throw new UlwLoopError("ULW_LOOP_SESSION_ID_REQUIRED: sessionId is required.", "ULW_LOOP_SESSION_ID_REQUIRED");
    const normalizedSessionId = normalizeUlwLoopSessionId(sessionId);
    if (normalizedSessionId === null || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(sessionId))
        throw new UlwLoopError("ULW_LOOP_SESSION_ID_INVALID: sessionId normalizes to null.", "ULW_LOOP_SESSION_ID_INVALID");
    if (context.surface !== "omo-senpi" && context.surface !== "lazycodex")
        throw new UlwLoopError("surface must be omo-senpi or lazycodex.", "ULW_LOOP_SURFACE_INVALID");
}
function errorDetails(error) {
    const details = error.details === undefined
        ? undefined
        : Object.fromEntries(Object.entries(error.details).map(([key, value]) => [key, String(value)]));
    return details === undefined
        ? { code: error.code, message: error.message }
        : { code: error.code, message: error.message, details };
}
function failure(operation, error) {
    return { ok: false, operation, error: errorDetails(error) };
}
function caught(operation, error) {
    return failure(operation, error instanceof UlwLoopError ? error : new UlwLoopError(error.message, "ULW_LOOP_ERROR"));
}
function isKnownRequest(request) {
    return ULW_LOOP_MANIFEST.operations.some((operation) => operation.name === request.operation);
}
function unreachable(value) {
    throw new UlwLoopError(`Unhandled operation: ${String(value)}`, "ULW_LOOP_OPERATION_UNHANDLED");
}
function stringsFrom(result, key) {
    if (!(key in result))
        return [];
    const value = Object.entries(result).find(([name]) => name === key)?.[1];
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 8) : [];
}
function checkpointWithValidatedSnapshot(context, scope, args) {
    validateCodexGoalJson(args.codexGoalJson);
    return checkpointUlwLoop(context.cwd, args, scope, { surface: context.surface });
}
export function createAgentToolkit(context, deps = {}) {
    validateContext(context);
    const scope = { sessionId: context.sessionId };
    const notify = async (operation, response) => {
        if (deps.hooks?.onOperation !== undefined)
            await deps.hooks.onOperation({ operation, context, response });
        return response;
    };
    const invoke = async (operation, fn) => {
        try {
            const result = await fn();
            const nextActions = typeof result === "object" && result !== null ? stringsFrom(result, "nextActions") : [];
            const warnings = typeof result === "object" && result !== null ? stringsFrom(result, "warnings") : [];
            return await notify(operation, {
                ok: true,
                operation,
                result,
                nextActions,
                ...(warnings.length === 0 ? {} : { warnings }),
            });
        }
        catch (error) {
            if (error instanceof UlwLoopError && error.code === "ULW_LOOP_PLAN_MISSING" && context.surface === "omo-senpi")
                return notify(operation, failure(operation, planMissingError(ulwLoopGoalsRelativePath(scope), listUlwLoopSessionIds(context.cwd), context.surface)));
            const response = caught(operation, error instanceof Error ? error : new Error("ULW_LOOP_ERROR"));
            return notify(operation, response);
        }
    };
    const toolkit = {
        dispatch: async (request) => {
            if (!isKnownRequest(request))
                return failure(request.operation, new UlwLoopError(`Unknown operation: ${request.operation}`, "ULW_LOOP_OPERATION_UNKNOWN"));
            switch (request.operation) {
                case "help":
                    return toolkit.help();
                case "create-goals":
                    return toolkit.createGoals(request.args);
                case "status":
                    return toolkit.status();
                case "complete-goals":
                    return toolkit.completeGoals(request.args);
                case "checkpoint":
                    return toolkit.checkpoint(request.args);
                case "steer":
                    return toolkit.steer(request.args);
                case "add-goal":
                    return toolkit.addGoal(request.args);
                case "criteria":
                    return toolkit.criteria(request.args);
                case "record-evidence":
                    return toolkit.recordEvidence(request.args);
                case "record-review-blockers":
                    return toolkit.recordReviewBlockers(request.args);
                default:
                    return unreachable(request);
            }
        },
        help: () => invoke("help", async () => ULW_LOOP_MANIFEST),
        createGoals: (args) => invoke("create-goals", () => createUlwLoopPlan(context.cwd, args, scope, context.surface)),
        status: () => invoke("status", async () => {
            const plan = await readUlwLoopPlan(context.cwd, scope);
            const active = plan.goals.find((goal) => goal.id === plan.activeGoalId);
            return {
                plan,
                summary: summarizeUlwLoopPlan(plan),
                nextActions: statusNextActions(plan, context.surface),
                evidenceRoot: ulwLoopEvidenceRoot(scope),
                // Attempt directories are an evidence-layout v2 concept; a v1 plan must not advertise one.
                ...(active === undefined || plan.evidenceLayoutVersion !== 2
                    ? {}
                    : { currentAttemptDir: ulwLoopAttemptEvidenceDir(active.id, active.attempt, scope) }),
            };
        }),
        completeGoals: (args = {}) => invoke("complete-goals", () => startNextUlwLoop(context.cwd, args, scope)),
        checkpoint: (args) => invoke("checkpoint", () => args.printTemplate === true
            ? checkpointTemplate(context.cwd, scope, args.goalId, { surface: context.surface })
            : checkpointWithValidatedSnapshot(context, scope, args)),
        steer: (args) => invoke("steer", () => steerUlwLoop(context.cwd, args, scope, context.surface)),
        addGoal: (args) => invoke("add-goal", () => addUlwLoopGoal(context.cwd, args, scope, context.surface)),
        criteria: (args) => invoke("criteria", async () => {
            const plan = await readUlwLoopPlan(context.cwd, scope);
            const goal = plan.goals.find((candidate) => candidate.id === args.goalId);
            if (goal === undefined)
                throw new UlwLoopError(`Unknown ulw-loop id: ${args.goalId}.`, "ULW_LOOP_GOAL_NOT_FOUND");
            return { goalId: goal.id, criteria: goal.successCriteria };
        }),
        recordEvidence: (args) => invoke("record-evidence", () => recordEvidence(context.cwd, args, scope)),
        recordReviewBlockers: (args) => invoke("record-review-blockers", () => recordFinalReviewBlockers(context.cwd, args, scope)),
    };
    return toolkit;
}
