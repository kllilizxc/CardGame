import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
} from '../../content/contentCatalog';

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

export interface ResolvedHubSceneCatalogResource {
    resourceId: string;
    publicPath: string;
    hubCacheKey: string;
}

export interface LoadedHubSceneDefinitionIdentity {
    hubId: string;
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

export function getHubSceneCatalogResourceId(data: NormalizedHubSceneLaunchData): string {
    return normalizeString(data.hubResourceId, data.hubId);
}

export function resolveHubSceneCatalogResource(
    rawCatalog: unknown,
    data: NormalizedHubSceneLaunchData,
): ResolvedHubSceneCatalogResource {
    const resourceId = getHubSceneCatalogResourceId(data);
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'HubScene',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const hubResource = catalogResolver.resolveJsonResource({
        resourceId,
        expectedKind: 'hub',
    });

    if (hubResource.publicPath !== data.hubFile) {
        throw new Error(
            `HubScene catalog resource ${resourceId} resolved to publicPath ${hubResource.publicPath}, but launch hubFile is ${data.hubFile}.`,
        );
    }

    return {
        resourceId,
        publicPath: hubResource.publicPath,
        hubCacheKey: data.hubCacheKey,
    };
}

export function assertHubSceneCatalogResourceMatchesLoadedHub(
    hub: LoadedHubSceneDefinitionIdentity,
    data: NormalizedHubSceneLaunchData,
    resource: ResolvedHubSceneCatalogResource,
): void {
    if (hub.hubId !== data.hubId) {
        throw new Error(
            `HubScene loaded catalog resource ${resource.resourceId} from public/${resource.publicPath}, but launch expected hubId ${data.hubId} and loaded Hub declares ${hub.hubId}.`,
        );
    }

    if (hub.hubId !== resource.resourceId) {
        throw new Error(
            `HubScene loaded catalog resource ${resource.resourceId} from public/${resource.publicPath}, but loaded Hub declares ${hub.hubId}. Catalog hub resources must declare a hubId matching their resourceId.`,
        );
    }
}
