import { describe, expect, it } from 'bun:test';

import { getStage2TutorialSteps } from '../../data/tutorial/stage2Steps';
import {
    getBuiltInTutorialStepsForEncounter,
    resolveTutorialStepDefinitions,
} from './tutorialStepRuntime';

describe('getBuiltInTutorialStepsForEncounter', () => {
    it('returns the authored stage2 steps for the stage2 tutorial encounter', () => {
        const steps = getBuiltInTutorialStepsForEncounter('tutorial_encounter_stage2');

        expect(steps).toBe(getStage2TutorialSteps());

        const talismanStep = steps?.find((step) => step.id === 'stage2_use_talisman');
        expect(talismanStep?.allowedActions).toEqual(['use_skill', 'end_turn']);
        expect(talismanStep?.completionCheck?.('use_skill')).toBe(true);
        expect(talismanStep?.completionCheck?.('end_turn')).toBe(true);
        expect(talismanStep?.completionCheck?.('card_played')).toBe(false);
    });
});

describe('resolveTutorialStepDefinitions', () => {
    it('falls back to the built-in encounter steps when tutorial JSON is missing', () => {
        let enrichCalls = 0;

        const result = resolveTutorialStepDefinitions({
            rawSteps: undefined,
            encounterId: 'tutorial_encounter_stage2',
            enrichRawSteps: () => {
                enrichCalls += 1;
                return [];
            },
        });

        expect(result.source).toBe('encounter-fallback');
        expect(result.steps).toBe(getStage2TutorialSteps());
        expect(enrichCalls).toBe(0);
    });

    it('prefers cached JSON tutorial steps when they are available', () => {
        const rawSteps = [{ id: 'json-step' }];
        const enrichedSteps = [
            {
                id: 'enriched-step',
                guideText: 'json step',
                highlightZones: [],
                textPosition: 'top' as const,
            },
        ];

        const result = resolveTutorialStepDefinitions({
            rawSteps,
            encounterId: 'tutorial_encounter_stage2',
            enrichRawSteps: (input) => {
                expect(input).toBe(rawSteps);
                return enrichedSteps;
            },
        });

        expect(result).toEqual({
            steps: enrichedSteps,
            source: 'json',
        });
    });
});
