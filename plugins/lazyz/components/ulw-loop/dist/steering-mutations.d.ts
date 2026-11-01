import type { UlwLoopToolkitSurface } from "./surface.js";
import type { UlwLoopItem, UlwLoopPlan, UlwLoopSteeringChildGoal, UlwLoopSteeringProposal } from "./types.js";
export declare function makeGoal(plan: UlwLoopPlan, childGoal: UlwLoopSteeringChildGoal, evidence: string, now: string, offset: number, surface?: UlwLoopToolkitSurface): UlwLoopItem;
export declare function reviseWording(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string): void;
export declare function splitOrBlock(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string, surface?: UlwLoopToolkitSurface): void;
export declare function reviseCriterion(plan: UlwLoopPlan, proposal: UlwLoopSteeringProposal, now: string): void;
