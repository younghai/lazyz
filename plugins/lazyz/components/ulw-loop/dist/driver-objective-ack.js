export function normalizeDriverObjective(value) {
    return value.replace(/\s+/g, " ").trim();
}
export function acknowledgedDriverObjectives(plan) {
    return plan.acknowledgedDriverObjectives ?? [];
}
// A differing driver objective is reported once; the plan remembers the exact text so every later
// checkpoint under the same driver stays quiet, while a driver rewritten to a third objective is
// reported again.
export function acknowledgeDriverObjective(plan, objective) {
    if (objective === undefined)
        return false;
    const normalized = normalizeDriverObjective(objective);
    if (!normalized || acknowledgedDriverObjectives(plan).includes(normalized))
        return false;
    plan.acknowledgedDriverObjectives = [...acknowledgedDriverObjectives(plan), normalized];
    return true;
}
