export type WorldMapSceneKey = 'HubScene' | 'ExpeditionScene';

export interface WorldMapRoutePosition {
    x: number;
    y: number;
}

export interface WorldMapRouteDefinition {
    id: string;
    label: string;
    description: string;
    sceneKey: WorldMapSceneKey;
    position: WorldMapRoutePosition;
    statusText?: string;
}

export interface WorldMapDefinition {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    defaultRouteId: string;
    routes: WorldMapRouteDefinition[];
}

export interface WorldMapRouteLaunchPayload {
    source: 'worldMap';
    worldMapId: string;
    routeId: string;
    statusText?: string;
}

export interface WorldMapRouteLaunchIntent {
    kind: 'startScene';
    sceneKey: WorldMapSceneKey;
    payload: WorldMapRouteLaunchPayload;
}

const SUPPORTED_WORLD_MAP_SCENE_KEYS: WorldMapSceneKey[] = ['HubScene', 'ExpeditionScene'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`World map ${field} must be an object.`);
    }

    return value;
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`World map ${field} must be a non-empty string.`);
    }

    return value;
}

function requireNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`World map ${field} must be a number.`);
    }

    return value;
}

function validateNormalizedCoordinate(value: unknown, field: string): number {
    const coordinate = requireNumber(value, field);

    if (coordinate < 0 || coordinate > 1) {
        throw new Error(`World map ${field} must be between 0 and 1.`);
    }

    return coordinate;
}

function validateSceneKey(value: unknown, routeId: string): WorldMapSceneKey {
    const sceneKey = requireString(value, `routes.${routeId}.sceneKey`);

    if (!SUPPORTED_WORLD_MAP_SCENE_KEYS.includes(sceneKey as WorldMapSceneKey)) {
        throw new Error(`World map route ${routeId} uses unsupported sceneKey: ${sceneKey}`);
    }

    return sceneKey as WorldMapSceneKey;
}

function validateWorldMapRoute(value: unknown, index: number): WorldMapRouteDefinition {
    const route = requireRecord(value, `routes[${index}]`);
    const id = requireString(route.id, `routes[${index}].id`);
    const position = requireRecord(route.position, `routes.${id}.position`);

    return {
        id,
        label: requireString(route.label, `routes.${id}.label`),
        description: requireString(route.description, `routes.${id}.description`),
        sceneKey: validateSceneKey(route.sceneKey, id),
        position: {
            x: validateNormalizedCoordinate(position.x, `routes.${id}.position.x`),
            y: validateNormalizedCoordinate(position.y, `routes.${id}.position.y`),
        },
        ...(typeof route.statusText === 'string' && route.statusText.trim().length > 0
            ? { statusText: route.statusText }
            : {}),
    };
}

function validateUniqueRouteIds(mapId: string, routes: WorldMapRouteDefinition[]): void {
    const routeIds = new Set<string>();

    routes.forEach((route) => {
        if (routeIds.has(route.id)) {
            throw new Error(`World map ${mapId} has duplicate route id: ${route.id}`);
        }

        routeIds.add(route.id);
    });
}

function validateRequiredRouteTargets(mapId: string, routes: WorldMapRouteDefinition[]): void {
    SUPPORTED_WORLD_MAP_SCENE_KEYS.forEach((sceneKey) => {
        if (!routes.some((route) => route.sceneKey === sceneKey)) {
            throw new Error(`World map ${mapId} must declare a route for ${sceneKey}.`);
        }
    });
}

export function validateWorldMapDefinition(value: unknown): WorldMapDefinition {
    const map = requireRecord(value, 'definition');
    const id = requireString(map.id, 'id');
    const routes = Array.isArray(map.routes)
        ? map.routes.map((route, index) => validateWorldMapRoute(route, index))
        : [];

    if (routes.length === 0) {
        throw new Error(`World map ${id} must define at least one route.`);
    }

    validateUniqueRouteIds(id, routes);
    validateRequiredRouteTargets(id, routes);

    const defaultRouteId = requireString(map.defaultRouteId, 'defaultRouteId');

    if (!routes.some((route) => route.id === defaultRouteId)) {
        throw new Error(`World map ${id} defaultRouteId does not match a route: ${defaultRouteId}`);
    }

    return {
        id,
        title: requireString(map.title, 'title'),
        subtitle: requireString(map.subtitle, 'subtitle'),
        description: requireString(map.description, 'description'),
        defaultRouteId,
        routes,
    };
}

export function createWorldMapRouteIntent(
    worldMap: WorldMapDefinition,
    route: WorldMapRouteDefinition,
): WorldMapRouteLaunchIntent {
    return {
        kind: 'startScene',
        sceneKey: route.sceneKey,
        payload: {
            source: 'worldMap',
            worldMapId: worldMap.id,
            routeId: route.id,
            ...(route.statusText ? { statusText: route.statusText } : {}),
        },
    };
}
