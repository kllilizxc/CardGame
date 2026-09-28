import type { StoryCardGrant, StoryHubSessionKey, StoryItemTransaction, StorySharedFacts, StoryState } from '../types/story';
import { gameStorage } from './PreviewStorage';

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
    sharedNarrative?: StorySharedFacts;
}

const memoryStorage = new Map<string, string>();

function getStorageAdapter(storage?: StoryHubSessionStorageAdapter): StoryHubSessionStorageAdapter {
    if (storage) {
        return storage;
    }

    if (typeof globalThis.localStorage !== 'undefined') {
        return gameStorage(globalThis.localStorage);
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

export function resolveStoryHubSessionStorageAdapter(
    storage?: StoryHubSessionStorageAdapter,
): StoryHubSessionStorageAdapter {
    return getStorageAdapter(storage);
}

function isActorAbilityRecord(value: unknown): value is Record<string, Record<string, number>> {
    return isRecord(value) && Object.values(value).every(isNumberRecord);
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
    return isRecord(value) && Object.values(value).every(isStringArray);
}

function isCardGrantArray(value: unknown): value is StoryCardGrant[] {
    return Array.isArray(value) && value.every((entry) => isRecord(entry)
        && isNonEmptyString(entry.grantId) && isNonEmptyString(entry.cardId)
        && Number.isSafeInteger(entry.count) && (entry.count as number) > 0)
        && new Set(value.map((entry: StoryCardGrant) => entry.grantId)).size === value.length;
}

function isItemTransactionArray(value: unknown): value is StoryItemTransaction[] {
    return Array.isArray(value) && value.every((entry) => isRecord(entry)
        && isNonEmptyString(entry.transactionId) && isNonEmptyString(entry.itemId)
        && ['artifact', 'tool', 'consumable', 'material', 'quest'].includes(String(entry.itemType))
        && Number.isSafeInteger(entry.countDelta) && entry.countDelta !== 0)
        && new Set(value.map((entry: StoryItemTransaction) => entry.transactionId)).size === value.length;
}

function mergeItemTransactions(left: StoryItemTransaction[] = [], right: StoryItemTransaction[] = []): StoryItemTransaction[] {
    const merged = new Map(left.map(item => [item.transactionId, { ...item }]));
    for (const item of right) {
        const prior = merged.get(item.transactionId);
        if (prior && (prior.itemId !== item.itemId || prior.itemType !== item.itemType || prior.countDelta !== item.countDelta)) {
            throw new Error(`Conflicting story item transaction: ${item.transactionId}`);
        }
        merged.set(item.transactionId, { ...item });
    }
    return [...merged.values()];
}

function mergeCardGrants(left: StoryCardGrant[] = [], right: StoryCardGrant[] = []): StoryCardGrant[] {
    const merged = new Map(left.map(grant => [grant.grantId, { ...grant }]));
    for (const grant of right) {
        const prior = merged.get(grant.grantId);
        if (prior && (prior.cardId !== grant.cardId || prior.count !== grant.count)) throw new Error(`Conflicting story card grant: ${grant.grantId}`);
        merged.set(grant.grantId, { ...grant });
    }
    return [...merged.values()];
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
        && (value.equipmentModifiers === undefined || isNumberRecord(value.equipmentModifiers))
        && isNumberRecord(value.relations)
        && (value.actorAbilities === undefined || isActorAbilityRecord(value.actorAbilities))
        && isOptionalString(value.currentLocationLabel)
        && isOptionalString(value.currentDialogueId)
        && (value.currentReadingPage === undefined
            || (typeof value.currentReadingPage === 'number'
                && Number.isInteger(value.currentReadingPage)
                && value.currentReadingPage >= 0))
        && (value.knowledge === undefined || isStringArrayRecord(value.knowledge))
        && (value.questStages === undefined || isStringRecord(value.questStages))
        && (value.settledEventIds === undefined || isStringArray(value.settledEventIds))
        && (value.cardGrants === undefined || isCardGrantArray(value.cardGrants))
        && (value.itemTransactions === undefined || isItemTransactionArray(value.itemTransactions))
        && (value.itemCounts === undefined || isNumberRecord(value.itemCounts));
}

function isSharedNarrativeFacts(value: unknown): value is StorySharedFacts {
    return isRecord(value)
        && isBooleanRecord(value.flags)
        && isNumberRecord(value.attributes)
        && isNumberRecord(value.relations)
        && isStringArrayRecord(value.knowledge)
        && isStringRecord(value.questStages)
        && isStringArray(value.settledEventIds)
        && (value.cardGrants === undefined || isCardGrantArray(value.cardGrants))
        && (value.itemTransactions === undefined || isItemTransactionArray(value.itemTransactions));
}

function cloneSharedNarrativeFacts(facts: StorySharedFacts): StorySharedFacts {
    return {
        flags: { ...facts.flags },
        attributes: { ...facts.attributes },
        relations: { ...facts.relations },
        knowledge: Object.fromEntries(Object.entries(facts.knowledge).map(([actorId, ids]) => [actorId, [...ids]])),
        questStages: { ...facts.questStages },
        settledEventIds: [...facts.settledEventIds],
        ...(facts.cardGrants ? { cardGrants: facts.cardGrants.map(grant => ({ ...grant })) } : {}),
        ...(facts.itemTransactions ? { itemTransactions: facts.itemTransactions.map(item => ({ ...item })) } : {}),
    };
}

export function sharedNarrativeFactsFromStory(state: StoryState): StorySharedFacts {
    return cloneSharedNarrativeFacts({
        flags: state.flags,
        attributes: state.attributes,
        relations: state.relations,
        knowledge: state.knowledge ?? {},
        questStages: state.questStages ?? {},
        settledEventIds: state.settledEventIds ?? [],
        ...(state.cardGrants ? { cardGrants: state.cardGrants } : {}),
        ...(state.itemTransactions ? { itemTransactions: state.itemTransactions } : {}),
    });
}

export function applySharedNarrativeFacts(state: StoryState, facts: StorySharedFacts | null): StoryState {
    if (!facts) return cloneStoryState(state);
    const knowledge = Object.fromEntries(
        [...new Set([...Object.keys(state.knowledge ?? {}), ...Object.keys(facts.knowledge)])].map((actorId) => [
            actorId,
            [...new Set([...(state.knowledge?.[actorId] ?? []), ...(facts.knowledge[actorId] ?? [])])],
        ]),
    );
    return {
        ...cloneStoryState(state),
        flags: { ...state.flags, ...facts.flags },
        attributes: { ...state.attributes, ...facts.attributes },
        relations: { ...state.relations, ...facts.relations },
        knowledge,
        questStages: { ...state.questStages, ...facts.questStages },
        settledEventIds: [...new Set([...(state.settledEventIds ?? []), ...facts.settledEventIds])],
        cardGrants: mergeCardGrants(state.cardGrants, facts.cardGrants),
        itemTransactions: mergeItemTransactions(state.itemTransactions, facts.itemTransactions),
    };
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
        ...(state.equipmentModifiers ? { equipmentModifiers: { ...state.equipmentModifiers } } : {}),
        relations: { ...state.relations },
        ...(state.actorAbilities ? { actorAbilities: Object.fromEntries(Object.entries(state.actorAbilities).map(([actorId, abilities]) => [actorId, { ...abilities }])) } : {}),
        ...(state.knowledge ? { knowledge: Object.fromEntries(Object.entries(state.knowledge).map(([actorId, ids]) => [actorId, [...ids]])) } : {}),
        ...(state.questStages ? { questStages: { ...state.questStages } } : {}),
        ...(state.settledEventIds ? { settledEventIds: [...state.settledEventIds] } : {}),
        ...(state.cardGrants ? { cardGrants: state.cardGrants.map(grant => ({ ...grant })) } : {}),
        ...(state.itemTransactions ? { itemTransactions: state.itemTransactions.map(item => ({ ...item })) } : {}),
        ...(state.itemCounts ? { itemCounts: { ...state.itemCounts } } : {}),
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
        ...(document.sharedNarrative ? { sharedNarrative: cloneSharedNarrativeFacts(document.sharedNarrative) } : {}),
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

    if (value.sharedNarrative !== undefined && !isSharedNarrativeFacts(value.sharedNarrative)) return null;

    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs,
        stories,
        ...(value.sharedNarrative ? { sharedNarrative: cloneSharedNarrativeFacts(value.sharedNarrative) } : {}),
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

function saveDocument(document: StoryHubSessionDocument, storage?: StoryHubSessionStorageAdapter): void {
    getStorageAdapter(storage).setItem(STORY_HUB_SESSION_STORAGE_KEY, JSON.stringify(document));
}

export function cloneStoryHubSessionDocumentSnapshot(document: unknown): StoryHubSessionDocument {
    const parsed = parseDocument(document);
    if (!parsed) throw new Error('Invalid StoryHubSessionDocument: expected schemaVersion 1 with matching Hub and Story session identities.');
    return parsed;
}

export function saveStoryHubSessionDocumentSnapshot(
    document: StoryHubSessionDocument,
    storage?: StoryHubSessionStorageAdapter,
): void {
    saveDocument(cloneStoryHubSessionDocumentSnapshot(document), storage);
}

export function createStoryRuntimeSessionStorageKey(key: StoryHubSessionKey): string {
    return [key.hubId, key.actionId, key.storyGraphFile]
        .map((part) => encodeURIComponent(part))
        .join('|');
}

export function loadStoryHubSessionDocumentSnapshot(storage?: StoryHubSessionStorageAdapter): StoryHubSessionDocument {
    return cloneStoryHubSessionDocument(loadDocument(storage));
}

export function loadHubSessionSnapshot(hubId: string, storage?: StoryHubSessionStorageAdapter): HubSessionSnapshot | null {
    const snapshot = loadDocument(storage).hubs[hubId];

    return snapshot ? cloneHubSessionSnapshot(snapshot) : null;
}

export function saveHubSessionSnapshot(snapshot: HubSessionSnapshot, storage?: StoryHubSessionStorageAdapter): void {
    const document = loadDocument(storage);

    document.hubs[snapshot.hubId] = cloneHubSessionSnapshot(snapshot);
    saveDocument(document, storage);
}

export function loadStoryRuntimeSession(key: StoryHubSessionKey, storage?: StoryHubSessionStorageAdapter): StoryRuntimeSessionSnapshot | null {
    const snapshot = loadDocument(storage).stories[createStoryRuntimeSessionStorageKey(key)];

    return snapshot ? cloneStoryRuntimeSessionSnapshot(snapshot) : null;
}

export function loadSharedNarrativeFacts(storage?: StoryHubSessionStorageAdapter): StorySharedFacts | null {
    const facts = loadDocument(storage).sharedNarrative;
    return facts ? cloneSharedNarrativeFacts(facts) : null;
}

export function saveStoryRuntimeSessionWithSharedFacts(snapshot: StoryRuntimeSessionSnapshot, storage?: StoryHubSessionStorageAdapter): void {
    const document = loadDocument(storage);
    document.stories[createStoryRuntimeSessionStorageKey(snapshot)] = cloneStoryRuntimeSessionSnapshot(snapshot);
    document.sharedNarrative = sharedNarrativeFactsFromStory(snapshot.storyState);
    saveDocument(document, storage);
}

export function saveSharedNarrativeFacts(state: StoryState, storage?: StoryHubSessionStorageAdapter): void {
    const document = loadDocument(storage);
    document.sharedNarrative = sharedNarrativeFactsFromStory(state);
    saveDocument(document, storage);
}

export function saveStoryRuntimeSession(snapshot: StoryRuntimeSessionSnapshot, storage?: StoryHubSessionStorageAdapter): void {
    const document = loadDocument(storage);

    document.stories[createStoryRuntimeSessionStorageKey(snapshot)] = cloneStoryRuntimeSessionSnapshot(snapshot);
    saveDocument(document, storage);
}

export function clearStoryRuntimeSession(key: StoryHubSessionKey, storage?: StoryHubSessionStorageAdapter): void {
    const document = loadDocument(storage);

    delete document.stories[createStoryRuntimeSessionStorageKey(key)];
    saveDocument(document, storage);
}

export function resetStoryHubSessionPersistenceForTests(): void {
    memoryStorage.clear();
    getStorageAdapter().removeItem(STORY_HUB_SESSION_STORAGE_KEY);
}

export function writeRawStoryHubSessionForTests(rawValue: string, storage?: StoryHubSessionStorageAdapter): void {
    getStorageAdapter(storage).setItem(STORY_HUB_SESSION_STORAGE_KEY, rawValue);
}
