import type {
    BattleLaunchPayload,
    ExpeditionCardStack,
    ExpeditionTargetConfig,
} from '../../types/expedition';
import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
    type ContentResourceKind,
} from '../../content/contentCatalog';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import type { SkillCard } from '@data/types/cards/skill';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { UnitCard } from '@data/types/cards/unit';
import type { Gongfa } from '@data/types/gongfa';
import type {
    StoryBattleLaunchMetadata,
    StoryBattleSceneLaunchPayload,
    StoryHubSessionKey,
    StoryState,
} from '../../types/story';
import { createActiveRunRouteKey } from '../../services/RunPersistence';

export const DEFAULT_BATTLE_ENCOUNTER_RESOURCE_ID = 'test_encounter_02';
export const DEFAULT_BATTLE_ENCOUNTER_FILE = 'data/encounters/medium-enemy.json';
export const DEFAULT_BATTLE_DECK_RESOURCE_ID = 'deck.starter';
export const DEFAULT_BATTLE_DECK_FILE = 'data/decks/starter-deck.json';
export const BATTLE_STATUS_DEFINITIONS_CACHE_KEY = 'statusDefinitions';
export const BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY = 'combatBaselineConfig';
export const BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY = 'artifactGradeConfig';

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

export interface StoryBattleRuntimeResources {
    encounterResourceId: string;
    encounterFile: string;
    deckResourceId: string;
    deckFile: string;
}

export interface ExpeditionBattleRuntimeResources {
    encounterResourceId: string;
    encounterFile: string;
}

export interface DefaultBattleRuntimeResources {
    encounterResourceId: string;
    encounterFile: string;
    deckResourceId: string;
    deckFile: string;
}

export type BattleRequiredSharedRuntimeResourceCacheKey =
    | 'unitCards'
    | 'artifactCards'
    | 'talismanCards'
    | 'pillCards'
    | 'fieldCards'
    | 'skillCards'
    | 'gongfaList'
    | typeof BATTLE_STATUS_DEFINITIONS_CACHE_KEY;

export type BattleOptionalSharedRuntimeResourceCacheKey =
    | typeof BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY
    | typeof BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY;

export type BattleSharedRuntimeResourceCacheKey =
    | BattleRequiredSharedRuntimeResourceCacheKey
    | BattleOptionalSharedRuntimeResourceCacheKey;

export interface BattleSharedRuntimeResource {
    cacheKey: BattleSharedRuntimeResourceCacheKey;
    resourceId: string;
    publicPath: string;
}

export type BattleSharedRuntimeResources =
    & Record<BattleRequiredSharedRuntimeResourceCacheKey, BattleSharedRuntimeResource>
    & Partial<Record<BattleOptionalSharedRuntimeResourceCacheKey, BattleSharedRuntimeResource>>;

export interface BattleSharedUnitCardsData {
    readonly units: readonly UnitCard[];
}

export interface BattleSharedArtifactCardsData {
    readonly artifacts: readonly ArtifactCard[];
}

export interface BattleSharedTalismanCardsData {
    readonly talismans: readonly TalismanCard[];
}

export interface BattleSharedPillCardsData {
    readonly pills: readonly PillCard[];
}

export interface BattleSharedFieldCardsData {
    readonly fields: readonly FieldCard[];
}

export interface BattleSharedSkillCardsData {
    readonly skills: readonly SkillCard[];
}

export interface BattleSharedGongfaListData {
    readonly gongfa: readonly Gongfa[];
}

interface BattleSharedRuntimeResourceRequest {
    cacheKey: BattleSharedRuntimeResourceCacheKey;
    resourceId: string;
    expectedKind: Extract<ContentResourceKind, 'card' | 'gongfa' | 'status' | 'config'>;
    compatibilityPublicPath: string;
}

const BATTLE_SHARED_RUNTIME_RESOURCE_REQUESTS: BattleSharedRuntimeResourceRequest[] = [
    {
        cacheKey: 'unitCards',
        resourceId: 'cards.units',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/units.json',
    },
    {
        cacheKey: 'artifactCards',
        resourceId: 'cards.artifacts',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/artifacts.json',
    },
    {
        cacheKey: 'talismanCards',
        resourceId: 'cards.talismans',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/talismans.json',
    },
    {
        cacheKey: 'pillCards',
        resourceId: 'cards.pills',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/pills.json',
    },
    {
        cacheKey: 'fieldCards',
        resourceId: 'cards.fields',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/fields.json',
    },
    {
        cacheKey: 'skillCards',
        resourceId: 'cards.skills',
        expectedKind: 'card',
        compatibilityPublicPath: 'data/cards/skills.json',
    },
    {
        cacheKey: 'gongfaList',
        resourceId: 'gongfa.list',
        expectedKind: 'gongfa',
        compatibilityPublicPath: 'data/gongfa/gongfa-list.json',
    },
    {
        cacheKey: BATTLE_STATUS_DEFINITIONS_CACHE_KEY,
        resourceId: 'status.definitions',
        expectedKind: 'status',
        compatibilityPublicPath: 'data/config/status-definitions.json',
    },
];

