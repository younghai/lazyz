import { createHash, randomUUID } from "node:crypto";

const ROLES = ["implementer", "reviewer", "qa", "writer"];
const PHASES = ["execute", "verify", "final"];
const HARD_MAX_CALLS = 5;
const HARD_MAX_SAME_FAILURE = 3;

export const DISPATCH_MARKER = "LAZYCODEX_DISPATCH_V1: ";

export function dispatchOptionsFromFlags(flags) {
	return {
		role: parseMember(flags.role, ROLES, "role", "implementer"),
		phase: parseMember(flags.phase, PHASES, "phase", "execute"),
		maxCalls: parseBoundedInteger(flags["max-calls"], "max-calls", HARD_MAX_CALLS),
		maxSameFailure: parseBoundedInteger(
			flags["max-same-failure"],
			"max-same-failure",
			HARD_MAX_SAME_FAILURE,
		),
	};
}

export function buildMemberDispatch(team, member, options = {}) {
	const role = parseMember(options.role, ROLES, "role", "implementer");
	const phase = parseMember(options.phase, PHASES, "phase", "execute");
	const maxCalls = parseBoundedInteger(options.maxCalls, "max-calls", HARD_MAX_CALLS);
	const maxSameFailure = parseBoundedInteger(
		options.maxSameFailure,
		"max-same-failure",
		HARD_MAX_SAME_FAILURE,
	);
	const taskSeed = `${team.teamId}\0${member.id}\0${role}\0${phase}`;
	const taskId = `team-${createHash("sha256").update(taskSeed).digest("hex").slice(0, 32)}`;
	const runId = `run-${randomUUID()}`;
	return {
		contract: {
			schemaVersion: 1,
			workId: `team-${team.teamId}`,
			taskId,
			runId,
			role,
			phase,
			criterionRefs: ["C001"],
			budget: { maxCalls, maxSameFailure },
		},
		criterion: member.deliverable || member.focus,
		receiptPath: `.omo/evidence/${taskId}-${runId}.json`,
		finalMarker: phase === "final" ? "FINAL_EVIDENCE_RECORDED" : "EVIDENCE_RECORDED",
	};
}

function parseMember(value, allowed, label, fallback) {
	const resolved = value ?? fallback;
	if (!allowed.includes(resolved)) throw new Error(`invalid ${label} "${resolved}" - use one of: ${allowed.join(", ")}`);
	return resolved;
}

function parseBoundedInteger(value, label, maximum) {
	if (value === undefined) return maximum;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
		throw new Error(`invalid ${label} "${value}" - use an integer from 1 to ${maximum}`);
	}
	return parsed;
}
