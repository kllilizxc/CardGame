import type {
    HubSessionSnapshot,
    StoryRuntimeSessionSnapshot,
} from '../../services/StoryHubSessionPersistence';
import type { StoryHubSessionKey } from '../../types/story';
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
    storyResourceId?: string;
    storyGraphFile: string;
}

export interface HubTownNavigateAction extends HubTownActionBase {
    kind: 'navigate';
    targetLocationId: string;
}

export type HubTownAction = HubTownStartStoryAction | HubTownNavigateAction;

export interface HubTownNormalizedPosition {
    x: number;
    y: number;
}

export interface HubTownPresentation {
    mapWidth: number;
    mapHeight: number;
    initialCenter: HubTownNormalizedPosition;
}

export interface HubTownLocationPresentation {
    position: HubTownNormalizedPosition;
    icon: string;
    regionLabel: string;
}

export interface HubTownViewport {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface HubTownSurfacePosition {
    x: number;
    y: number;
}

export interface HubTownLocation {
    id: string;
    title: string;
    summary: string;
    detail: string;
    presentation: HubTownLocationPresentation;
    actions: HubTownAction[];
}

export interface HubTownDefinition {
    hubId: string;
    title: string;
    subtitle: string;
    description: string;
    defaultLocationId: string;
    presentation: HubTownPresentation;
    locations: HubTownLocation[];
}

export interface HubNavigationState {
    currentLocationId: string;
    statusText?: string;
}

export interface HubLaunchLocationTarget {
    targetLocationId?: string;
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

export interface HubSceneLocationSelectionIntent {
    kind: 'selectLocation';
    targetLocationId: string;
    statusText?: string;
}

export type HubTownActionIntent = HubSceneStoryLaunchIntent | HubSceneNavigationIntent;
export type HubSceneActionIntent =
    | HubTownActionIntent
    | HubSceneLocationSelectionIntent;

function isHubTownNavigateAction(action: HubTownAction): action is HubTownNavigateAction {
    return action.kind === 'navigate';
}

function isHubTownStartStoryAction(action: HubTownAction): action is HubTownStartStoryAction {
    return action.kind === 'startStory';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unsupportedHubTownAction(action: never): never {
    const invalidAction = action as unknown as HubTownAction;

    throw new Error(`Hub action ${invalidAction.id} has unsupported kind: ${invalidAction.kind}`);
}

function unsupportedHubNavigationIntent(intent: never): never {
    const invalidIntent = intent as unknown as HubSceneActionIntent;

    throw new Error(`Hub navigation intent has unsupported kind: ${invalidIntent.kind}`);
}

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Hub town ${field} must be a non-empty string.`);
    }

    return value;
}

function optionalRequiredString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Hub town ${field} must be a non-empty string when provided.`);
    }

    return value.trim();
}

function requireLocationString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Hub location ${field} must be a non-empty string.`);
    }

    return value;
}

function requirePositiveNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`Hub town ${field} must be a positive number.`);
    }

    return value;
}

function validateNormalizedPosition(
    value: unknown,
    field: string,
    ownerLabel = 'Hub town',
): HubTownNormalizedPosition {
    if (!isRecord(value)) {
        throw new Error(`${ownerLabel} ${field} must be an object.`);
    }

    return {
        x: requireNormalizedNumberForOwner(value.x, `${field}.x`, ownerLabel),
        y: requireNormalizedNumberForOwner(value.y, `${field}.y`, ownerLabel),
    };
}

function requireNormalizedNumberForOwner(value: unknown, field: string, ownerLabel: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${ownerLabel} ${field} must be between 0 and 1.`);
    }

    return value;
}

function validateHubTownPresentation(value: unknown): HubTownPresentation {
    if (!isRecord(value)) {
        throw new Error('Hub town presentation must be an object.');
    }

    return {
        mapWidth: requirePositiveNumber(value.mapWidth, 'presentation.mapWidth'),
        mapHeight: requirePositiveNumber(value.mapHeight, 'presentation.mapHeight'),
        initialCenter: validateNormalizedPosition(value.initialCenter, 'presentation.initialCenter'),
    };
}

