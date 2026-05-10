import type { StoryHubSessionKey, StoryState } from '../types/story';

export const STORY_HUB_SESSION_STORAGE_KEY = 'cardgame.story-hub-session.v1';
export const STORY_HUB_SESSION_SCHEMA_VERSION = 1;

export type StoryHubSessionStorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface HubSessionSnapshot {
    hubId: string;
    currentLocationId: string;
    statusText?: string;
    updatedAt: string;
}

export interface StoryRuntimeSessionSnapshot extends StoryHubSessionKey {
    storyState: StoryState;
    selectedChoiceIds: string[];
    statusText?: string;
    updatedAt: string;
}

export interface StoryHubSessionDocument {
    schemaVersion: typeof STORY_HUB_SESSION_SCHEMA_VERSION;
    hubs: Record<string, HubSessionSnapshot>;
    stories: Record<string, StoryRuntimeSessionSnapshot>;
}

const memoryStorage = new Map<string, string>();

function getStorageAdapter(storage?: StoryHubSessionStorageAdapter): StoryHubSessionStorageAdapter {
    if (storage) {
        return storage;
    }

    if (typeof globalThis.localStorage !== 'undefined') {
        return globalThis.localStorage;
    }

    return {
        getItem: (key: string) => memoryStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
        },
        removeItem: (key: string) => {
            memoryStorage.delete(key);
        },
    };
}

function createEmptyDocument(): StoryHubSessionDocument {
    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: {},
        stories: {},
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number' && !Number.isNaN(entry));
}

function isStoryState(value: unknown): value is StoryState {
    if (!isRecord(value)) {
        return false;
    }

    return isNonEmptyString(value.storyId)
        && isNonEmptyString(value.currentLocationId)
        && isNonEmptyString(value.currentSublocationId)
        && isNonEmptyString(value.currentNodeId)
        && isStringArray(value.visitedNodeIds)
        && isStringArray(value.triggeredDialogueIds)
        && isBooleanRecord(value.flags)
        && isNumberRecord(value.attributes)
        && isNumberRecord(value.relations);
}

function isHubSessionSnapshot(value: unknown): value is HubSessionSnapshot {
    if (!isRecord(value)) {
        return false;
    }

    return isNonEmptyString(value.hubId)
        && isNonEmptyString(value.currentLocationId)
        && isOptionalString(value.statusText)
        && isNonEmptyString(value.updatedAt);
}

function isStoryRuntimeSessionSnapshot(value: unknown): value is StoryRuntimeSessionSnapshot {
    if (!isRecord(value)) {
        return false;
    }

    return isNonEmptyString(value.hubId)
        && isNonEmptyString(value.actionId)
        && isNonEmptyString(value.storyGraphFile)
        && isStoryState(value.storyState)
        && isStringArray(value.selectedChoiceIds)
        && isOptionalString(value.statusText)
        && isNonEmptyString(value.updatedAt);
}

function cloneStoryState(state: StoryState): StoryState {
    return {
        ...state,
        visitedNodeIds: [...state.visitedNodeIds],
        triggeredDialogueIds: [...state.triggeredDialogueIds],
        flags: { ...state.flags },
        attributes: { ...state.attributes },
        relations: { ...state.relations },
    };
}

function cloneHubSessionSnapshot(snapshot: HubSessionSnapshot): HubSessionSnapshot {
    return {
        hubId: snapshot.hubId,
        currentLocationId: snapshot.currentLocationId,
        ...(snapshot.statusText !== undefined ? { statusText: snapshot.statusText } : {}),
        updatedAt: snapshot.updatedAt,
    };
}

function cloneStoryRuntimeSessionSnapshot(snapshot: StoryRuntimeSessionSnapshot): StoryRuntimeSessionSnapshot {
    return {
        hubId: snapshot.hubId,
        actionId: snapshot.actionId,
        storyGraphFile: snapshot.storyGraphFile,
        storyState: cloneStoryState(snapshot.storyState),
        selectedChoiceIds: [...snapshot.selectedChoiceIds],
        ...(snapshot.statusText !== undefined ? { statusText: snapshot.statusText } : {}),
        updatedAt: snapshot.updatedAt,
    };
}

function cloneStoryHubSessionDocument(document: StoryHubSessionDocument): StoryHubSessionDocument {
    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: Object.fromEntries(
            Object.entries(document.hubs).map(([hubId, snapshot]) => [
                hubId,
                cloneHubSessionSnapshot(snapshot),
            ]),
        ),
        stories: Object.fromEntries(
            Object.entries(document.stories).map(([sessionKey, snapshot]) => [
                sessionKey,
                cloneStoryRuntimeSessionSnapshot(snapshot),
            ]),
        ),
    };
}

