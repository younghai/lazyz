import { type UlwLoopScope } from "./paths.js";
import { type UlwLoopToolkitSurface } from "./surface.js";
export interface CheckpointTemplate {
    readonly qualityGateTemplate: Record<string, unknown>;
    readonly codexGoalTemplate: Record<string, unknown>;
    readonly attemptDir?: string;
    readonly guidance?: string;
}
export interface CheckpointTemplateDependencies {
    readonly surface?: UlwLoopToolkitSurface;
}
export declare function checkpointTemplate(repoRoot: string, scope?: UlwLoopScope, goalId?: string, dependencies?: CheckpointTemplateDependencies): Promise<CheckpointTemplate>;
