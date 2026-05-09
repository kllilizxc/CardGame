import type { StoryBattleCompleteEvent, StoryHubSessionKey, StoryState } from '../../types/story';
import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
} from '../../content/contentCatalog';

export const DEFAULT_STORY_GRAPH_FILE = 'data/story/story-graph.json';
export const DEFAULT_STORY_RESOURCE_ID = 'story.qingyun-entry';

export interface StorySceneHubLaunchData {
    source: 'hub';
    hubId: string;
    actionId: string;
    storyResourceId?: string;
    storyGraphFile: string;
    storyState?: StoryState;
    selectedChoiceIds?: string[];
    statusText?: string;
}

export interface StorySceneLaunchData {
    source?: 'hub';
    hubId?: string;
    actionId?: string;
    storyResourceId?: string;
    storyGraphFile?: string;
    storyState?: StoryState;
    selectedChoiceIds?: string[];
    statusText?: string;
    storyBattleResult?: StoryBattleCompleteEvent;
    hubSession?: StoryHubSessionKey;
}

export interface NormalizedStorySceneLaunchData extends StorySceneLaunchData {
    storyResourceId?: string;
    storyGraphFile: string;
    storyGraphCacheKey: string;
}

export interface ResolvedStorySceneCatalogResource {
    resourceId: string;
    publicPath: string;
    storyGraphCacheKey: string;
}

export interface LoadedStorySceneGraphIdentity {
    storyId: string;
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

function getLaunchStoryResourceId(
    data: StorySceneLaunchData | undefined | null,
    storyGraphFile: string,
): string | undefined {
    const resultResourceId = data?.storyBattleResult?.storyResourceId?.trim();
    const launchResourceId = data?.storyResourceId?.trim();
    const resourceId = resultResourceId && resultResourceId.length > 0 ? resultResourceId : launchResourceId;

    if (resourceId && resourceId.length > 0) {
        return resourceId;
    }

    return storyGraphFile === DEFAULT_STORY_GRAPH_FILE ? DEFAULT_STORY_RESOURCE_ID : undefined;
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
    const storyResourceId = getLaunchStoryResourceId(data, storyGraphFile);
    const hubSession = getLaunchHubSession(data, storyGraphFile);
    const dataWithoutStoryResourceId = { ...(data ?? {}) };
    delete dataWithoutStoryResourceId.storyResourceId;

    return {
        ...dataWithoutStoryResourceId,
        ...(storyResourceId ? { storyResourceId } : {}),
        storyGraphFile,
        storyGraphCacheKey: createStoryGraphCacheKey(storyGraphFile),
        ...(hubSession ? { hubSession } : {}),
    };
}

export function getStoryHubSessionKey(data: StorySceneLaunchData | null | undefined): StoryHubSessionKey | null {
    const normalizedData = normalizeStorySceneLaunchData(data);

    return normalizedData.hubSession ? { ...normalizedData.hubSession } : null;
}

export function resolveStorySceneCatalogResource(
    rawCatalog: unknown,
    data: NormalizedStorySceneLaunchData,
): ResolvedStorySceneCatalogResource {
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'StoryScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const storyResource = data.storyResourceId
        ? catalogResolver.resolveJsonResource({
            resourceId: data.storyResourceId,
            expectedKind: 'story',
        })
        : catalogResolver.resolveJsonResourceByPublicPath({
            publicPath: data.storyGraphFile,
            expectedKind: 'story',
        });

    if (storyResource.publicPath !== data.storyGraphFile) {
        throw new Error(
            `StoryScene catalog resource ${storyResource.resourceId} resolved to publicPath ${storyResource.publicPath}, but launch storyGraphFile is ${data.storyGraphFile}.`,
        );
    }

    return {
        resourceId: storyResource.resourceId,
        publicPath: storyResource.publicPath,
        storyGraphCacheKey: data.storyGraphCacheKey,
    };
}

export function assertStorySceneCatalogResourceMatchesLoadedGraph(
    graph: LoadedStorySceneGraphIdentity,
    resource: ResolvedStorySceneCatalogResource,
): void {
    if (graph.storyId !== resource.resourceId) {
        throw new Error(
            `StoryScene loaded catalog resource ${resource.resourceId} from public/${resource.publicPath}, but loaded Story graph declares ${graph.storyId}. Catalog story resources must declare a storyId matching their resourceId.`,
        );
    }
}