function validateHubLocationPresentation(value: unknown, locationId: string): HubTownLocationPresentation {
    if (!isRecord(value)) {
        throw new Error(`Hub location ${locationId} presentation must be an object.`);
    }

    return {
        position: validateNormalizedPosition(
            value.position,
            `${locationId} presentation.position`,
            'Hub location',
        ),
        icon: requireLocationString(value.icon, `${locationId} presentation.icon`),
        regionLabel: requireLocationString(value.regionLabel, `${locationId} presentation.regionLabel`),
    };
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
        const storyResourceId = optionalRequiredString(value.storyResourceId, `actions.${id}.storyResourceId`);

        return {
            ...base,
            kind,
            ...(storyResourceId ? { storyResourceId } : {}),
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
        presentation: validateHubLocationPresentation(value.presentation, id),
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
            if (isHubTownNavigateAction(action) && !locationIds.has(action.targetLocationId)) {
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
        presentation: validateHubTownPresentation(value.presentation),
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

export function createInitialHubNavigationState(
    town: HubTownDefinition,
    savedSession?: HubSessionSnapshot | null,
    launchTarget?: HubLaunchLocationTarget | null,
): HubNavigationState {
    if (launchTarget?.targetLocationId) {
        const targetLocation = resolveHubLocation(town, launchTarget.targetLocationId);

        return {
            currentLocationId: targetLocation.id,
            ...(launchTarget.statusText ? { statusText: launchTarget.statusText } : {}),
        };
    }

    if (savedSession?.hubId === town.hubId && town.locations.some((location) => location.id === savedSession.currentLocationId)) {
        return {
            currentLocationId: savedSession.currentLocationId,
            ...(savedSession.statusText ? { statusText: savedSession.statusText } : {}),
        };
    }

    return {
        currentLocationId: resolveHubLocation(town, town.defaultLocationId).id,
    };
}

export function createStoryHubSessionKeyFromAction(action: HubTownStartStoryAction): StoryHubSessionKey {
    return {
        hubId: action.hubId,
        actionId: action.id,
        storyGraphFile: action.storyGraphFile,
    };
}

function createResumedStoryLaunchPayload(
    action: HubTownStartStoryAction,
    savedStorySession?: StoryRuntimeSessionSnapshot | null,
): StorySceneHubLaunchData {
    const basePayload: StorySceneHubLaunchData = {
        source: 'hub',
        hubId: action.hubId,
        actionId: action.id,
        ...(action.storyResourceId ? { storyResourceId: action.storyResourceId } : {}),
        storyGraphFile: action.storyGraphFile,
        ...(action.statusText ? { statusText: action.statusText } : {}),
    };

    if (
        !savedStorySession
        || savedStorySession.hubId !== action.hubId
        || savedStorySession.actionId !== action.id
        || savedStorySession.storyGraphFile !== action.storyGraphFile
    ) {
        return basePayload;
    }

    return {
        ...basePayload,
        storyState: {
            ...savedStorySession.storyState,
            visitedNodeIds: [...savedStorySession.storyState.visitedNodeIds],
            triggeredDialogueIds: [...savedStorySession.storyState.triggeredDialogueIds],
            flags: { ...savedStorySession.storyState.flags },
            attributes: { ...savedStorySession.storyState.attributes },
            relations: { ...savedStorySession.storyState.relations },
        },
        selectedChoiceIds: [...savedStorySession.selectedChoiceIds],
        statusText: savedStorySession.statusText ?? '已恢复保存的故事进度。',
    };
}

export function createHubActionIntent(
    action: HubTownAction,
    savedStorySession?: StoryRuntimeSessionSnapshot | null,
): HubTownActionIntent {
    switch (action.kind) {
        case 'navigate':
            return {
                kind: 'navigateLocation',
                targetLocationId: action.targetLocationId,
                ...(action.statusText ? { statusText: action.statusText } : {}),
            };
        case 'startStory':
            return {
                kind: 'startScene',
                sceneKey: 'StoryScene',
                payload: createResumedStoryLaunchPayload(action, savedStorySession),
            };
        default:
            return unsupportedHubTownAction(action);
    }
}

export function createHubLocationSelectionIntent(
    targetLocationId: string,
    statusText?: string,
): HubSceneLocationSelectionIntent {
    return {
        kind: 'selectLocation',
        targetLocationId,
        ...(statusText ? { statusText } : {}),
    };
}

export function applyHubNavigationIntent(
    town: HubTownDefinition,
    state: HubNavigationState,
    intent: HubSceneActionIntent,
): HubNavigationState {
    switch (intent.kind) {
        case 'navigateLocation':
        case 'selectLocation': {
            const targetLocation = resolveHubLocation(town, intent.targetLocationId);

            return {
                currentLocationId: targetLocation.id,
                ...(intent.statusText ? { statusText: intent.statusText } : {}),
            };
        }
        default:
            return unsupportedHubNavigationIntent(intent);
    }
}

export function getHubLocationSurfacePosition(
    town: HubTownDefinition,
    location: HubTownLocation,
): HubTownSurfacePosition {
    return {
        x: location.presentation.position.x * town.presentation.mapWidth,
        y: location.presentation.position.y * town.presentation.mapHeight,
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

export function clampHubMapSurfacePosition(
    presentation: HubTownPresentation,
    viewport: HubTownViewport,
    position: HubTownSurfacePosition,
): HubTownSurfacePosition {
    return {
        x: clampSurfaceAxis(presentation.mapWidth, viewport.left, viewport.width, position.x),
        y: clampSurfaceAxis(presentation.mapHeight, viewport.top, viewport.height, position.y),
    };
}

export function createHubMapInitialSurfacePosition(
    presentation: HubTownPresentation,
    viewport: HubTownViewport,
): HubTownSurfacePosition {
    return clampHubMapSurfacePosition(presentation, viewport, {
        x: viewport.left + viewport.width / 2 - presentation.initialCenter.x * presentation.mapWidth,
        y: viewport.top + viewport.height / 2 - presentation.initialCenter.y * presentation.mapHeight,
    });
}

export function shouldActivateHubMarker(
    pointerDown: HubTownSurfacePosition,
    pointerUp: HubTownSurfacePosition,
    dragDistanceThreshold: number,
): boolean {
    const deltaX = pointerUp.x - pointerDown.x;
    const deltaY = pointerUp.y - pointerDown.y;

    return deltaX * deltaX + deltaY * deltaY <= dragDistanceThreshold * dragDistanceThreshold;
}
