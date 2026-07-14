export const STOP_HOOK_EVENTS = ["Stop", "SubagentStop"] as const;
export type StopHookEventName = (typeof STOP_HOOK_EVENTS)[number];

export type StopInput = {
	readonly hook_event_name: StopHookEventName;
	readonly session_id: string;
	readonly turn_id: string;
	readonly transcript_path: string;
	readonly cwd: string;
	readonly model: string;
	readonly permission_mode: string;
	readonly stop_hook_active: boolean;
	readonly last_assistant_message?: string;
};

export type StopHookOutput = {
	readonly decision: "block";
	readonly reason: string;
};

export type ReadonlyFileSystem = {
	readFileSync(path: string, encoding: "utf8"): string;
};

export type ReadWriteFileSystem = {
	readFileSync(path: string, encoding: "utf8"): string;
	existsSync(path: string): boolean;
	mkdirSync(path: string, options: { recursive: true }): void;
	writeFileSync(path: string, data: string): void;
	renameSync(from: string, to: string): void;
	rmSync(path: string, options: { force: true }): void;
};
