import type {
    ExpeditionBattleCompleteEvent,
    ExpeditionTargetConfig,
} from '../../types/expedition';
import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
    type ContentCatalogResolver,
    type ContentResourceKind,
} from '../../content/contentCatalog';
import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
    DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS,
    DEFAULT_EXPEDITION_TARGET_FILES,
} from '../../config/ExpeditionDefaults';
import { createActiveRunRouteKey } from '../../services/RunPersistence';

export {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
    DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS,
    DEFAULT_EXPEDITION_TARGET_FILES,
} from '../../config/ExpeditionDefaults';

export interface ExpeditionSceneLaunchData extends Partial<ExpeditionTargetConfig> {
    source?: 'worldMap';
    destinationId?: string;
    statusText?: string;
    battleResult?: ExpeditionBattleCompleteEvent;
}

export interface ExpeditionSceneCacheKeys {
    worldState: string;
    starterDeck: string;
    map: string;
    events: string;
    shop: string;
}

export interface NormalizedExpeditionSceneLaunchData extends ExpeditionTargetConfig {
    source?: 'worldMap';
    destinationId?: string;
    statusText?: string;
    battleResult?: ExpeditionBattleCompleteEvent;
    cacheKeys: ExpeditionSceneCacheKeys;
}

export interface ResolvedExpeditionSceneCatalogResource {
    resourceId: string;
    publicPath: string;
    cacheKey: string;
}

export interface ResolvedExpeditionSceneCatalogResources {
    worldState: ResolvedExpeditionSceneCatalogResource;
    starterDeck: ResolvedExpeditionSceneCatalogResource;
    map: ResolvedExpeditionSceneCatalogResource;
    events: ResolvedExpeditionSceneCatalogResource;
    shop: ResolvedExpeditionSceneCatalogResource;
}

