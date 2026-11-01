import type { UlwLoopToolkitSurface } from "./surface.js";
import type { UlwLoopPlan } from "./types.js";
/**
 * Status is the one call every agent already makes between steps, so it is
 * also the cheapest place to answer "what now?" without a second round trip.
 */
export declare function statusNextActions(plan: UlwLoopPlan, surface?: UlwLoopToolkitSurface): readonly string[];
