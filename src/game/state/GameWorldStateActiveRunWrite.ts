import {
    ACTIVE_RUN_STORAGE_KEY,
    activeRunMatchesIdentity,
    clearActiveRun,
    createActiveRunStorageKey,
    normalizeActiveRunIdentity,
    normalizeActiveRunRouteKey,
    parseActiveRunRouteKey,
    saveActiveRun,
    type ActiveRunStorageLookup,
    type ActiveRunTargetIdentity,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
import {
    SAVE_COMPATIBILITY_REGISTRY,
    type ActiveRunCompatibilityKeys,
} from '../services/SaveCompatibility';
import type { ExpeditionRouteIdentity, RunSnapshot } from '../types/expedition';
import {
    createGameWorldState,
    type DeepReadonly,
    type GameWorldState,
    type GameWorldStateOptions,
} from './GameWorldState';

export interface GameWorldStateActiveRunWriteOptions extends Omit<GameWorldStateOptions, 'storage'> {
    readonly storage: RunPersistenceStorageAdapter;
}

export interface GameWorldStateActiveRunDocumentWriteOptions {
    readonly document: DeepReadonly<RunSnapshot> | null;
    readonly activeRunLookup?: ActiveRunStorageLookup;
    readonly activeRunIdentity?: ActiveRunTargetIdentity;
}

export interface GameWorldStateActiveRunClearOptions {
    readonly storage: RunPersistenceStorageAdapter;
    readonly activeRunLookup?: ActiveRunStorageLookup;
    readonly activeRunIdentity?: ActiveRunTargetIdentity;
}

export interface GameWorldStateActiveRunBasePlan {
    readonly owner: 'activeRun';
    readonly identity: ExpeditionRouteIdentity;
    readonly routeKey: string;
    readonly canonicalStorageKey: string;
    readonly legacyUnscopedStorageKey: typeof ACTIVE_RUN_STORAGE_KEY;
    readonly legacyRouteStorageKeys: readonly string[];
    readonly legacyRouteLookup?: string;
}

export interface GameWorldStateActiveRunSavePlan extends GameWorldStateActiveRunBasePlan {
    readonly operation: 'save';
    readonly document: RunSnapshot;
}

export interface GameWorldStateActiveRunClearPlan extends GameWorldStateActiveRunBasePlan {
    readonly operation: 'clear';
    readonly document: null;
    readonly reason: 'document-null';
}

export type GameWorldStateActiveRunWritePlan =
    | GameWorldStateActiveRunSavePlan
    | GameWorldStateActiveRunClearPlan;

export type GameWorldStateActiveRunWriteResult = GameWorldStateActiveRunWritePlan;

function cloneJsonDocument<TDocument>(document: DeepReadonly<TDocument>): TDocument {
    return JSON.parse(JSON.stringify(document)) as TDocument;
}

function cloneRouteIdentity(identity: ExpeditionRouteIdentity): ExpeditionRouteIdentity {
    return {
        expeditionId: identity.expeditionId,
        mapId: identity.mapId,
    };
}

function identitiesMatch(left: ExpeditionRouteIdentity, right: ExpeditionRouteIdentity): boolean {
    return left.expeditionId === right.expeditionId && left.mapId === right.mapId;
}

function assertExplicitStorageAdapter(storage: RunPersistenceStorageAdapter): void {
    const candidate = storage as Partial<RunPersistenceStorageAdapter> | null | undefined;

    if (
        candidate
        && typeof candidate.getItem === 'function'
        && typeof candidate.setItem === 'function'
        && typeof candidate.removeItem === 'function'
    ) {
        return;
    }

    throw new Error(
        'GameWorldState active-run write requires an explicit storage adapter with getItem, setItem, and removeItem.',
    );
}

function assertActiveRunCompatibility(worldState: Pick<GameWorldState, 'activeRun'>): void {
    const compatibility = worldState.activeRun.compatibility;
    const registryEntry = SAVE_COMPATIBILITY_REGISTRY.activeRun;

    if (
        compatibility.owner === registryEntry.owner
        && compatibility.persistedShape === registryEntry.persistedShape
        && compatibility.canonicalStorageKeyPrefix === registryEntry.canonicalStorageKeyPrefix
        && compatibility.legacyUnscopedStorageKey === registryEntry.legacyUnscopedStorageKey
        && compatibility.routeKeyFormat === registryEntry.routeKeyFormat
    ) {
        return;
    }

    throw new Error('GameWorldState active-run write attempted to use an incompatible storage boundary.');
}

function assertActiveRunIdentityMatchesDocument(
    document: RunSnapshot,
    identity: ExpeditionRouteIdentity,
): void {
    if (activeRunMatchesIdentity(document, identity)) {
        return;
    }

    throw new Error(
        `Cannot persist active run for ${document.expeditionId}/${document.mapId} under route ${identity.expeditionId}/${identity.mapId}.`,
    );
}

function assertActiveRunViewIdentityConsistency(worldState: Pick<GameWorldState, 'activeRun'>): void {
    const keyIdentity = normalizeActiveRunIdentity(worldState.activeRun.keys.normalizedIdentity);
    const viewIdentity = normalizeActiveRunIdentity(worldState.activeRun.identity);

    if (identitiesMatch(keyIdentity, viewIdentity)) {
        return;
    }

    throw new Error('GameWorldState active-run write attempted to use mismatched active-run identity metadata.');
}

function getLegacyRouteLookup(keys: ActiveRunCompatibilityKeys): string | undefined {
    const prefix = SAVE_COMPATIBILITY_REGISTRY.activeRun.canonicalStorageKeyPrefix;
    const legacyRouteStorageKey = keys.legacyRouteStorageKeys.find((key) => key.startsWith(prefix));

    return legacyRouteStorageKey?.slice(prefix.length);
}

function createActiveRunPlanBase(
    identity: ExpeditionRouteIdentity,
    legacyRouteLookup?: string,
): GameWorldStateActiveRunBasePlan {
    const normalizedIdentity = normalizeActiveRunIdentity(identity);
    const routeKey = normalizeActiveRunRouteKey(legacyRouteLookup, normalizedIdentity);
    const canonicalStorageKey = createActiveRunStorageKey(routeKey, normalizedIdentity);
    const normalizedLegacyRouteLookup = legacyRouteLookup?.trim();
    const legacyRouteStorageKey = normalizedLegacyRouteLookup
        ? `${SAVE_COMPATIBILITY_REGISTRY.activeRun.canonicalStorageKeyPrefix}${normalizedLegacyRouteLookup}`
        : null;

    return {
        owner: 'activeRun',
        identity: cloneRouteIdentity(normalizedIdentity),
        routeKey,
        canonicalStorageKey,
        legacyUnscopedStorageKey: SAVE_COMPATIBILITY_REGISTRY.activeRun.legacyUnscopedStorageKey,
        legacyRouteStorageKeys: legacyRouteStorageKey && legacyRouteStorageKey !== canonicalStorageKey
            ? [legacyRouteStorageKey]
            : [],
        ...(normalizedLegacyRouteLookup ? { legacyRouteLookup: normalizedLegacyRouteLookup } : {}),
    };
}

function createActiveRunSavePlan(
    document: DeepReadonly<RunSnapshot>,
    identity: ExpeditionRouteIdentity,
    legacyRouteLookup?: string,
): GameWorldStateActiveRunSavePlan {
    const planBase = createActiveRunPlanBase(identity, legacyRouteLookup);
    const clonedDocument = cloneJsonDocument<RunSnapshot>(document);
    const normalizedDocument: RunSnapshot = {
        ...clonedDocument,
        routeKey: planBase.routeKey,
    };

    assertActiveRunIdentityMatchesDocument(normalizedDocument, planBase.identity);

    return {
        ...planBase,
        operation: 'save',
        document: normalizedDocument,
    };
}

function createActiveRunClearPlan(
    identity: ExpeditionRouteIdentity,
    legacyRouteLookup?: string,
): GameWorldStateActiveRunClearPlan {
    return {
        ...createActiveRunPlanBase(identity, legacyRouteLookup),
        operation: 'clear',
        document: null,
        reason: 'document-null',
    };
}

function createActiveRunWritePlan(
    document: DeepReadonly<RunSnapshot> | null,
    identity: ExpeditionRouteIdentity,
    legacyRouteLookup?: string,
): GameWorldStateActiveRunWritePlan {
    return document
        ? createActiveRunSavePlan(document, identity, legacyRouteLookup)
        : createActiveRunClearPlan(identity, legacyRouteLookup);
}

function cloneWritePlan(plan: GameWorldStateActiveRunWritePlan): GameWorldStateActiveRunWritePlan {
    const planBase: GameWorldStateActiveRunBasePlan = {
        owner: 'activeRun',
        identity: cloneRouteIdentity(plan.identity),
        routeKey: plan.routeKey,
        canonicalStorageKey: plan.canonicalStorageKey,
        legacyUnscopedStorageKey: plan.legacyUnscopedStorageKey,
        legacyRouteStorageKeys: [...plan.legacyRouteStorageKeys],
        ...(plan.legacyRouteLookup ? { legacyRouteLookup: plan.legacyRouteLookup } : {}),
    };

    if (plan.operation === 'save') {
        return {
            ...planBase,
            operation: 'save',
            document: cloneJsonDocument(plan.document),
        };
    }

    return {
        ...planBase,
        operation: 'clear',
        document: null,
        reason: plan.reason,
    };
}

function assertActiveRunWritePlan(plan: GameWorldStateActiveRunWritePlan): void {
    const normalizedIdentity = normalizeActiveRunIdentity(plan.identity);
    const canonicalRouteKey = normalizeActiveRunRouteKey(undefined, normalizedIdentity);
    const canonicalStorageKey = createActiveRunStorageKey(undefined, normalizedIdentity);

    if (plan.owner !== 'activeRun') {
        throw new Error('GameWorldState active-run plan must target the activeRun owner.');
    }

    if (plan.routeKey !== canonicalRouteKey || plan.canonicalStorageKey !== canonicalStorageKey) {
        throw new Error('GameWorldState active-run plan uses an incompatible route-keyed storage boundary.');
    }

    if (plan.legacyUnscopedStorageKey !== SAVE_COMPATIBILITY_REGISTRY.activeRun.legacyUnscopedStorageKey) {
        throw new Error('GameWorldState active-run plan uses an incompatible legacy storage key.');
    }

    if (plan.operation === 'save') {
        assertActiveRunIdentityMatchesDocument(plan.document, normalizedIdentity);
        return;
    }

    if (plan.operation === 'clear' && plan.document === null && plan.reason === 'document-null') {
        return;
    }

    throw new Error('GameWorldState active-run plan operation must be save or clear.');
}

function resolveApplyLookup(plan: GameWorldStateActiveRunWritePlan): ActiveRunStorageLookup {
    return plan.legacyRouteLookup ?? plan.identity;
}

function isIdentityLookup(value: ActiveRunStorageLookup): value is ActiveRunTargetIdentity {
    return typeof value === 'object' || value === null || value === undefined;
}

function resolvePlanIdentity(
    document: DeepReadonly<RunSnapshot> | null,
    lookup?: ActiveRunStorageLookup,
    identity?: ActiveRunTargetIdentity,
): ExpeditionRouteIdentity {
    if (identity) {
        return normalizeActiveRunIdentity(identity);
    }

    if (document) {
        return normalizeActiveRunIdentity({
            expeditionId: document.expeditionId,
            mapId: document.mapId,
        });
    }

    if (isIdentityLookup(lookup)) {
        return normalizeActiveRunIdentity(lookup);
    }

    return parseActiveRunRouteKey(lookup) ?? normalizeActiveRunIdentity();
}

export function planGameWorldStateActiveRunWriteFromView(
    worldState: Pick<GameWorldState, 'activeRun'>,
): GameWorldStateActiveRunWritePlan {
    assertActiveRunCompatibility(worldState);
    assertActiveRunViewIdentityConsistency(worldState);

    const identity = normalizeActiveRunIdentity(worldState.activeRun.keys.normalizedIdentity);
    const legacyRouteLookup = getLegacyRouteLookup(worldState.activeRun.keys);

    return createActiveRunWritePlan(worldState.activeRun.document, identity, legacyRouteLookup);
}

export function planGameWorldStateActiveRunWrite(
    options: GameWorldStateActiveRunWriteOptions,
): GameWorldStateActiveRunWritePlan {
    assertExplicitStorageAdapter(options.storage);

    return planGameWorldStateActiveRunWriteFromView(createGameWorldState(options));
}

export function planGameWorldStateActiveRunWriteFromDocument({
    document,
    activeRunLookup,
    activeRunIdentity,
}: GameWorldStateActiveRunDocumentWriteOptions): GameWorldStateActiveRunWritePlan {
    return createActiveRunWritePlan(
        document,
        resolvePlanIdentity(document, activeRunLookup, activeRunIdentity),
        typeof activeRunLookup === 'string' ? activeRunLookup : undefined,
    );
}

export function planGameWorldStateActiveRunClear(
    options: GameWorldStateActiveRunClearOptions,
): GameWorldStateActiveRunClearPlan {
    assertExplicitStorageAdapter(options.storage);

    return createActiveRunClearPlan(
        resolvePlanIdentity(null, options.activeRunLookup, options.activeRunIdentity),
        typeof options.activeRunLookup === 'string' ? options.activeRunLookup : undefined,
    );
}

export function writeGameWorldStateActiveRunPlan(
    plan: GameWorldStateActiveRunWritePlan,
    storage: RunPersistenceStorageAdapter,
): GameWorldStateActiveRunWriteResult {
    assertActiveRunWritePlan(plan);
    assertExplicitStorageAdapter(storage);

    if (plan.operation === 'save') {
        const persistedRun = saveActiveRun(
            cloneJsonDocument(plan.document),
            resolveApplyLookup(plan),
            plan.identity,
            storage,
        );

        return cloneWritePlan({
            ...plan,
            document: persistedRun,
        });
    }

    clearActiveRun(resolveApplyLookup(plan), plan.identity, storage);

    return cloneWritePlan(plan);
}

export const applyGameWorldStateActiveRunPlan = writeGameWorldStateActiveRunPlan;

export function writeGameWorldStateActiveRunFromView(
    worldState: Pick<GameWorldState, 'activeRun'>,
    storage: RunPersistenceStorageAdapter,
): GameWorldStateActiveRunWriteResult {
    return writeGameWorldStateActiveRunPlan(
        planGameWorldStateActiveRunWriteFromView(worldState),
        storage,
    );
}

export function writeGameWorldStateActiveRun(
    options: GameWorldStateActiveRunWriteOptions,
): GameWorldStateActiveRunWriteResult {
    return writeGameWorldStateActiveRunPlan(
        planGameWorldStateActiveRunWrite(options),
        options.storage,
    );
}

export function clearGameWorldStateActiveRunPlan(
    plan: GameWorldStateActiveRunClearPlan,
    storage: RunPersistenceStorageAdapter,
): GameWorldStateActiveRunWriteResult {
    return writeGameWorldStateActiveRunPlan(plan, storage);
}

export const applyGameWorldStateActiveRunClearPlan = clearGameWorldStateActiveRunPlan;

export function clearGameWorldStateActiveRun(
    options: GameWorldStateActiveRunClearOptions,
): GameWorldStateActiveRunWriteResult {
    return clearGameWorldStateActiveRunPlan(
        planGameWorldStateActiveRunClear(options),
        options.storage,
    );
}
