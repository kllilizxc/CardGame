import type { StoryBattleCompleteEvent, StoryState } from '../../types/story';

export const DEFAULT_STORY_GRAPH_FILE = 'data/story/story-graph.json';

export interface StorySceneHubLaunchData {
    source: 'hub';
    hubId: string;
    actionId: string;
    storyGraphFile: string;
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

export function normalizeStorySceneLaunchData(data?: StorySceneLaunchData | null): NormalizedStorySceneLaunchData {
    const storyGraphFile = getLaunchStoryGraphFile(data);

    return {
        ...(data ?? {}),
        storyGraphFile,
        storyGraphCacheKey: createStoryGraphCacheKey(storyGraphFile),
    };
}