function parseHubSessions(value: unknown): Record<string, HubSessionSnapshot> | null {
    if (!isRecord(value)) {
        return null;
    }

    const hubs: Record<string, HubSessionSnapshot> = {};

    for (const [hubId, snapshot] of Object.entries(value)) {
        if (!isHubSessionSnapshot(snapshot) || snapshot.hubId !== hubId) {
            return null;
        }

        hubs[hubId] = cloneHubSessionSnapshot(snapshot);
    }

    return hubs;
}

function parseStorySessions(value: unknown): Record<string, StoryRuntimeSessionSnapshot> | null {
    if (!isRecord(value)) {
        return null;
    }

    const stories: Record<string, StoryRuntimeSessionSnapshot> = {};

    for (const [sessionKey, snapshot] of Object.entries(value)) {
        if (!isStoryRuntimeSessionSnapshot(snapshot) || createStoryRuntimeSessionStorageKey(snapshot) !== sessionKey) {
            return null;
        }

        stories[sessionKey] = cloneStoryRuntimeSessionSnapshot(snapshot);
    }

    return stories;
}

function parseDocument(value: unknown): StoryHubSessionDocument | null {
    if (!isRecord(value) || value.schemaVersion !== STORY_HUB_SESSION_SCHEMA_VERSION) {
        return null;
    }

    const hubs = parseHubSessions(value.hubs);
    const stories = parseStorySessions(value.stories);

    if (!hubs || !stories) {
        return null;
    }

    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs,
        stories,
    };
}

function loadDocument(storageAdapter?: StoryHubSessionStorageAdapter): StoryHubSessionDocument {
    const storage = getStorageAdapter(storageAdapter);
    const rawValue = storage.getItem(STORY_HUB_SESSION_STORAGE_KEY);

    if (!rawValue) {
        return createEmptyDocument();
    }

    try {
        const parsed = parseDocument(JSON.parse(rawValue));

        if (parsed) {
            return parsed;
        }
    } catch {
        // Fall through to reset corrupt storage.
    }

    storage.removeItem(STORY_HUB_SESSION_STORAGE_KEY);
    return createEmptyDocument();
}

function saveDocument(
    document: StoryHubSessionDocument,
    storageAdapter?: StoryHubSessionStorageAdapter,
): void {
    getStorageAdapter(storageAdapter).setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(document));
}

export function createStoryRuntimeSessionStorageKey(key: StoryHubSessionKey): string {
    return [key.hubId, key.actionId, key.storyGraphFile]
        .map((part) => encodeURIComponent(part))
        .join('|');
}

export function loadStoryHubSessionDocumentSnapshot(storage?: StoryHubSessionStorageAdapter): StoryHubSessionDocument {
    return cloneStoryHubSessionDocument(loadDocument(storage));
}

export function loadHubSessionSnapshot(
    hubId: string,
    storage?: StoryHubSessionStorageAdapter,
): HubSessionSnapshot | null {
    const snapshot = loadDocument(storage).hubs[hubId];

    return snapshot ? cloneHubSessionSnapshot(snapshot) : null;
}

export function saveHubSessionSnapshot(
    snapshot: HubSessionSnapshot,
    storage?: StoryHubSessionStorageAdapter,
): void {
    const document = loadDocument(storage);

    document.hubs[snapshot.hubId] = cloneHubSessionSnapshot(snapshot);
    saveDocument(document, storage);
}

export function loadStoryRuntimeSession(
    key: StoryHubSessionKey,
    storage?: StoryHubSessionStorageAdapter,
): StoryRuntimeSessionSnapshot | null {
    const snapshot = loadDocument(storage).stories[createStoryRuntimeSessionStorageKey(key)];

    return snapshot ? cloneStoryRuntimeSessionSnapshot(snapshot) : null;
}

export function saveStoryRuntimeSession(
    snapshot: StoryRuntimeSessionSnapshot,
    storage?: StoryHubSessionStorageAdapter,
): void {
    const document = loadDocument(storage);

    document.stories[createStoryRuntimeSessionStorageKey(snapshot)] = cloneStoryRuntimeSessionSnapshot(snapshot);
    saveDocument(document, storage);
}

export function clearStoryRuntimeSession(
    key: StoryHubSessionKey,
    storage?: StoryHubSessionStorageAdapter,
): void {
    const document = loadDocument(storage);

    delete document.stories[createStoryRuntimeSessionStorageKey(key)];
    saveDocument(document, storage);
}

export function resetStoryHubSessionPersistenceForTests(storage?: StoryHubSessionStorageAdapter): void {
    memoryStorage.clear();
    getStorageAdapter(storage).removeItem(STORY_HUB_SESSION_STORAGE_KEY);
}

export function writeRawStoryHubSessionForTests(
    rawValue: string,
    storage?: StoryHubSessionStorageAdapter,
): void {
    getStorageAdapter(storage).setItem(STORY_HUB_SESSION_STORAGE_KEY, rawValue);
}
