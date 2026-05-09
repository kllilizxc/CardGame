import type { StorySceneHubLaunchData } from '../story/storySceneLaunch';

export type HubTownActionKind = 'startStory';

export interface HubTownAction {
    id: string;
    kind: HubTownActionKind;
    label: string;
    description: string;
    storyGraphFile: string;
    statusText?: string;
    hubId: string;
}

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

export interface HubSceneLaunchIntent {
    kind: 'startScene';
    sceneKey: 'StoryScene';
    payload: StorySceneHubLaunchData;
}

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

    if (kind !== 'startStory') {
        throw new Error(`Hub action ${id} uses unsupported kind: ${kind}`);
    }

    return {
        id,
        kind,
        label: requireString(value.label, `actions.${id}.label`),
        description: requireString(value.description, `actions.${id}.description`),
        storyGraphFile: requireString(value.storyGraphFile, `actions.${id}.storyGraphFile`),
        ...(typeof value.statusText === 'string' && value.statusText.trim().length > 0
            ? { statusText: value.statusText }
            : {}),
        hubId,
    };
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

export function createHubActionLaunchIntent(action: HubTownAction): HubSceneLaunchIntent {
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
