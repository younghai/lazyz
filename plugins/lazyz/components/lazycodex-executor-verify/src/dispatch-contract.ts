export const DISPATCH_MARKER = "LAZYCODEX_DISPATCH_V1: ";
export const HARD_MAX_CALLS = 5;
export const HARD_MAX_SAME_FAILURE = 3;

const ROLES = ["implementer", "reviewer", "qa", "writer"] as const;
const PHASES = ["execute", "verify", "final"] as const;

export type DispatchRole = (typeof ROLES)[number];
export type DispatchPhase = (typeof PHASES)[number];

export type DispatchContract = {
	readonly schemaVersion: 1;
	readonly workId: string;
	readonly taskId: string;
	readonly runId: string;
	readonly role: DispatchRole;
	readonly phase: DispatchPhase;
	readonly criterionRefs: readonly string[];
	readonly budget: {
		readonly maxCalls: number;
		readonly maxSameFailure: number;
	};
};

export type DispatchPromptResult =
	| { readonly kind: "absent" }
	| { readonly kind: "malformed"; readonly reason: string }
	| { readonly kind: "structured"; readonly contract: DispatchContract };

export function parseDispatchPrompt(prompt: string): DispatchPromptResult {
	const markerCount = prompt.split(DISPATCH_MARKER).length - 1;
	if (markerCount === 0) return { kind: "absent" };
	if (markerCount !== 1) return { kind: "malformed", reason: "dispatch-marker-count" };
	const markerLine = prompt.split("\n").find((line) => line.startsWith(DISPATCH_MARKER));
	if (markerLine === undefined) return { kind: "malformed", reason: "dispatch-marker-format" };
	const raw = markerLine.slice(DISPATCH_MARKER.length).trim();
	try {
		const value: unknown = JSON.parse(raw);
		return isDispatchContract(value)
			? { kind: "structured", contract: value }
			: { kind: "malformed", reason: "dispatch-schema-invalid" };
	} catch (error) {
		if (error instanceof SyntaxError) return { kind: "malformed", reason: "dispatch-json-invalid" };
		throw error;
	}
}

export function sameFrozenContract(left: DispatchContract, right: DispatchContract): boolean {
	return (
		left.schemaVersion === right.schemaVersion &&
		left.workId === right.workId &&
		left.taskId === right.taskId &&
		left.role === right.role &&
		left.phase === right.phase &&
		left.budget.maxCalls === right.budget.maxCalls &&
		left.budget.maxSameFailure === right.budget.maxSameFailure &&
		left.criterionRefs.length === right.criterionRefs.length &&
		left.criterionRefs.every((criterion, index) => criterion === right.criterionRefs[index])
	);
}

function isDispatchContract(value: unknown): value is DispatchContract {
	if (
		!isRecord(value) ||
		!hasExactKeys(value, ["schemaVersion", "workId", "taskId", "runId", "role", "phase", "criterionRefs", "budget"])
	)
		return false;
	const budget = value["budget"];
	return (
		value["schemaVersion"] === 1 &&
		isSafeId(value["workId"]) &&
		isSafeId(value["taskId"]) &&
		isSafeId(value["runId"]) &&
		isStringMember(value["role"], ROLES) &&
		isStringMember(value["phase"], PHASES) &&
		isCriterionRefs(value["criterionRefs"]) &&
		isRecord(budget) &&
		hasExactKeys(budget, ["maxCalls", "maxSameFailure"]) &&
		isBoundedInteger(budget["maxCalls"], HARD_MAX_CALLS) &&
		isBoundedInteger(budget["maxSameFailure"], HARD_MAX_SAME_FAILURE)
	);
}

function isCriterionRefs(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		new Set(value).size === value.length &&
		value.every(
			(criterion) =>
				typeof criterion === "string" &&
				/^(?:[GC][0-9]{3,}|G[0-9]{3,}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\/C[0-9]{3,})$/.test(criterion),
		)
	);
}

function isSafeId(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isBoundedInteger(value: unknown, maximum: number): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum;
}

function isStringMember<const T extends readonly string[]>(value: unknown, members: T): value is T[number] {
	return typeof value === "string" && members.some((member) => member === value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
