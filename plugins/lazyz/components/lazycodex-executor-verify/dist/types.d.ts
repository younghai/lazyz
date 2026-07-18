export declare const SUBAGENT_STOP_EVENT = "SubagentStop";
export declare const POST_TOOL_USE_EVENT = "PostToolUse";
export type SubagentStopInput = {
    readonly hook_event_name: typeof SUBAGENT_STOP_EVENT;
    readonly agent_type: string;
    readonly agent_id: string;
    readonly session_id: string;
    readonly cwd: string;
    readonly transcript_path: string;
    readonly model: string;
    readonly permission_mode: string;
    readonly stop_hook_active: boolean;
    readonly turn_id?: string;
    readonly last_assistant_message?: string;
};
export type StopHookOutput = {
    readonly decision: "block";
    readonly reason: string;
};
export type PostToolUseInput = {
    readonly hook_event_name: typeof POST_TOOL_USE_EVENT;
    readonly session_id: string;
    readonly cwd: string;
    readonly transcript_path: string;
    readonly tool_name: string;
    readonly tool_use_id: string;
    readonly tool_input?: unknown;
    readonly tool_response?: unknown;
};
export type PostToolUseDenyOutput = {
    readonly hookSpecificOutput?: {
        readonly hookEventName: typeof POST_TOOL_USE_EVENT;
        readonly permissionDecision: "deny";
        readonly permissionDecisionReason: string;
    };
};
export type FileStat = {
    readonly size: number;
    readonly isFile?: () => boolean;
    readonly isSymbolicLink?: () => boolean;
};
export type HookFileSystem = {
    existsSync(path: string): boolean;
    lstatSync?(path: string): FileStat;
    mkdirSync(path: string, options: {
        readonly recursive: true;
        readonly mode?: number;
    }): unknown;
    readFileSync(path: string, encoding: "utf8"): string;
    realpathSync?(path: string): string;
    renameSync(oldPath: string, newPath: string): void;
    rmSync(path: string, options: {
        readonly force: true;
        readonly recursive?: boolean;
    }): void;
    statSync(path: string): FileStat;
    writeFileSync(path: string, data: string): void;
};