const BATTLE_OPTIONAL_SHARED_RUNTIME_CONFIG_REQUESTS: BattleSharedRuntimeResourceRequest[] = [
    {
        cacheKey: BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY,
        resourceId: 'config.combat-baseline',
        expectedKind: 'config',
        compatibilityPublicPath: 'data/config/combat-baseline.json',
    },
    {
        cacheKey: BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY,
        resourceId: 'config.artifact-grade',
        expectedKind: 'config',
        compatibilityPublicPath: 'data/config/artifact-grade.json',
    },
];

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
    storyRuntimeResources: StoryBattleRuntimeResources | null = null,
    expeditionRuntimeResources: ExpeditionBattleRuntimeResources | null = null,
    defaultRuntimeResources: DefaultBattleRuntimeResources | null = null,
): string {
    if (storyPayload) {
        return storyRuntimeResources?.encounterFile ?? storyPayload.battleLaunch.encounterFile;
    }

    if (expeditionRuntimeResources) {
        return expeditionRuntimeResources.encounterFile;
    }

    return payload?.encounterFile ?? defaultRuntimeResources?.encounterFile ?? DEFAULT_BATTLE_ENCOUNTER_FILE;
}

export function getBattleDeckCacheKey(storyPayload: StoryBattleSceneLaunchPayload | null = null): string {
    if (storyPayload) {
        return `storyDeck:${storyPayload.battleLaunch.storyId}:${storyPayload.battleLaunch.battleId}`;
    }

    return 'starterDeck';
}

export function getBattleDeckFile(
    storyPayload: StoryBattleSceneLaunchPayload | null = null,
    storyRuntimeResources: StoryBattleRuntimeResources | null = null,
    defaultRuntimeResources: DefaultBattleRuntimeResources | null = null,
): string {
    return storyRuntimeResources?.deckFile
        ?? storyPayload?.battleLaunch.deckFile
        ?? defaultRuntimeResources?.deckFile
        ?? DEFAULT_BATTLE_DECK_FILE;
}

export function getEncounterUnits(encounterData: EncounterData | null | undefined): EncounterUnitConfig[] {
    return encounterData?.enemies ?? encounterData?.units ?? [];
}

function requireStoryBattleResourceId(
    value: string | undefined,
    fieldName: 'encounterResourceId' | 'deckResourceId',
    battleId: string,
): string {
    if (!value || value.trim().length === 0) {
        throw new Error(
            `BattleScene Story battle ${battleId} requires battleLaunch.${fieldName} so runtime JSON loads resolve through the content catalog; the file field remains only a compatibility alias.`,
        );
    }

    return value;
}

function assertCatalogPathMatchesCompatibilityAlias(
    battleId: string,
    resourceFieldName: 'encounterResourceId' | 'deckResourceId',
    resourceId: string,
    catalogPublicPath: string,
    fileFieldName: 'encounterFile' | 'deckFile',
    compatibilityFile: string,
): void {
    if (catalogPublicPath === compatibilityFile) {
        return;
    }

    throw new Error(
        `BattleScene Story battle ${battleId} ${resourceFieldName} ${resourceId} resolved to catalog publicPath ${catalogPublicPath}, but battleLaunch.${fileFieldName} is ${compatibilityFile}.`,
    );
}

function assertDefaultCatalogPathMatchesCompatibilityAlias(
    resourceFieldName: 'encounterResourceId' | 'deckResourceId',
    resourceId: string,
    catalogPublicPath: string,
    fileFieldName: 'encounterFile' | 'deckFile',
    defaultFile: string,
): void {
    if (catalogPublicPath === defaultFile) {
        return;
    }

    throw new Error(
        `BattleScene direct/default ${resourceFieldName} ${resourceId} resolved to catalog publicPath ${catalogPublicPath}, but default ${fileFieldName} is ${defaultFile}.`,
    );
}

function assertSharedCatalogPathPreservesCacheKey(
    request: BattleSharedRuntimeResourceRequest,
    catalogPublicPath: string,
): void {
    if (catalogPublicPath === request.compatibilityPublicPath) {
        return;
    }

    throw new Error(
        `BattleScene shared runtime resource ${request.resourceId} resolved to catalog publicPath ${catalogPublicPath}, but cache key ${request.cacheKey} must continue loading ${request.compatibilityPublicPath}.`,
    );
}

function rawCatalogHasResourceId(rawCatalog: unknown, resourceId: string): boolean {
    if (typeof rawCatalog !== 'object' || rawCatalog === null) {
        return false;
    }

    const resources = (rawCatalog as { resources?: unknown }).resources;

    if (!Array.isArray(resources)) {
        return false;
    }

    return resources.some((entry) => (
        typeof entry === 'object'
        && entry !== null
        && (entry as { resourceId?: unknown }).resourceId === resourceId
    ));
}