function normalizeString(value: string | undefined, fallback: string): string {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeResourceIdForFile(
    value: string | undefined,
    file: string,
    defaultFile: string,
    defaultResourceId: string,
): string {
    const resourceId = normalizeString(value, '');

    if (resourceId) {
        return resourceId;
    }

    return file === defaultFile ? defaultResourceId : '';
}

function cloneTargetConfig(config: ExpeditionTargetConfig): ExpeditionTargetConfig {
    return {
        routeKey: config.routeKey,
        expeditionId: config.expeditionId,
        mapId: config.mapId,
        ...(config.worldStateResourceId ? { worldStateResourceId: config.worldStateResourceId } : {}),
        worldStateFile: config.worldStateFile,
        ...(config.starterDeckResourceId ? { starterDeckResourceId: config.starterDeckResourceId } : {}),
        starterDeckFile: config.starterDeckFile,
        ...(config.mapResourceId ? { mapResourceId: config.mapResourceId } : {}),
        mapFile: config.mapFile,
        ...(config.eventsResourceId ? { eventsResourceId: config.eventsResourceId } : {}),
        eventsFile: config.eventsFile,
        ...(config.shopResourceId ? { shopResourceId: config.shopResourceId } : {}),
        shopFile: config.shopFile,
    };
}

export function createExpeditionCacheKeys(targetFiles: Pick<
    ExpeditionTargetConfig,
    'worldStateFile' | 'starterDeckFile' | 'mapFile' | 'eventsFile' | 'shopFile'
>): ExpeditionSceneCacheKeys {
    return {
        worldState: `expeditionInitialState:${targetFiles.worldStateFile}`,
        starterDeck: `expeditionStarterDeck:${targetFiles.starterDeckFile}`,
        map: `expeditionPrototypeMap:${targetFiles.mapFile}`,
        events: `expeditionPrototypeEvents:${targetFiles.eventsFile}`,
        shop: `expeditionPrototypeShop:${targetFiles.shopFile}`,
    };
}

export function createExpeditionTargetConfig(
    launchData: ExpeditionTargetConfig,
): ExpeditionTargetConfig {
    return cloneTargetConfig(launchData);
}

export function normalizeExpeditionSceneLaunchData(
    data?: ExpeditionSceneLaunchData | null,
): NormalizedExpeditionSceneLaunchData {
    const targetOwner = (data?.battleResult?.targetConfig ?? data ?? {}) as Partial<ExpeditionTargetConfig>;
    const source = data?.source === 'worldMap' ? data.source : undefined;
    const destinationId = normalizeString(data?.destinationId, '');
    const worldStateFile = normalizeString(targetOwner.worldStateFile, DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile);
    const starterDeckFile = normalizeString(targetOwner.starterDeckFile, DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile);
    const mapFile = normalizeString(targetOwner.mapFile, DEFAULT_EXPEDITION_TARGET_FILES.mapFile);
    const eventsFile = normalizeString(targetOwner.eventsFile, DEFAULT_EXPEDITION_TARGET_FILES.eventsFile);
    const shopFile = normalizeString(targetOwner.shopFile, DEFAULT_EXPEDITION_TARGET_FILES.shopFile);
    const worldStateResourceId = normalizeResourceIdForFile(
        targetOwner.worldStateResourceId,
        worldStateFile,
        DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile,
        DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.worldStateResourceId,
    );
    const starterDeckResourceId = normalizeResourceIdForFile(
        targetOwner.starterDeckResourceId,
        starterDeckFile,
        DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile,
        DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.starterDeckResourceId,
    );
    const mapResourceId = normalizeResourceIdForFile(
        targetOwner.mapResourceId,
        mapFile,
        DEFAULT_EXPEDITION_TARGET_FILES.mapFile,
        DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.mapResourceId,
    );
    const eventsResourceId = normalizeResourceIdForFile(
        targetOwner.eventsResourceId,
        eventsFile,
        DEFAULT_EXPEDITION_TARGET_FILES.eventsFile,
        DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.eventsResourceId,
    );
    const shopResourceId = normalizeResourceIdForFile(
        targetOwner.shopResourceId,
        shopFile,
        DEFAULT_EXPEDITION_TARGET_FILES.shopFile,
        DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.shopResourceId,
    );
    const targetConfig: ExpeditionTargetConfig = {
        routeKey: '',
        expeditionId: normalizeString(targetOwner.expeditionId, DEFAULT_EXPEDITION_ID),
        mapId: normalizeString(targetOwner.mapId, DEFAULT_EXPEDITION_MAP_ID),
        ...(worldStateResourceId ? { worldStateResourceId } : {}),
        worldStateFile,
        ...(starterDeckResourceId ? { starterDeckResourceId } : {}),
        starterDeckFile,
        ...(mapResourceId ? { mapResourceId } : {}),
        mapFile,
        ...(eventsResourceId ? { eventsResourceId } : {}),
        eventsFile,
        ...(shopResourceId ? { shopResourceId } : {}),
        shopFile,
    };
    targetConfig.routeKey = createActiveRunRouteKey(targetConfig);
    const statusText = normalizeString(data?.statusText, '');

    return {
        ...(source ? { source } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...targetConfig,
        cacheKeys: createExpeditionCacheKeys(targetConfig),
        ...(statusText ? { statusText } : {}),
        ...(data?.battleResult ? { battleResult: data.battleResult } : {}),
    };
}

function resolveExpeditionCatalogResource(
    catalogResolver: ContentCatalogResolver,
    target: {
        resourceId?: string;
        resourceIdField: 'worldStateResourceId' | 'starterDeckResourceId' | 'mapResourceId' | 'eventsResourceId' | 'shopResourceId';
        file: string;
        fileField: 'worldStateFile' | 'starterDeckFile' | 'mapFile' | 'eventsFile' | 'shopFile';
        expectedKind: ContentResourceKind;
        cacheKey: string;
    },
): ResolvedExpeditionSceneCatalogResource {
    const resource = target.resourceId
        ? catalogResolver.resolveJsonResource({
            resourceId: target.resourceId,
            expectedKind: target.expectedKind,
        })
        : catalogResolver.resolveJsonResourceByPublicPath({
            publicPath: target.file,
            expectedKind: target.expectedKind,
        });

    if (resource.publicPath !== target.file) {
        throw new Error(
            `ExpeditionScene ${target.resourceIdField} ${resource.resourceId} resolved to catalog publicPath ${resource.publicPath}, but launch ${target.fileField} is ${target.file}.`,
        );
    }

    return {
        resourceId: resource.resourceId,
        publicPath: resource.publicPath,
        cacheKey: target.cacheKey,
    };
}

export function resolveExpeditionSceneCatalogResources(
    rawCatalog: unknown,
    data: NormalizedExpeditionSceneLaunchData,
): ResolvedExpeditionSceneCatalogResources {
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'ExpeditionScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });

    return {
        worldState: resolveExpeditionCatalogResource(catalogResolver, {
            resourceId: data.worldStateResourceId,
            resourceIdField: 'worldStateResourceId',
            file: data.worldStateFile,
            fileField: 'worldStateFile',
            expectedKind: 'worldSeed',
            cacheKey: data.cacheKeys.worldState,
        }),
        starterDeck: resolveExpeditionCatalogResource(catalogResolver, {
            resourceId: data.starterDeckResourceId,
            resourceIdField: 'starterDeckResourceId',
            file: data.starterDeckFile,
            fileField: 'starterDeckFile',
            expectedKind: 'deck',
            cacheKey: data.cacheKeys.starterDeck,
        }),
        map: resolveExpeditionCatalogResource(catalogResolver, {
            resourceId: data.mapResourceId,
            resourceIdField: 'mapResourceId',
            file: data.mapFile,
            fileField: 'mapFile',
            expectedKind: 'expeditionMap',
            cacheKey: data.cacheKeys.map,
        }),
        events: resolveExpeditionCatalogResource(catalogResolver, {
            resourceId: data.eventsResourceId,
            resourceIdField: 'eventsResourceId',
            file: data.eventsFile,
            fileField: 'eventsFile',
            expectedKind: 'expeditionEvents',
            cacheKey: data.cacheKeys.events,
        }),
        shop: resolveExpeditionCatalogResource(catalogResolver, {
            resourceId: data.shopResourceId,
            resourceIdField: 'shopResourceId',
            file: data.shopFile,
            fileField: 'shopFile',
            expectedKind: 'expeditionShop',
            cacheKey: data.cacheKeys.shop,
        }),
    };
}
