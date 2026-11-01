import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const REVIEWER_ROLES_BY_SURFACE = {
    lazycodex: {
        codeReview: "lazycodex-code-reviewer",
        manualQa: "lazycodex-qa-executor",
        gateReview: "lazycodex-gate-reviewer",
    },
    "omo-senpi": {
        codeReview: "omo-native-code-reviewer",
        manualQa: "omo-native-qa-executor",
        gateReview: "omo-native-gate-reviewer",
    },
};
// The reviewer agents were renamed omo-senpi-* -> omo-native-*. The retired spellings stay
// resolvable for one release line so a caller that still names one is recognized rather than
// silently treated as a non-review spawn.
export const LEGACY_REVIEWER_AGENT_ALIASES = {
    "omo-senpi-code-reviewer": REVIEWER_ROLES_BY_SURFACE["omo-senpi"].codeReview,
    "omo-senpi-qa-executor": REVIEWER_ROLES_BY_SURFACE["omo-senpi"].manualQa,
    "omo-senpi-gate-reviewer": REVIEWER_ROLES_BY_SURFACE["omo-senpi"].gateReview,
};
export function canonicalReviewerAgentName(reviewer) {
    return LEGACY_REVIEWER_AGENT_ALIASES[reviewer] ?? reviewer;
}
const CANONICAL_GATE_REVIEW_NAMES = Object.values(REVIEWER_ROLES_BY_SURFACE).map((roles) => roles.gateReview);
export const GATE_REVIEWER_AGENT_NAMES = new Set([
    ...CANONICAL_GATE_REVIEW_NAMES,
    ...Object.entries(LEGACY_REVIEWER_AGENT_ALIASES)
        .filter(([, canonical]) => CANONICAL_GATE_REVIEW_NAMES.includes(canonical))
        .map(([legacy]) => legacy),
]);
export const REQUIRED_GATE_SECTIONS_BY_SURFACE = {
    lazycodex: ["manualQa", "gateReview", "iteration", "criteriaCoverage"],
    "omo-senpi": ["manualQa", "gateReview", "iteration", "criteriaCoverage"],
};
export const OPTIONAL_GATE_SECTIONS_BY_SURFACE = {
    lazycodex: ["codeReview"],
    "omo-senpi": [],
};
export const GATE_SECTION_BY_ACCEPTOR = {
    lazycodex: {
        codeReview: [REVIEWER_ROLES_BY_SURFACE.lazycodex.codeReview, "main-session"],
        manualQa: [REVIEWER_ROLES_BY_SURFACE.lazycodex.manualQa, "main-session"],
        gateReview: [
            REVIEWER_ROLES_BY_SURFACE.lazycodex.gateReview,
            "category:deep-high",
            "category:deep-low",
            "category:deep",
            "category:unspecified-high",
            "category:unspecified-low",
            "main-session",
        ],
    },
    "omo-senpi": {
        manualQa: ["main-session"],
        gateReview: [
            "category:deep-high",
            "category:deep-low",
            "category:deep",
            "category:unspecified-high",
            "category:unspecified-low",
        ],
    },
};
export function reviewerRolesFor(surface) {
    return REVIEWER_ROLES_BY_SURFACE[surface];
}
export const SURFACE_MARKER_FILENAME = "surface.json";
const SURFACE_ENV_KEY = "OMO_AGENT_TOOLKIT_SURFACE";
function parseSurface(value) {
    return value === "lazycodex" || value === "omo-senpi" ? value : null;
}
// Resolution order: explicit env override (tests, doctor probes) -> staged surface.json marker
// sitting next to the running bundle -> lazycodex default. The marker is distribution-baked, so a
// malformed marker falls back to the default instead of crashing checkpoint validation; the env
// override remains available to force the intended surface on a damaged install.
export function resolveToolkitSurface(options) {
    const env = options?.env ?? process.env;
    const fromEnv = parseSurface(env[SURFACE_ENV_KEY]);
    if (fromEnv !== null)
        return fromEnv;
    const entryDir = options?.entryDir ?? dirname(fileURLToPath(import.meta.url));
    const markerPath = join(entryDir, SURFACE_MARKER_FILENAME);
    return readMarkerSurface(markerPath) ?? "lazycodex";
}
function readMarkerSurface(markerPath) {
    try {
        if (!existsSync(markerPath))
            return null;
        const parsed = JSON.parse(readFileSync(markerPath, "utf8"));
        return parseSurface(parsed["surface"]);
    }
    catch (error) {
        if (error instanceof Error)
            return null;
        throw error;
    }
}
