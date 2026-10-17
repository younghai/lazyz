import { parseDispatchPrompt } from "./dispatch-contract.js";
import { readGitProvenance } from "./git-provenance.js";
import { validateStructuredReceipt } from "./structured-receipt.js";
import { inspectSessionTasks, recordRunResult, reserveRun } from "./task-state.js";
export { runSubagentStopHook } from "./legacy-hook.js";
const EXECUTOR_AGENTS = [
    "general-purpose",
    "executor",
    "lazycodex-executor",
    "lazycodex-worker-high",
    "lazycodex-worker-medium",
    "lazycodex-worker-low",
];
const EXPLORE_AGENTS = ["explore", "explorer"];
const LAZYZ_AGENT_NAMESPACE = "lazyz:";
const BACKGROUND_STRUCTURED_EXECUTION_REASON = "structured-executor-background-unsupported";
export function runPreToolUseHook(input, fs) {
    if (!isPreToolUseInput(input) || !isAgentTool(input.tool_name))
        return "";
    const call = parseAgentCall(input.tool_input);
    if (call === null)
        return "";
    const parsed = parseDispatchPrompt(call.prompt);
    if (parsed.kind === "malformed")
        return deny("PreToolUse", parsed.reason);
    if (parsed.kind === "structured" && call.runInBackground)
        return deny("PreToolUse", BACKGROUND_STRUCTURED_EXECUTION_REASON);
    if (parsed.kind === "absent")
        return isGovernedAgent(call.subagentType) ? deny("PreToolUse", "structured-dispatch-required") : "";
    const result = reserveRun(input.cwd, input.session_id, parsed.contract, input.tool_use_id, fs);
    return result.ok ? "" : deny("PreToolUse", result.reason);
}
export function runPostToolUseHook(input, fs, options = {}) {
    if (!isPostToolUseInput(input) || !isAgentTool(input.tool_name))
        return "";
    const call = parseAgentCall(input.tool_input);
    if (call === null)
        return "";
    const parsed = parseDispatchPrompt(call.prompt);
    if (parsed.kind === "malformed")
        return postContext(parsed.reason);
    if (parsed.kind === "absent")
        return isGovernedAgent(call.subagentType) ? postContext("structured-dispatch-required") : "";
    const response = unwrapZCodeAgentResponse(input.tool_response);
    if (isBackgroundAgentResponse(response))
        return postContext("executor-background-unresolved");
    const receipt = validateStructuredReceipt(extractAssistantMessage(response), parsed.contract, {
        cwd: input.cwd,
        fs,
        readGitProvenance: options.readGitProvenance ?? readGitProvenance,
    });
    const recorded = recordRunResult(input.cwd, input.session_id, parsed.contract, input.tool_use_id, receipt.ok ? { kind: "passed" } : { kind: "failed", signature: receipt.signature }, fs);
    if (!recorded.ok)
        return postContext(recorded.reason);
    return receipt.ok ? "" : postContext(receipt.signature);
}
export function runPostToolUseFailureHook(input, fs) {
    if (!isPostToolUseFailureInput(input) || !isAgentTool(input.tool_name))
        return "";
    const call = parseAgentCall(input.tool_input);
    if (call === null)
        return "";
    const parsed = parseDispatchPrompt(call.prompt);
    if (parsed.kind === "malformed")
        return postFailureContext(parsed.reason);
    if (parsed.kind === "absent") {
        return isGovernedAgent(call.subagentType) ? postFailureContext("structured-dispatch-required") : "";
    }
    const recorded = recordRunResult(input.cwd, input.session_id, parsed.contract, input.tool_use_id, { kind: "failed", signature: "tool-execution-failed" }, fs);
    return postFailureContext(recorded.ok ? "tool-execution-failed" : recorded.reason);
}
export function runStopHook(input, fs) {
    if (!isStopInput(input) || input.stop_hook_active)
        return "";
    const inspection = inspectSessionTasks(input.cwd, input.session_id, fs);
    if (inspection.invalid)
        return JSON.stringify({ decision: "block", reason: "Structured executor task state is invalid" });
    const unresolved = inspection.tasks.filter((task) => !task.runs.some((run) => run.status === "passed"));
    if (unresolved.length === 0 || unresolved.every((task) => task.exhausted))
        return "";
    const taskIds = unresolved
        .filter((task) => !task.exhausted)
        .map((task) => task.contract.taskId)
        .sort();
    return JSON.stringify({
        decision: "block",
        reason: `Structured executor work remains unresolved: ${taskIds.join(", ")}`,
    });
}
function parseAgentCall(toolInput) {
    if (!isRecord(toolInput) || typeof toolInput["prompt"] !== "string")
        return null;
    const subagentType = typeof toolInput["subagent_type"] === "string" ? toolInput["subagent_type"] : undefined;
    const runInBackground = toolInput["run_in_background"] === true;
    return subagentType === undefined
        ? { prompt: toolInput["prompt"], runInBackground }
        : { prompt: toolInput["prompt"], runInBackground, subagentType };
}
function isGovernedAgent(value) {
    if (value === undefined)
        return true;
    const normalized = normalizeAgentType(value);
    if (EXPLORE_AGENTS.some((agent) => agent === normalized))
        return false;
    return EXECUTOR_AGENTS.some((agent) => agent === normalized);
}
function normalizeAgentType(value) {
    const normalized = value.toLowerCase();
    return normalized.startsWith(LAZYZ_AGENT_NAMESPACE)
        ? normalized.slice(LAZYZ_AGENT_NAMESPACE.length)
        : normalized;
}
function unwrapZCodeAgentResponse(response) {
    if (!isRecord(response) || !("response" in response))
        return response;
    return response["response"];
}
function isBackgroundAgentResponse(response) {
    return isRecord(response) && response["status"] === "async_launched" && response["isAsync"] === true;
}
function extractAssistantMessage(response) {
    if (typeof response === "string")
        return response;
    if (!isRecord(response))
        return undefined;
    if (typeof response["text"] === "string")
        return response["text"];
    if (typeof response["content"] === "string")
        return response["content"];
    if (!Array.isArray(response["content"]))
        return undefined;
    const text = response["content"].flatMap((item) => isRecord(item) && item["type"] === "text" && typeof item["text"] === "string" ? [item["text"]] : []);
    return text.length === 0 ? undefined : text.join("\n");
}
function deny(eventName, reason) {
    return JSON.stringify({
        hookSpecificOutput: { hookEventName: eventName, permissionDecision: "deny", permissionDecisionReason: reason },
    });
}
function postContext(reason) {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: `Executor evidence failed: ${reason}. The persisted task remains unresolved.`,
        },
    });
}
function postFailureContext(reason) {
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PostToolUseFailure",
            additionalContext: `Executor invocation failed: ${reason}. Error details were not persisted.`,
        },
    });
}
function isPreToolUseInput(value) {
    return isCommonToolInput(value) && value["hook_event_name"] === "PreToolUse";
}
function isPostToolUseInput(value) {
    return isCommonToolInput(value) && value["hook_event_name"] === "PostToolUse";
}
function isPostToolUseFailureInput(value) {
    return isCommonToolInput(value) && value["hook_event_name"] === "PostToolUseFailure";
}
function isCommonToolInput(value) {
    return (isRecord(value) &&
        typeof value["session_id"] === "string" &&
        typeof value["cwd"] === "string" &&
        typeof value["tool_name"] === "string" &&
        typeof value["tool_use_id"] === "string" &&
        Object.hasOwn(value, "tool_input"));
}
function isStopInput(value) {
    return (isRecord(value) &&
        value["hook_event_name"] === "Stop" &&
        typeof value["session_id"] === "string" &&
        typeof value["cwd"] === "string" &&
        typeof value["stop_hook_active"] === "boolean");
}
function isAgentTool(value) {
    return value === "Agent" || value === "Task";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
