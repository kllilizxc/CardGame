import { getStage2TutorialSteps } from '../../data/tutorial/stage2Steps';
import type { TutorialStepDefinition } from '../../ui/battle/TutorialOverlayController';

export type TutorialStepResolutionSource = 'json' | 'encounter-fallback' | 'missing';

export interface ResolveTutorialStepDefinitionsParams {
    rawSteps: unknown;
    encounterId?: string | null;
    enrichRawSteps: (rawSteps: unknown[]) => TutorialStepDefinition[];
}

export interface ResolvedTutorialStepDefinitions {
    steps: TutorialStepDefinition[] | null;
    source: TutorialStepResolutionSource;
}

/**
 * 返回以代码维护的教程步骤作者源。
 * 当前仅阶段 2 仍以 stage2Steps.ts 作为正式发布版本的单一作者源。
 */
export function getBuiltInTutorialStepsForEncounter(
    encounterId?: string | null,
): TutorialStepDefinition[] | null {
    if (encounterId === 'tutorial_encounter_stage2') {
        return getStage2TutorialSteps();
    }

    return null;
}

/**
 * 优先使用预加载成功的 JSON 教程步骤；若 JSON 缺失，则回退到内置作者源。
 */
export function resolveTutorialStepDefinitions(
    params: ResolveTutorialStepDefinitionsParams,
): ResolvedTutorialStepDefinitions {
    if (Array.isArray(params.rawSteps)) {
        return {
            steps: params.enrichRawSteps(params.rawSteps),
            source: 'json',
        };
    }

    const fallbackSteps = getBuiltInTutorialStepsForEncounter(params.encounterId);
    if (fallbackSteps) {
        return {
            steps: fallbackSteps,
            source: 'encounter-fallback',
        };
    }

    return {
        steps: null,
        source: 'missing',
    };
}
