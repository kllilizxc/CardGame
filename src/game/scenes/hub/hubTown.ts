import type { StorySceneHubLaunchData } from '../story/storySceneLaunch';

export type HubTownActionKind = 'startStory' | 'navigate';

export interface HubTownActionBase {
    id: string;
    kind: HubTownActionKind;
    label: string;
    description: string;
    statusText?: string;
    hubId: string;
}

export interface HubTownStartStoryAction extends HubTownActionBase {
    kind: 'startStory';
    storyGraphFile: string;
}

export interface HubTownNavigateAction extends HubTownActionBase {
    kind: 'navigate';
    targetLocationId: string;
}

export type HubTownAction = HubTownStartStoryAction | HubTownNavigateAction;

export interface HubTownLocation {
    id: string;
    title: string;
    summary: string;
    detail: string;
    actions: HubTownAction[];
}

export interface HubTownDefinition {
    hubId: string;
    title: string;
    subtitle: string;
    description: string;
    defaultLocationId: string;
    locations: HubTownLocation[];
}

export interface HubNavigationState {
    currentLocationId: string;
    statusText?: string;
}

export interface HubSceneStoryLaunchIntent {
    kind: 'startScene';
    sceneKey: 'StoryScene';
    payload: StorySceneHubLaunchData;
}

export interface HubSceneNavigationIntent {
    kind: 'navigateLocation';
    targetLocationId: string;
    statusText?: string;
}

export type HubSceneActionIntent = HubSceneStoryLaunchIntent | HubSceneNavigationIntent;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Hub town ${field} must be a non-empty string.`);
    }

    return value;
}

function validateHubAction(value: unknown, hubId: string, locationId: string, index: number): HubTownAction {
    if (!isRecord(value)) {
        throw new Error(`Hub location ${locationId} actions[${index}] must be an object.`);
    }

    const id = requireString(value.id, `locations.${locationId}.actions[${index}].id`);
    const kind = requireString(value.kind, `actions.${id}.kind`);
    const base = {
        id,
        label: requireString(value.label, `actions.${id}.label`),
        description: requireString(value.description, `actions.${id}.description`),
        ...(typeof value.statusText === 'string' && value.statusText.trim().length > 0
            ? { statusText: value.statusText }
            : {}),
        hubId,
    };

    if (kind === 'startStory') {
        return {
            ...base,
            kind,
            storyGraphFile: requireString(value.storyGraphFile, `actions.${id}.storyGraphFile`),
        };
    }

    if (kind === 'navigate') {
        return {
            ...base,
            kind,
            targetLocationId: requireString(value.targetLocationId, `actions.${id}.targetLocationId`),
        };
    }

    throw new Error(`Hub action ${id} uses unsupported kind: ${kind}`);
}

function validateHubLocation(value: unknown, hubId: string, index: number): HubTownLocation {
    if (!isRecord(value)) {
        throw new Error(`Hub town locations[${index}] must be an object.`);
    }

    const id = requireString(value.id, `locations[${index}].id`);
    const actions = Array.isArray(value.actions)
        ? value.actions.map((action, actionIndex) => validateHubAction(action, hubId, id, actionIndex))
        : [];

    if (actions.length === 0) {
        throw new Error(`Hub location ${id} must define at least one action.`);
    }

    return {
        id,
        title: requireString(value.title, `locations.${id}.title`),
        summary: requireString(value.summary, `locations.${id}.summary`),
        detail: requireString(value.detail, `locations.${id}.detail`),
        actions,
    };
}

function validateUniqueLocationIds(hubId: string, locations: HubTownLocation[]): void {
    const seenLocationIds = new Set<string>();

    locations.forEach((location) => {
        if (seenLocationIds.has(location.id)) {
            throw new Error(`Hub town ${hubId} has duplicate location id: ${location.id}`);
        }

        seenLocationIds.add(location.id);
    });
}

function validateNavigationTargets(locations: HubTownLocation[]): void {
    const locationIds = new Set(locations.map((location) => location.id));

    locations.forEach((location) => {
        location.actions.forEach((action) => {
            if (action.kind === 'navigate' && !locationIds.has(action.targetLocationId)) {
                throw new Error(`Hub action ${action.id} points to missing targetLocationId: ${action.targetLocationId}`);
            }
        });
    });
}

export function validateHubTownDefinition(value: unknown): HubTownDefinition {
    if (!isRecord(value)) {
        throw new Error('Hub town definition must be an object.');
    }

    const hubId = requireString(value.hubId, 'hubId');
    const locations = Array.isArray(value.locations)
        ? value.locations.map((location, index) => validateHubLocation(location, hubId, index))
        : [];

    if (locations.length === 0) {
        throw new Error(`Hub town ${hubId} must define at least one location.`);
    }
    validateUniqueLocationIds(hubId, locations);
    validateNavigationTargets(locations);

    const defaultLocationId = requireString(value.defaultLocationId, 'defaultLocationId');

    if (!locations.some((location) => location.id === defaultLocationId)) {
        throw new Error(`Hub town ${hubId} defaultLocationId does not match a location: ${defaultLocationId}`);
    }

    return {
        hubId,
        title: requireString(value.title, 'title'),
        subtitle: requireString(value.subtitle, 'subtitle'),
        description: requireString(value.description, 'description'),
        defaultLocationId,
        locations,
    };
}

export function resolveHubLocation(town: HubTownDefinition, locationId: string): HubTownLocation {
    const location = town.locations.find((candidate) => candidate.id === locationId);

    if (!location) {
        throw new Error(`Hub location is missing from town data: ${locationId}`);
    }

    return location;
}

export function createInitialHubNavigationState(town: HubTownDefinition): HubNavigationState {
    return {
        currentLocationId: resolveHubLocation(town, town.defaultLocationId).id,
    };
}

export function createHubActionIntent(action: HubTownAction): HubSceneActionIntent {
    if (action.kind === 'navigate') {
        return {
            kind: 'navigateLocation',
            targetLocationId: action.targetLocationId,
            ...(action.statusText ? { statusText: action.statusText } : {}),
        };
    }

    return {
        kind: 'startScene',
        sceneKey: 'StoryScene',
        payload: {
            source: 'hub',
            hubId: action.hubId,
            actionId: action.id,
            storyGraphFile: action.storyGraphFile,
            ...(action.statusText ? { statusText: action.statusText } : {}),
        },
    };
}

export function applyHubNavigationIntent(
    town: HubTownDefinition,
    state: HubNavigationState,
    intent: HubSceneActionIntent,
): HubNavigationState {
    if (intent.kind !== 'navigateLocation') {
        return state;
    }

    const targetLocation = resolveHubLocation(town, intent.targetLocationId);

    return {
        currentLocationId: targetLocation.id,
        ...(intent.statusText ? { statusText: intent.statusText } : {}),
    };
}