export function resolveBattleSharedRuntimeResources(rawCatalog: unknown): BattleSharedRuntimeResources {
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'BattleScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const resources: Partial<BattleSharedRuntimeResources> = {};

    for (const request of BATTLE_SHARED_RUNTIME_RESOURCE_REQUESTS) {
        const catalogResource = catalogResolver.resolveJsonResource({
            resourceId: request.resourceId,
            expectedKind: request.expectedKind,
        });

        assertSharedCatalogPathPreservesCacheKey(request, catalogResource.publicPath);

        resources[request.cacheKey] = {
            cacheKey: request.cacheKey,
            resourceId: request.resourceId,
            publicPath: catalogResource.publicPath,
        };
    }

    for (const request of BATTLE_OPTIONAL_SHARED_RUNTIME_CONFIG_REQUESTS) {
        if (!rawCatalogHasResourceId(rawCatalog, request.resourceId)) {
            continue;
        }

        const catalogResource = catalogResolver.resolveJsonResource({
            resourceId: request.resourceId,
            expectedKind: request.expectedKind,
        });

        assertSharedCatalogPathPreservesCacheKey(request, catalogResource.publicPath);

        resources[request.cacheKey] = {
            cacheKey: request.cacheKey,
            resourceId: request.resourceId,
            publicPath: catalogResource.publicPath,
        };
    }

    return resources as BattleSharedRuntimeResources;
}

export function resolveDefaultBattleRuntimeResources(
    rawCatalog: unknown,
    payload: BattleLaunchPayload | null,
    storyPayload: StoryBattleSceneLaunchPayload | null,
): DefaultBattleRuntimeResources | null {
    if (payload || storyPayload) {
        return null;
    }

    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'BattleScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const encounterResource = catalogResolver.resolveJsonResource({
        resourceId: DEFAULT_BATTLE_ENCOUNTER_RESOURCE_ID,
        expectedKind: 'encounter',
    });
    const deckResource = catalogResolver.resolveJsonResource({
        resourceId: DEFAULT_BATTLE_DECK_RESOURCE_ID,
        expectedKind: 'deck',
    });

    assertDefaultCatalogPathMatchesCompatibilityAlias(
        'encounterResourceId',
        DEFAULT_BATTLE_ENCOUNTER_RESOURCE_ID,
        encounterResource.publicPath,
        'encounterFile',
        DEFAULT_BATTLE_ENCOUNTER_FILE,
    );
    assertDefaultCatalogPathMatchesCompatibilityAlias(
        'deckResourceId',
        DEFAULT_BATTLE_DECK_RESOURCE_ID,
        deckResource.publicPath,
        'deckFile',
        DEFAULT_BATTLE_DECK_FILE,
    );

    return {
        encounterResourceId: DEFAULT_BATTLE_ENCOUNTER_RESOURCE_ID,
        encounterFile: encounterResource.publicPath,
        deckResourceId: DEFAULT_BATTLE_DECK_RESOURCE_ID,
        deckFile: deckResource.publicPath,
    };
}

export function resolveStoryBattleRuntimeResources(
    rawCatalog: unknown,
    storyPayload: StoryBattleSceneLaunchPayload | null,
): StoryBattleRuntimeResources | null {
    if (!storyPayload) {
        return null;
    }

    const { battleLaunch } = storyPayload;
    const encounterResourceId = requireStoryBattleResourceId(
        battleLaunch.encounterResourceId,
        'encounterResourceId',
        battleLaunch.battleId,
    );
    const deckResourceId = requireStoryBattleResourceId(
        battleLaunch.deckResourceId,
        'deckResourceId',
        battleLaunch.battleId,
    );
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'BattleScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const encounterResource = catalogResolver.resolveJsonResource({
        resourceId: encounterResourceId,
        expectedKind: 'encounter',
    });
    const deckResource = catalogResolver.resolveJsonResource({
        resourceId: deckResourceId,
        expectedKind: 'deck',
    });

    assertCatalogPathMatchesCompatibilityAlias(
        battleLaunch.battleId,
        'encounterResourceId',
        encounterResourceId,
        encounterResource.publicPath,
        'encounterFile',
        battleLaunch.encounterFile,
    );
    assertCatalogPathMatchesCompatibilityAlias(
        battleLaunch.battleId,
        'deckResourceId',
        deckResourceId,
        deckResource.publicPath,
        'deckFile',
        battleLaunch.deckFile,
    );

    return {
        encounterResourceId,
        encounterFile: encounterResource.publicPath,
        deckResourceId,
        deckFile: deckResource.publicPath,
    };
}

export function resolveExpeditionBattleRuntimeResources(
    rawCatalog: unknown,
    payload: BattleLaunchPayload | null,
): ExpeditionBattleRuntimeResources | null {
    if (!payload?.encounterResourceId) {
        return null;
    }

    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'BattleScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const encounterResource = catalogResolver.resolveJsonResource({
        resourceId: payload.encounterResourceId,
        expectedKind: 'encounter',
    });

    if (encounterResource.publicPath !== payload.encounterFile) {
        throw new Error(
            `BattleScene Expedition battle ${payload.runId}/${payload.nodeId} encounterResourceId ${payload.encounterResourceId} resolved to catalog publicPath ${encounterResource.publicPath}, but launch encounterFile is ${payload.encounterFile}.`,
        );
    }

    return {
        encounterResourceId: payload.encounterResourceId,
        encounterFile: encounterResource.publicPath,
    };
}
