import type {
    BattleLaunchPayload,
    ExpeditionCardStack,
    ExpeditionTargetConfig,
} from '../../types/expedition';
import type {
    StoryBattleLaunchMetadata,
    StoryBattleSceneLaunchPayload,
    StoryHubSessionKey,
    StoryState,
} from '../../types/story';
import { createActiveRunRouteKey } from '../../services/RunPersistence';

export interface StarterDeckData {
    cards: ExpeditionCardStack[];
}

export interface EncounterUnitConfig {
    cardId: string;
    position?: number;
}

interface EncounterData {
    enemies?: EncounterUnitConfig[];
    units?: EncounterUnitConfig[];
}

function isRunDeck(value: unknown): value is ExpeditionCardStack[] {
    return Array.isArray(value)
        && value.every((stack) => {
            if (typeof stack !== 'object' || stack === null) {
                return false;
            }

            const candidate = stack as Partial<ExpeditionCardStack>;
            return typeof candidate.id === 'string' && typeof candidate.count === 'number';
        });
}

function isBattleLaunchPayload(value: unknown): value is BattleLaunchPayload {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<BattleLaunchPayload>;

    return typeof candidate.runId === 'string'
        && typeof candidate.nodeId === 'string'
        && (candidate.nodeType === 'battle' || candidate.nodeType === 'boss')
        && typeof candidate.encounterId === 'string'
        && (candidate.encounterResourceId === undefined || typeof candidate.encounterResourceId === 'string')
        && typeof candidate.encounterFile === 'string'
        && isRunDeck(candidate.runDeck);
}

function isExpeditionTargetConfig(value: unknown): value is ExpeditionTargetConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<ExpeditionTargetConfig>;

    return typeof candidate.expeditionId === 'string'
        && typeof candidate.mapId === 'string'
        && (candidate.routeKey === undefined || typeof candidate.routeKey === 'string')
        && (candidate.worldStateResourceId === undefined || typeof candidate.worldStateResourceId === 'string')
        && typeof candidate.worldStateFile === 'string'
        && (candidate.starterDeckResourceId === undefined || typeof candidate.starterDeckResourceId === 'string')
        && typeof candidate.starterDeckFile === 'string'
        && (candidate.mapResourceId === undefined || typeof candidate.mapResourceId === 'string')
        && typeof candidate.mapFile === 'string'
        && (candidate.eventsResourceId === undefined || typeof candidate.eventsResourceId === 'string')
        && typeof candidate.eventsFile === 'string'
        && (candidate.shopResourceId === undefined || typeof candidate.shopResourceId === 'string')
        && typeof candidate.shopFile === 'string';
}

function getExpeditionTargetRouteKey(targetConfig: ExpeditionTargetConfig): string {
    return createActiveRunRouteKey(targetConfig);
}

