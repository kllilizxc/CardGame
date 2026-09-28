import { describe, expect, it } from 'bun:test';

import catalog from '../../../public/data/content-catalog.json';
import sectGate from '../../../public/data/hub/qingyun-sect-gate.json';
import { normalizeHubSceneLaunchData } from '../scenes/hub/hubSceneLaunch';
import { findHubStartStoryAction, validateHubTownDefinition } from '../scenes/hub/hubTown';
import { resolvePreviewHubActionLaunch } from './PreviewEntry';

const previewUrl = (extra: Record<string, string> = {}) => `?${new URLSearchParams({
    workaProject: 'cardgame',
    workaCandidate: 'main-latest',
    workaCommit: 'a'.repeat(40),
    workaProfile: 'default',
    workaHub: 'hub.qingyun-sect-gate',
    workaAction: 'action.qa-fog-fox',
    workaStory: 'story.qa-fog-fox',
    ...extra,
})}`;

describe('preview entry', () => {
    it('resolves a catalog Hub and its actual story action for a committed preview', () => {
        const launch = resolvePreviewHubActionLaunch(previewUrl(), catalog);
        expect(launch).toEqual({
            hubId: 'hub.qingyun-sect-gate',
            hubResourceId: 'hub.qingyun-sect-gate',
            hubFile: 'data/hub/qingyun-sect-gate.json',
            startActionId: 'action.qa-fog-fox',
            startStoryResourceId: 'story.qa-fog-fox',
        });
        expect(normalizeHubSceneLaunchData(launch).startActionId).toBe('action.qa-fog-fox');

        const hub = validateHubTownDefinition(sectGate);
        const match = findHubStartStoryAction(hub, 'action.qa-fog-fox', 'story.qa-fog-fox');
        expect(match?.location.id).toBe('location.qingyun-sect-gate.archway');
        expect(match?.action.storyGraphFile).toBe('data/story/qa-fog-fox.json');
        expect(findHubStartStoryAction(hub, 'action.qa-fog-fox', 'story.qingyun-entry')).toBeNull();
    });

    it('keeps the normal menu for links without a valid exact preview destination', () => {
        expect(resolvePreviewHubActionLaunch('', catalog)).toBeNull();
        expect(resolvePreviewHubActionLaunch(previewUrl({ workaCommit: 'dev' }), catalog)).toBeNull();
        expect(resolvePreviewHubActionLaunch(previewUrl({ workaHub: 'hub.missing' }), catalog)).toBeNull();
        expect(resolvePreviewHubActionLaunch(previewUrl({ workaAction: '../other' }), catalog)).toBeNull();
    });
});
