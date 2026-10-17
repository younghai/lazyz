import { existsSync, readFileSync } from "node:fs";

export type PlanChecklist = {
	readonly completed: number;
	readonly remaining: number;
	readonly total: number;
	readonly nextTaskLabel: string | null;
};

const TODO_HEADING = "TODOs";
const FINAL_VERIFICATION_HEADING = "Final Verification Wave";
const CHECKBOX_PREFIX_LENGTH = "- [ ] ".length;

export function getPlanChecklist(planPath: string): PlanChecklist {
	if (!existsSync(planPath)) return emptyChecklist();
	try {
		return parsePlanChecklist(readFileSync(planPath, "utf8"));
	} catch (error) {
		if (error instanceof Error) return emptyChecklist();
		throw error;
	}
}

function parsePlanChecklist(markdown: string): PlanChecklist {
	const lines = markdown.split(/\r?\n/);
	const hasCountedSections = lines.some((line) => isCountedHeading(parseLevelTwoHeading(line)));
	let completed = 0;
	let remaining = 0;
	let nextTaskLabel: string | null = null;
	let isCountedSection = !hasCountedSections;
	for (const line of lines) {
		const heading = parseLevelTwoHeading(line);
		if (heading !== null) {
			isCountedSection = isCountedHeading(heading);
			continue;
		}
		if (!isCountedSection) continue;
		const checkbox = parseTopLevelCheckbox(line);
		if (checkbox === null) continue;
		if (checkbox.checked) completed += 1;
		else {
			remaining += 1;
			nextTaskLabel = nextTaskLabel ?? checkbox.label;
		}
	}
	return { completed, remaining, total: completed + remaining, nextTaskLabel };
}

function parseTopLevelCheckbox(line: string): { readonly checked: boolean; readonly label: string } | null {
	if (line.startsWith("- [ ] ")) return { checked: false, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	if (line.startsWith("- [x] ") || line.startsWith("- [X] "))
		return { checked: true, label: line.slice(CHECKBOX_PREFIX_LENGTH) };
	return null;
}

function parseLevelTwoHeading(line: string): string | null {
	return line.startsWith("## ") ? line.slice("## ".length).trim() : null;
}

function isCountedHeading(heading: string | null): boolean {
	return heading === TODO_HEADING || heading === FINAL_VERIFICATION_HEADING;
}

function emptyChecklist(): PlanChecklist {
	return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
}
