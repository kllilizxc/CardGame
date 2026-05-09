export type WorldMapDestinationKind = 'hub' | 'expedition';
export type WorldMapLaunchSceneKey = 'HubScene' | 'ExpeditionScene';

interface WorldMapDestinationBase {
    id: string;
    kind: WorldMapDestinationKind;
    label: string;
    description: string;
    statusText?: string;
}

export interface WorldMapHubDestination extends WorldMapDestinationBase {
    kind: 'hub';
    hubId: string;
    hubFile: string;
    targetLocationId?: string;
}

export interface WorldMapExpeditionDestination extends WorldMapDestinationBase {
    kind: 'expedition';
    expeditionId: string;
    mapId: string;
    worldStateFile: string;
    starterDeckFile: string;
    mapFile: string;
    eventsFile: string;
    shopFile: string;
}

export type WorldMapDestination = WorldMapHubDestination | WorldMapExpeditionDestination;

export interface WorldMapDefinition {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    defaultDestinationId: string;
    destinations: WorldMapDestination[];
}

export interface WorldMapHubLaunchPayload {
    source: 'worldMap';
    destinationId: string;
    hubId: string;
    hubFile: string;
    targetLocationId?: string;
    statusText?: string;
}

export interface WorldMapExpeditionLaunchPayload {
    source: 'worldMap';
    destinationId: string;
    expeditionId: string;
    mapId: string;
    worldStateFile: string;
    starterDeckFile: string;
    mapFile: string;
    eventsFile: string;
    shopFile: string;
    statusText?: string;
}

export type WorldMapReturnSource = 'hub' | 'expedition';

export interface WorldMapReturnPayload {
    source: WorldMapReturnSource;
    statusText: string;
}

export type WorldMapLaunchIntent =
    | {
        kind: 'startScene';
        sceneKey: 'HubScene';
        payload: WorldMapHubLaunchPayload;
    }
    | {
        kind: 'startScene';
        sceneKey: 'ExpeditionScene';
        payload: WorldMapExpeditionLaunchPayload;
    };

export interface WorldMapReturnIntent {
    kind: 'startScene';
    sceneKey: 'WorldMapScene';
    payload: WorldMapReturnPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`World map ${field} must be a non-empty string.`);
    }

    return value;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalRequiredString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`World map ${field} must be a non-empty string when provided.`);
    }

    return value;
}

function createDestinationBase(
    value: Record<string, unknown>,
    kind: WorldMapDestinationKind,
): WorldMapDestinationBase {
    const statusText = optionalString(value.statusText);

    return {
        id: requireString(value.id, 'destination.id'),
        kind,
        label: requireString(value.label, 'destination.label'),
        description: requireString(value.description, 'destination.description'),
        ...(statusText ? { statusText } : {}),
    };
}

function validateWorldMapDestination(value: unknown, index: number): WorldMapDestination {
    if (!isRecord(value)) {
        throw new Error(`World map destinations[${index}] must be an object.`);
    }

    const id = requireString(value.id, `destinations[${index}].id`);
    const kind = requireString(value.kind, `destination ${id}.kind`);

    if (kind === 'hub') {
        const targetLocationId = optionalRequiredString(
            value.targetLocationId,
            `destination ${id} targetLocationId`,
        );

        return {
            ...createDestinationBase(value, kind),
            hubId: requireString(value.hubId, `destination ${id}.hubId`),
            hubFile: requireString(value.hubFile, `destination ${id} hubFile`),
            ...(targetLocationId ? { targetLocationId } : {}),
        };
    }

    if (kind === 'expedition') {
        return {
            ...createDestinationBase(value, kind),
            expeditionId: requireString(value.expeditionId, `destination ${id}.expeditionId`),
            mapId: requireString(value.mapId, `destination ${id}.mapId`),
            worldStateFile: requireString(value.worldStateFile, `destination ${id} worldStateFile`),
            starterDeckFile: requireString(value.starterDeckFile, `destination ${id} starterDeckFile`),
            mapFile: requireString(value.mapFile, `destination ${id} mapFile`),
            eventsFile: requireString(value.eventsFile, `destination ${id} eventsFile`),
            shopFile: requireString(value.shopFile, `destination ${id} shopFile`),
        };
    }

    throw new Error(`World map destination ${id} uses unsupported kind: ${kind}`);
}

function validateUniqueDestinationIds(worldMapId: string, destinations: WorldMapDestination[]): void {
    const seenDestinationIds = new Set<string>();

    destinations.forEach((destination) => {
        if (seenDestinationIds.has(destination.id)) {
            throw new Error(`World map ${worldMapId} has duplicate destination id: ${destination.id}`);
        }

        seenDestinationIds.add(destination.id);
    });
}

export function validateWorldMapDefinition(value: unknown): WorldMapDefinition {
    if (!isRecord(value)) {
        throw new Error('World map definition must be an object.');
    }

    const id = requireString(value.id, 'id');
    const destinations = Array.isArray(value.destinations)
        ? value.destinations.map((destination, index) => validateWorldMapDestination(destination, index))
        : [];

    if (destinations.length === 0) {
        throw new Error(`World map ${id} must define at least one destination.`);
    }

    validateUniqueDestinationIds(id, destinations);

    const defaultDestinationId = requireString(value.defaultDestinationId, 'defaultDestinationId');

    if (!destinations.some((destination) => destination.id === defaultDestinationId)) {
        throw new Error(`World map ${id} defaultDestinationId does not match a destination: ${defaultDestinationId}`);
    }

    return {
        id,
        title: requireString(value.title, 'title'),
        subtitle: requireString(value.subtitle, 'subtitle'),
        description: requireString(value.description, 'description'),
        defaultDestinationId,
        destinations,
    };
}

export function resolveWorldMapDestination(
    worldMap: WorldMapDefinition,
    destinationId: string,
): WorldMapDestination {
    const destination = worldMap.destinations.find((candidate) => candidate.id === destinationId);

    if (!destination) {
        throw new Error(`World map destination is missing: ${destinationId}`);
    }

    return destination;
}

export function createWorldMapDestinationIntent(
    worldMap: WorldMapDefinition,
    destinationId: string,
): WorldMapLaunchIntent {
    const destination = resolveWorldMapDestination(worldMap, destinationId);

    if (destination.kind === 'hub') {
        return {
            kind: 'startScene',
            sceneKey: 'HubScene',
            payload: {
                source: 'worldMap',
                destinationId: destination.id,
                hubId: destination.hubId,
                hubFile: destination.hubFile,
                ...(destination.targetLocationId ? { targetLocationId: destination.targetLocationId } : {}),
                ...(destination.statusText ? { statusText: destination.statusText } : {}),
            },
        };
    }

    return {
        kind: 'startScene',
        sceneKey: 'ExpeditionScene',
        payload: {
            source: 'worldMap',
            destinationId: destination.id,
            expeditionId: destination.expeditionId,
            mapId: destination.mapId,
            worldStateFile: destination.worldStateFile,
            starterDeckFile: destination.starterDeckFile,
            mapFile: destination.mapFile,
            eventsFile: destination.eventsFile,
            shopFile: destination.shopFile,
            ...(destination.statusText ? { statusText: destination.statusText } : {}),
        },
    };
}

export function createWorldMapReturnIntent(payload: WorldMapReturnPayload): WorldMapReturnIntent {
    return {
        kind: 'startScene',
        sceneKey: 'WorldMapScene',
        payload,
    };
}
