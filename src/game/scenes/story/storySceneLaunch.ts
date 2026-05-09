import type { StoryBattleCompleteEvent, StoryHubSessionKey, StoryState } from '../../types/story';

export const DEFAULT_STORY_GRAPH_FILE = 'data/story/story-graph.json';

export interface StorySceneHubLaunchData {
    source: 'hub';
    hubId: string;
    actionId: string;
    storyGraphFile: string;
    storyState?: StoryState;
    selectedChoiceIds?: string[];
    statusText?: string;
}

export interface StorySceneLaunchData {
    source?: 'hub';
    hubId?: string;
    actionId?: string;
    storyGraphFile?: string;
    storyState?: StoryState;
    selectedChoiceIds?: string[];
    statusText?: string;
    storyBattleResult?: StoryBattleCompleteEvent;
    hubSession?: StoryHubSessionKey;
}

export interface NormalizedStorySceneLaunchData extends StorySceneLaunchData {
    storyGraphFile: string;
    storyGraphCacheKey: string;
}

export function createStoryGraphCacheKey(storyGraphFile = DEFAULT_STORY_GRAPH_FILE): string {
    const normalizedFile = storyGraphFile.trim().length > 0 ? storyGraphFile.trim() : DEFAULT_STORY_GRAPH_FILE;

    return `storyGraph:${normalizedFile}`;
}

function getLaunchStoryGraphFile(data?: StorySceneLaunchData | null): string {
    const resultGraphFile = data?.storyBattleResult?.storyGraphFile;
    const launchGraphFile = data?.storyGraphFile;
    const graphFile = resultGraphFile ?? launchGraphFile ?? DEFAULT_STORY_GRAPH_FILE;

    return graphFile.trim().length > 0 ? graphFile : DEFAULT_STORY_GRAPH_FILE;
}

function getLaunchHubSession(data: StorySceneLaunchData | undefined | null, storyGraphFile: string): StoryHubSessionKey | undefined {
    if (data?.hubSession) {
        return { ...data.hubSession };
    }

    if (data?.storyBattleResult?.hubSession) {
        return { ...data.storyBattleResult.hubSession };
    }

    if (data?.source === 'hub' && data.hubId && data.actionId) {
        return {
            hubId: data.hubId,
            actionId: data.actionId,
            storyGraphFile,
        };
    }

    return undefined;
}

export function normalizeStorySceneLaunchData(data?: StorySceneLaunchData | null): NormalizedStorySceneLaunchData {
    const storyGraphFile = getLaunchStoryGraphFile(data);
    const hubSession = getLaunchHubSession(data, storyGraphFile);

    return {
        ...(data ?? {}),
        storyGraphFile,
        storyGraphCacheKey: createStoryGraphCacheKey(storyGraphFile),
        ...(hubSession ? { hubSession } : {}),
    };
}

export function getStoryHubSessionKey(data: StorySceneLaunchData | null | undefined): StoryHubSessionKey | null {
    const normalizedData = normalizeStorySceneLaunchData(data);

    return normalizedData.hubSession ? { ...normalizedData.hubSession } : null;
}