function cloneExpeditionTargetConfig(targetConfig: ExpeditionTargetConfig): ExpeditionTargetConfig {
    return {
        routeKey: getExpeditionTargetRouteKey(targetConfig),
        expeditionId: targetConfig.expeditionId,
        mapId: targetConfig.mapId,
        ...(targetConfig.worldStateResourceId ? { worldStateResourceId: targetConfig.worldStateResourceId } : {}),
        worldStateFile: targetConfig.worldStateFile,
        ...(targetConfig.starterDeckResourceId ? { starterDeckResourceId: targetConfig.starterDeckResourceId } : {}),
        starterDeckFile: targetConfig.starterDeckFile,
        ...(targetConfig.mapResourceId ? { mapResourceId: targetConfig.mapResourceId } : {}),
        mapFile: targetConfig.mapFile,
        ...(targetConfig.eventsResourceId ? { eventsResourceId: targetConfig.eventsResourceId } : {}),
        eventsFile: targetConfig.eventsFile,
        ...(targetConfig.shopResourceId ? { shopResourceId: targetConfig.shopResourceId } : {}),
        shopFile: targetConfig.shopFile,
    };
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Object.values(value).every((entry) => typeof entry === 'number' && !Number.isNaN(entry));
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isStoryState(value: unknown): value is StoryState {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoryState>;

    return typeof candidate.storyId === 'string'
        && typeof candidate.currentLocationId === 'string'
        && typeof candidate.currentSublocationId === 'string'
        && typeof candidate.currentNodeId === 'string'
        && isStringArray(candidate.visitedNodeIds)
        && isStringArray(candidate.triggeredDialogueIds)
        && isBooleanRecord(candidate.flags)
        && isNumberRecord(candidate.attributes)
        && isNumberRecord(candidate.relations);
}

function isStoryBattleLaunchMetadata(value: unknown): value is StoryBattleLaunchMetadata {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoryBattleLaunchMetadata>;

    return candidate.sceneKey === 'BattleScene'
        && typeof candidate.storyId === 'string'
        && typeof candidate.sourceNodeId === 'string'
        && (candidate.sourceChoiceId === undefined || typeof candidate.sourceChoiceId === 'string')
        && typeof candidate.targetNodeId === 'string'
        && typeof candidate.battleId === 'string'
        && (candidate.encounterResourceId === undefined || typeof candidate.encounterResourceId === 'string')
        && typeof candidate.encounterId === 'string'
        && typeof candidate.encounterFile === 'string'
        && (candidate.deckResourceId === undefined || typeof candidate.deckResourceId === 'string')
        && typeof candidate.deckFile === 'string'
        && typeof candidate.onVictoryNodeId === 'string'
        && typeof candidate.onDefeatNodeId === 'string'
        && (candidate.launchText === undefined || typeof candidate.launchText === 'string');
}

function isStoryHubSessionKey(value: unknown): value is StoryHubSessionKey {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoryHubSessionKey>;

    return typeof candidate.hubId === 'string'
        && typeof candidate.actionId === 'string'
        && typeof candidate.storyGraphFile === 'string';
}

function isStoryBattleSceneLaunchPayload(value: unknown): value is StoryBattleSceneLaunchPayload {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoryBattleSceneLaunchPayload>;

    return candidate.source === 'story'
        && (candidate.storyResourceId === undefined || typeof candidate.storyResourceId === 'string')
        && isStoryBattleLaunchMetadata(candidate.battleLaunch)
        && isStoryState(candidate.storyState)
        && isStringArray(candidate.selectedChoiceIds)
        && (candidate.storyGraphFile === undefined || typeof candidate.storyGraphFile === 'string')
        && (candidate.hubSession === undefined || isStoryHubSessionKey(candidate.hubSession));
}

function cloneStoryState(state: StoryState): StoryState {
    return {
        ...state,
        visitedNodeIds: [...state.visitedNodeIds],
        triggeredDialogueIds: [...state.triggeredDialogueIds],
        flags: { ...state.flags },
        attributes: { ...state.attributes },
        relations: { ...state.relations },
    };
}

export function normalizeBattleLaunchPayload(data: unknown): BattleLaunchPayload | null {
    if (!isBattleLaunchPayload(data)) {
        return null;
    }
    const targetConfig = isExpeditionTargetConfig(data.targetConfig)
        ? cloneExpeditionTargetConfig(data.targetConfig)
        : undefined;

    return {
        runId: data.runId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        encounterId: data.encounterId,
        ...(data.encounterResourceId ? { encounterResourceId: data.encounterResourceId } : {}),
        encounterFile: data.encounterFile,
        runDeck: data.runDeck.map((stack) => ({ ...stack })),
        ...(data.rewardPreview ? { rewardPreview: data.rewardPreview } : {}),
        ...(targetConfig ? { targetConfig } : {}),
    };
}

export function normalizeStoryBattleLaunchPayload(data: unknown): StoryBattleSceneLaunchPayload | null {
    if (!isStoryBattleSceneLaunchPayload(data)) {
        return null;
    }

    return {
        source: 'story',
        ...(data.storyResourceId ? { storyResourceId: data.storyResourceId } : {}),
        battleLaunch: { ...data.battleLaunch },
        storyState: cloneStoryState(data.storyState),
        selectedChoiceIds: [...data.selectedChoiceIds],
        ...(data.storyGraphFile ? { storyGraphFile: data.storyGraphFile } : {}),
        ...(data.hubSession ? { hubSession: { ...data.hubSession } } : {}),
    };
}

export function getBattleDeckStacks(
    payload: BattleLaunchPayload | null,
    starterDeck: StarterDeckData,
): ExpeditionCardStack[] {
    return (payload?.runDeck ?? starterDeck.cards).map((stack) => ({ ...stack }));
}

export function getEncounterCacheKey(
    payload: BattleLaunchPayload | null,
    storyPayload: StoryBattleSceneLaunchPayload | null = null,
): string {
    if (storyPayload) {
        return `storyEncounter:${storyPayload.battleLaunch.storyId}:${storyPayload.battleLaunch.battleId}`;
    }

    if (!payload) {
        return 'currentEncounter';
    }

    return `expeditionEncounter:${payload.runId}:${payload.nodeId}`;
}

export function getEncounterFile(
    payload: BattleLaunchPayload | null,
    storyPayload: StoryBattleSceneLaunchPayload | null = null,
): string {
    if (storyPayload) {
        return storyPayload.battleLaunch.encounterFile;
    }

    return payload?.encounterFile ?? 'data/encounters/medium-enemy.json';
}

export function getBattleDeckCacheKey(storyPayload: StoryBattleSceneLaunchPayload | null = null): string {
    if (storyPayload) {
        return `storyDeck:${storyPayload.battleLaunch.storyId}:${storyPayload.battleLaunch.battleId}`;
    }

    return 'starterDeck';
}

export function getBattleDeckFile(storyPayload: StoryBattleSceneLaunchPayload | null = null): string {
    return storyPayload?.battleLaunch.deckFile ?? 'data/decks/starter-deck.json';
}

export function getEncounterUnits(encounterData: EncounterData | null | undefined): EncounterUnitConfig[] {
    return encounterData?.enemies ?? encounterData?.units ?? [];
}
