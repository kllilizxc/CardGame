export const DEFAULT_HUB_ID = 'hub.qingyun-town';
export const DEFAULT_HUB_FILE = 'data/hub/town-shell.json';

export interface HubSceneLaunchData {
    source?: 'worldMap';
    destinationId?: string;
    hubId?: string;
    hubResourceId?: string;
    hubFile?: string;
    targetLocationId?: string;
    statusText?: string;
}

export interface NormalizedHubSceneLaunchData {
    source?: 'worldMap';
    destinationId?: string;
    hubId: string;
    hubResourceId?: string;
    hubFile: string;
    hubCacheKey: string;
    targetLocationId?: string;
    statusText?: string;
}

function normalizeString(value: string | undefined, fallback: string): string {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : fallback;
}

export function createHubTownCacheKey(hubFile: string): string {
    return `hubTownShell:${hubFile}`;
}

export function normalizeHubSceneLaunchData(data?: HubSceneLaunchData | null): NormalizedHubSceneLaunchData {
    const hubFile = normalizeString(data?.hubFile, DEFAULT_HUB_FILE);
    const source = data?.source === 'worldMap' ? data.source : undefined;
    const destinationId = normalizeString(data?.destinationId, '');
    const hubResourceId = normalizeString(data?.hubResourceId, '');
    const targetLocationId = normalizeString(data?.targetLocationId, '');
    const statusText = normalizeString(data?.statusText, '');

    return {
        ...(source ? { source } : {}),
        ...(destinationId ? { destinationId } : {}),
        hubId: normalizeString(data?.hubId, DEFAULT_HUB_ID),
        ...(hubResourceId ? { hubResourceId } : {}),
        hubFile,
        hubCacheKey: createHubTownCacheKey(hubFile),
        ...(targetLocationId ? { targetLocationId } : {}),
        ...(statusText ? { statusText } : {}),
    };
}
