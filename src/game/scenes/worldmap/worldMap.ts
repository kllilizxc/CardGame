export type WorldMapDestinationKind = 'hub' | 'expedition';
export type WorldMapLaunchSceneKey = 'HubScene' | 'ExpeditionScene';

export interface WorldMapNormalizedPosition {
    x: number;
    y: number;
}

export interface WorldMapPresentation {
    mapWidth: number;
    mapHeight: number;
    initialCenter: WorldMapNormalizedPosition;
}

export interface WorldMapDestinationPresentation {
    position: WorldMapNormalizedPosition;
    icon: string;
    regionLabel: string;
}

export interface WorldMapViewport {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface WorldMapSurfacePosition {
    x: number;
    y: number;
}

interface WorldMapDestinationBase {
    id: string;
    kind: WorldMapDestinationKind;
    label: string;
    description: string;
    presentation: WorldMapDestinationPresentation;
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
    presentation: WorldMapPresentation;
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

function requirePositiveNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`World map ${field} must be a positive number.`);
    }

    return value;
}

function requireNormalizedNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`World map ${field} must be between 0 and 1.`);
    }

    return value;
}

function validateNormalizedPosition(value: unknown, field: string): WorldMapNormalizedPosition {
    if (!isRecord(value)) {
        throw new Error(`World map ${field} must be an object.`);
    }

    return {
        x: requireNormalizedNumber(value.x, `${field}.x`),
        y: requireNormalizedNumber(value.y, `${field}.y`),
    };
}

function validateWorldMapPresentation(value: unknown): WorldMapPresentation {
    if (!isRecord(value)) {
        throw new Error('World map presentation must be an object.');
    }

    return {
        mapWidth: requirePositiveNumber(value.mapWidth, 'presentation.mapWidth'),
        mapHeight: requirePositiveNumber(value.mapHeight, 'presentation.mapHeight'),
        initialCenter: validateNormalizedPosition(value.initialCenter, 'presentation.initialCenter'),
    };
}

function validateDestinationPresentation(value: unknown, destinationId: string): WorldMapDestinationPresentation {
    if (!isRecord(value)) {
        throw new Error(`World map destination ${destinationId} presentation must be an object.`);
    }

    return {
        position: validateNormalizedPosition(value.position, `destination ${destinationId} presentation.position`),
        icon: requireString(value.icon, `destination ${destinationId} presentation.icon`),
        regionLabel: requireString(value.regionLabel, `destination ${destinationId} presentation.regionLabel`),
    };
}

function createDestinationBase<TKind extends WorldMapDestinationKind>(
    value: Record<string, unknown>,
    kind: TKind,
): WorldMapDestinationBase & { kind: TKind } {
    const statusText = optionalString(value.statusText);
    const id = requireString(value.id, 'destination.id');

    return {
        id,
        kind,
        label: requireString(value.label, 'destination.label'),
        description: requireString(value.description, 'destination.description'),
        presentation: validateDestinationPresentation(value.presentation, id),
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
    const presentation = validateWorldMapPresentation(value.presentation);
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
        presentation,
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

export function getWorldMapDestinationSurfacePosition(
    worldMap: WorldMapDefinition,
    destination: WorldMapDestination,
): WorldMapSurfacePosition {
    return {
        x: destination.presentation.position.x * worldMap.presentation.mapWidth,
        y: destination.presentation.position.y * worldMap.presentation.mapHeight,
    };
}

function clampSurfaceAxis(
    surfaceSize: number,
    viewportStart: number,
    viewportSize: number,
    value: number,
): number {
    if (surfaceSize <= viewportSize) {
        return viewportStart + (viewportSize - surfaceSize) / 2;
    }

    const min = viewportStart + viewportSize - surfaceSize;
    const max = viewportStart;

    return Math.min(max, Math.max(min, value));
}

export function clampWorldMapSurfacePosition(
    presentation: WorldMapPresentation,
    viewport: WorldMapViewport,
    position: WorldMapSurfacePosition,
): WorldMapSurfacePosition {
    return {
        x: clampSurfaceAxis(presentation.mapWidth, viewport.left, viewport.width, position.x),
        y: clampSurfaceAxis(presentation.mapHeight, viewport.top, viewport.height, position.y),
    };
}

export function createWorldMapInitialSurfacePosition(
    presentation: WorldMapPresentation,
    viewport: WorldMapViewport,
): WorldMapSurfacePosition {
    return clampWorldMapSurfacePosition(presentation, viewport, {
        x: viewport.left + viewport.width / 2 - presentation.initialCenter.x * presentation.mapWidth,
        y: viewport.top + viewport.height / 2 - presentation.initialCenter.y * presentation.mapHeight,
    });
}

export function shouldActivateWorldMapMarker(
    pointerDown: WorldMapSurfacePosition,
    pointerUp: WorldMapSurfacePosition,
    dragDistanceThreshold: number,
): boolean {
    const deltaX = pointerUp.x - pointerDown.x;
    const deltaY = pointerUp.y - pointerDown.y;

    return deltaX * deltaX + deltaY * deltaY <= dragDistanceThreshold * dragDistanceThreshold;
}
