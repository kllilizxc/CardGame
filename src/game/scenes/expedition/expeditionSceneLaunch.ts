import type {
    ExpeditionBattleCompleteEvent,
    ExpeditionTargetConfig,
} from '../../types/expedition';
import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
    DEFAULT_EXPEDITION_TARGET_FILES,
} from '../../config/ExpeditionDefaults';
import { createActiveRunRouteKey } from '../../services/RunPersistence';

export {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
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

function normalizeString(value: string | undefined, fallback: string): string {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
}

function cloneTargetConfig(config: ExpeditionTargetConfig): ExpeditionTargetConfig {
    return {
        routeKey: config.routeKey,
        expeditionId: config.expeditionId,
        mapId: config.mapId,
        worldStateFile: config.worldStateFile,
        starterDeckFile: config.starterDeckFile,
        mapFile: config.mapFile,
        eventsFile: config.eventsFile,
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
    const targetConfig: ExpeditionTargetConfig = {
        routeKey: '',
        expeditionId: normalizeString(targetOwner.expeditionId, DEFAULT_EXPEDITION_ID),
        mapId: normalizeString(targetOwner.mapId, DEFAULT_EXPEDITION_MAP_ID),
        worldStateFile: normalizeString(targetOwner.worldStateFile, DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile),
        starterDeckFile: normalizeString(targetOwner.starterDeckFile, DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile),
        mapFile: normalizeString(targetOwner.mapFile, DEFAULT_EXPEDITION_TARGET_FILES.mapFile),
        eventsFile: normalizeString(targetOwner.eventsFile, DEFAULT_EXPEDITION_TARGET_FILES.eventsFile),
        shopFile: normalizeString(targetOwner.shopFile, DEFAULT_EXPEDITION_TARGET_FILES.shopFile),
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
