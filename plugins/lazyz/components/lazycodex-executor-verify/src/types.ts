export const SUBAGENT_STOP_EVENT = "SubagentStop";
export const POST_TOOL_USE_EVENT = "PostToolUse";
export const POST_TOOL_USE_FAILURE_EVENT = "PostToolUseFailure";
export const PRE_TOOL_USE_EVENT = "PreToolUse";

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

export type PreToolUseInput = Omit<PostToolUseInput, "hook_event_name" | "tool_response"> & {
	readonly hook_event_name: typeof PRE_TOOL_USE_EVENT;
};

export type PostToolUseFailureInput = Omit<PostToolUseInput, "hook_event_name" | "tool_response"> & {
	readonly hook_event_name: typeof POST_TOOL_USE_FAILURE_EVENT;
	readonly error?: unknown;
};

export type StopInput = {
	readonly hook_event_name: "Stop";
	readonly session_id: string;
	readonly cwd: string;
	readonly stop_hook_active: boolean;
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
	mkdirSync(path: string, options: { readonly recursive: boolean; readonly mode?: number }): unknown;
	readdirSync?(path: string): string[];
	readFileSync(path: string, encoding: "utf8"): string;
	realpathSync?(path: string): string;
	renameSync(oldPath: string, newPath: string): void;
	rmSync(path: string, options: { readonly force: true; readonly recursive?: boolean }): void;
	statSync(path: string): FileStat;
	writeFileSync(path: string, data: string, options?: { readonly flag: "wx"; readonly mode: number }): void;
};
