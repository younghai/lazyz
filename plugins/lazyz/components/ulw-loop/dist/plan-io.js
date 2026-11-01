import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync } from "node:fs";
import { aggregateCodexObjectiveForScope } from "./goal-status.js";
import { readLedger as reconcileLedger } from "./ledger.js";
import { repoRelative, ulwLoopDir, ulwLoopGoalsPath, ulwLoopRelativeDir, ulwLoopStateLockPath, } from "./paths.js";
import { commit, materialize, materializeSync } from "./plan-commit.js";
import { readOptional, reconcilePlan } from "./plan-log.js";
import { planMissingError } from "./plan-missing-recovery.js";
import { withStateLock } from "./state-lock.js";
import { iso, ULW_LOOP_DIR, ULW_LOOP_GOALS, ULW_LOOP_LEDGER, UlwLoopError, } from "./types.js";
export function readLedger(repoRoot, scope) {
    const lockPath = ulwLoopStateLockPath(repoRoot, scope);
    if (heldLocks.getStore()?.has(lockPath)) {
        assertStateLockOwned(lockPath);
        materializeSync(ulwLoopDir(repoRoot, scope));
    }
    return reconcileLedger(repoRoot, scope);
}
export { planExists } from "./plan-log.js";
const LEGACY_OBJECTIVE_PREFIX = `Complete all ulw-loop stories in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}: `;
const LEGACY_OBJECTIVE = `Complete all ulw-loop stories listed in ${ULW_LOOP_DIR}/${ULW_LOOP_GOALS}. Use ${ULW_LOOP_DIR}/${ULW_LOOP_LEDGER} as the durable audit trail.`;
const locks = new Map();
const heldLocks = new AsyncLocalStorage();
const lockOptions = new AsyncLocalStorage();
export function withMutationLockOptions(options, fn) {
    return lockOptions.run(options, fn);
}
function tokenAt(lockPath) {
    const raw = readOptional(lockPath);
    if (raw === undefined)
        return undefined;
    try {
        const record = JSON.parse(raw);
        return typeof record === "object" && record !== null && "token" in record && typeof record.token === "string"
            ? record.token
            : undefined;
    }
    catch (error) {
        if (error instanceof SyntaxError)
            return undefined;
        throw error;
    }
}
export function assertStateLockOwned(lockPath) {
    const context = heldLocks.getStore()?.get(lockPath);
    if (context === undefined)
        return;
    if (tokenAt(lockPath) !== context.token)
        throw new UlwLoopError("The ulw-loop mutation lock changed owners.", "ULW_LOOP_LOCK_LOST");
}
export function migrationEntries(plan) {
    for (const context of heldLocks.getStore()?.values() ?? []) {
        const entries = context.migrations.get(plan.goalsPath);
        if (entries !== undefined) {
            context.migrations.delete(plan.goalsPath);
            return entries;
        }
    }
    return [];
}
export async function withUlwLoopMutationLock(repoRoot, scopeOrFn, maybeFn, options = {}) {
    const scope = typeof scopeOrFn === "function" ? undefined : scopeOrFn;
    const fn = typeof scopeOrFn === "function" ? scopeOrFn : maybeFn;
    if (fn === undefined)
        throw new UlwLoopError("Missing ulw-loop mutation body.", "ULW_LOOP_LOCK_BODY_MISSING");
    const lockKey = `${repoRoot}\0${ulwLoopRelativeDir(scope)}`;
    const lockPath = ulwLoopStateLockPath(repoRoot, scope);
    const locked = () => withStateLock(lockPath, async (token) => {
        return heldLocks.run(new Map([...(heldLocks.getStore() ?? []), [lockPath, { token, migrations: new Map() }]]), async () => {
            for (let attempt = 0;; attempt += 1) {
                try {
                    return await fn();
                }
                catch (error) {
                    if (!(error instanceof UlwLoopError) || error.code !== "ULW_LOOP_PUBLISH_CONFLICT")
                        throw error;
                    assertStateLockOwned(lockPath);
                    if (attempt !== 0)
                        throw error;
                }
            }
        });
    }, { ...lockOptions.getStore(), ...options });
    const prior = locks.get(lockKey) ?? Promise.resolve(undefined);
    const run = prior.then(locked, locked);
    const gate = run.then(() => undefined, () => undefined);
    locks.set(lockKey, gate);
    void gate.then(() => {
        if (locks.get(lockKey) === gate)
            locks.delete(lockKey);
    });
    return run;
}
export function readUlwLoopPlanSync(repoRoot, scope) {
    const path = ulwLoopGoalsPath(repoRoot, scope);
    const parsed = reconcilePlan(ulwLoopDir(repoRoot, scope));
    if (parsed === undefined)
        throw planMissingError(repoRelative(path, repoRoot), listUlwLoopSessionIds(repoRoot));
    if (parsed.version !== 1 || !Array.isArray(parsed.goals))
        throw new UlwLoopError(`Invalid ulw-loop plan at ${repoRelative(path, repoRoot)}.`, "ULW_LOOP_PLAN_INVALID");
    const previousObjective = parsed.codexObjective;
    if ((parsed.codexGoalMode ?? "per_story") === "aggregate" &&
        previousObjective !== undefined &&
        (previousObjective === LEGACY_OBJECTIVE || previousObjective.startsWith(LEGACY_OBJECTIVE_PREFIX))) {
        parsed.codexObjective = aggregateCodexObjectiveForScope(scope);
        parsed.codexObjectiveAliases = [...new Set([...(parsed.codexObjectiveAliases ?? []), previousObjective])];
        heldLocks
            .getStore()
            ?.get(ulwLoopStateLockPath(repoRoot, scope))
            ?.migrations.set(parsed.goalsPath, [
            {
                at: iso(),
                kind: "aggregate_objective_migrated",
                before: { codexObjective: previousObjective },
                after: { codexObjective: parsed.codexObjective },
            },
        ]);
    }
    return parsed;
}
export async function readUlwLoopPlan(repoRoot, scope) {
    if (heldLocks.getStore()?.has(ulwLoopStateLockPath(repoRoot, scope))) {
        assertStateLockOwned(ulwLoopStateLockPath(repoRoot, scope));
        await materialize(ulwLoopDir(repoRoot, scope));
    }
    return readUlwLoopPlanSync(repoRoot, scope);
}
export function listUlwLoopSessionIds(repoRoot) {
    try {
        return readdirSync(ulwLoopDir(repoRoot), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }
    catch {
        return [];
    }
}
export async function writePlan(repoRoot, plan, scope) {
    await commit(repoRoot, scope, { plan, entries: [] });
}
export async function appendLedger(repoRoot, entry, scope) {
    await appendLedgerEntries(repoRoot, [entry], scope);
}
export async function appendLedgerEntries(repoRoot, entries, scope) {
    if (entries.length > 0)
        await commit(repoRoot, scope, { plan: await readUlwLoopPlan(repoRoot, scope), entries });
}
function isSteeringKind(value) {
    return (value === "steering_accepted" ||
        value === "steering_rejected" ||
        value === "criteria_revised" ||
        value === "batch_updated");
}
export async function readSteeringLedgerEntries(repoRoot, scope) {
    return readLedger(repoRoot, scope).filter((entry) => isSteeringKind(entry.kind));
}
export async function findAcceptedSteeringLedgerEntry(repoRoot, key, scope) {
    return readLedger(repoRoot, scope).find((entry) => isSteeringKind(entry.kind) &&
        entry.steering?.invariant.accepted === true &&
        (entry.idempotencyKey === key ||
            entry.steering.idempotencyKey === key ||
            entry.steering.promptSignature === key));
}
