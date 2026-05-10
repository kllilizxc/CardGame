import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import {
    isCanonicalStatusDefinitionsCatalogResource,
    registerCanonicalStatusDefinitionIds,
    validateCardLegacyApplyStatusReferences,
    type StatusDefinitionIdRegistry,
} from './contentCatalogStatusDefinitions';
import {
    registerGongfaIds,
    validateCardGongfaReferences,
    validateGongfaSchemaShapesAndReferences,
    type GongfaIdRegistry,
} from './contentCatalogGongfaDefinitions';
import {
    buildCanonicalConfigRegistries,
    validateCardRealmAndGradeReferences,
    type CanonicalConfigRegistries,
} from './contentCatalogCanonicalConfig';

type CatalogIdRegistryName = 'card' | 'deck' | 'world item';

const CANONICAL_INITIAL_STATE_RESOURCE_ID = 'world.seed.initial-state';
const CANONICAL_INITIAL_STATE_PUBLIC_PATH = 'data/world/initial-state.json';
const CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID = 'world.seed.items-artifacts';
const CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH = 'data/world/items.artifacts.json';
const STASH_ITEM_TYPE_VALUES = ['artifact', 'tool', 'consumable', 'quest'] as const;
const WORLD_ITEM_COLLECTIONS = [
    { collectionName: 'artifacts', itemType: 'artifact' },
    { collectionName: 'tools', itemType: 'tool' },
    { collectionName: 'consumables', itemType: 'consumable' },
    { collectionName: 'quests', itemType: 'quest' },
    { collectionName: 'questItems', itemType: 'quest' },
] as const;

type StashItemType = typeof STASH_ITEM_TYPE_VALUES[number];

interface CatalogIdResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

interface CatalogIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
    itemType?: StashItemType;
}

interface ContentIdRegistries {
    cards: Map<string, CatalogIdLocation>;
    decks: Map<string, CatalogIdLocation>;
    gongfa: GongfaIdRegistry;
    statuses: StatusDefinitionIdRegistry;
    canonicalConfigs: CanonicalConfigRegistries;
    worldItems: Map<string, CatalogIdLocation>;
    invalidCanonicalWorldSeedResourceIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addFailure(
    failures: ContentCatalogValidationFailure[],
    entry: Pick<ContentCatalogEntry, 'resourceId'> & Partial<Pick<ContentCatalogEntry, 'publicPath'>>,
    message: string,
): void {
    failures.push({
        resourceId: entry.resourceId,
        ...(entry.publicPath ? { publicPath: entry.publicPath } : {}),
        message,
    });
}

function formatCatalogIdLocation(location: CatalogIdLocation): string {
    return `${location.resourceId} ${location.context} in ${location.publicPath}`;
}

function validateCanonicalWorldSeedCatalogEntry(
    resource: CatalogIdResource,
    expectedPublicPath: string,
    failures: ContentCatalogValidationFailure[],
): boolean {
    let isValid = true;

    if (resource.entry.kind !== 'worldSeed') {
        addFailure(
            failures,
            resource.entry,
            `Catalog canonical world seed ${resource.entry.resourceId} must have kind worldSeed; found ${resource.entry.kind}.`,
        );
        isValid = false;
    }

    if (resource.entry.publicPath !== expectedPublicPath) {
        addFailure(
            failures,
            resource.entry,
            `Catalog canonical world seed ${resource.entry.resourceId} must use publicPath ${expectedPublicPath}; found ${resource.entry.publicPath}.`,
        );
        isValid = false;
    }

    return isValid;
}

function registerCatalogId(
    registry: Map<string, CatalogIdLocation>,
    registryName: CatalogIdRegistryName,
    resource: CatalogIdResource,
    id: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: CatalogIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registryName} id ${id} is declared more than once: ${formatCatalogIdLocation(existing)}; duplicate ${formatCatalogIdLocation(location)}.`,
        );
        return;
    }

    registry.set(id, location);
}

function reportMissingRegistryId(
    ownerEntry: ContentCatalogEntry,
    context: string,
    registryName: CatalogIdRegistryName,
    id: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        ownerEntry,
        `${context} references ${registryName} id ${id}, but no catalog ${registryName} resource declares that id.`,
    );
}

function readRegistryStringId(
    resource: CatalogIdResource,
    record: Record<string, unknown>,
    context: string,
    registryName: CatalogIdRegistryName,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    if (typeof record.id === 'string' && record.id.trim().length > 0) {
        return record.id;
    }

    addFailure(
        failures,
        resource.entry,
        `Catalog ${registryName} entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must declare a non-empty string id.`,
    );
    return undefined;
}

function formatAllowedValues(values: readonly string[]): string {
    return values.join(', ');
}

function buildContentIdRegistries(
    resources: Iterable<CatalogIdResource>,
    failures: ContentCatalogValidationFailure[],
): ContentIdRegistries {
    const resourceList = [...resources];
    const canonicalConfigs = buildCanonicalConfigRegistries(resourceList, failures);
    const registries: ContentIdRegistries = {
        cards: new Map(),
        decks: new Map(),
        gongfa: new Map(),
        statuses: new Map(),
        canonicalConfigs,
        worldItems: new Map(),
        invalidCanonicalWorldSeedResourceIds: new Set(),
    };

    for (const resource of resourceList) {
        if (
            resource.entry.resourceId === CANONICAL_INITIAL_STATE_RESOURCE_ID
            && !validateCanonicalWorldSeedCatalogEntry(resource, CANONICAL_INITIAL_STATE_PUBLIC_PATH, failures)
        ) {
            registries.invalidCanonicalWorldSeedResourceIds.add(resource.entry.resourceId);
        }

        if (
            resource.entry.resourceId === CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID
            && !validateCanonicalWorldSeedCatalogEntry(resource, CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH, failures)
        ) {
            registries.invalidCanonicalWorldSeedResourceIds.add(resource.entry.resourceId);
        }
    }

    for (const resource of resourceList) {
        if (
            registries.canonicalConfigs.invalidResourceIds.has(resource.entry.resourceId)
            || registries.invalidCanonicalWorldSeedResourceIds.has(resource.entry.resourceId)
        ) {
            continue;
        }

        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            registerCardIds(resource, registries, failures);
        }

        if (resource.entry.kind === 'deck') {
            registerDeckIds(resource, registries, failures);
        }

        if (resource.entry.kind === 'gongfa') {
            registerGongfaIds(resource, registries.gongfa, failures);
        }

        if (isCanonicalStatusDefinitionsCatalogResource(resource)) {
            registerCanonicalStatusDefinitionIds(resource, registries.statuses, failures);
        }

        if (resource.entry.kind === 'worldSeed') {
            registerWorldItemIds(resource, registries, failures);
        }
    }

    return registries;
}

function registerCardIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    for (const [collectionName, collection] of Object.entries(resource.json)) {
        if (!Array.isArray(collection)) {
            continue;
        }

        collection.forEach((value, index) => {
            const context = `${collectionName}[${index}]`;

            if (!isRecord(value)) {
                addFailure(
                    failures,
                    resource.entry,
                    `Catalog card entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
                );
                return;
            }

            const id = readRegistryStringId(resource, value, context, 'card', failures);

            if (!id) {
                return;
            }

            registerCatalogId(registries.cards, 'card', resource, id, context, failures);
        });
    }
}

function registerDeckIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    registerCatalogId(
        registries.decks,
        'deck',
        resource,
        resource.entry.resourceId,
        'catalog resourceId',
        failures,
    );

    const publicPathSegments = resource.entry.publicPath.split('/');
    const publicPathFileName = publicPathSegments[publicPathSegments.length - 1];
    const legacyDeckRef = publicPathFileName?.replace(/\.json$/, '');

    if (!legacyDeckRef || legacyDeckRef === resource.entry.resourceId) {
        return;
    }

    registerCatalogId(
        registries.decks,
        'deck',
        resource,
        legacyDeckRef,
        'publicPath basename alias',
        failures,
    );
}

function registerWorldItemIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    for (const { collectionName, itemType } of WORLD_ITEM_COLLECTIONS) {
        const collection = resource.json[collectionName];

        if (!Array.isArray(collection)) {
            continue;
        }

        collection.forEach((value, index) => {
            const context = `${collectionName}[${index}]`;

            if (!isRecord(value)) {
                addFailure(
                    failures,
                    resource.entry,
                    `Catalog world item entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
                );
                return;
            }

            const id = readRegistryStringId(resource, value, context, 'world item', failures);

            if (!id) {
                return;
            }

            registerWorldItemId(resource, registries, id, itemType, context, failures);
        });
    }
}

function registerWorldItemId(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    id: string,
    itemType: StashItemType,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: CatalogIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
        itemType,
    };
    const existing = registries.worldItems.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog world item id ${id} is declared more than once: ${formatCatalogIdLocation(existing)}; duplicate ${formatCatalogIdLocation(location)}.`,
        );
        return;
    }

    registries.worldItems.set(id, location);
}

function validateContentIdReferences(
    resources: Iterable<CatalogIdResource>,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of resources) {
        if (
            registries.canonicalConfigs.invalidResourceIds.has(resource.entry.resourceId)
            || registries.invalidCanonicalWorldSeedResourceIds.has(resource.entry.resourceId)
        ) {
            continue;
        }

        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            validateCardGongfaReferences(resource, registries.gongfa, failures);
            validateCardLegacyApplyStatusReferences(resource, registries.statuses, failures);
            validateCardRealmAndGradeReferences(resource, registries.canonicalConfigs, failures);
        }

        if (resource.entry.kind === 'gongfa') {
            validateGongfaSchemaShapesAndReferences(resource, registries.statuses, failures);
        }

        if (resource.entry.kind === 'deck') {
            validateDeckCardReferences(resource, registries, failures);
        }

        if (resource.entry.kind === 'encounter') {
            validateEncounterEnemyCardReferences(resource, registries, failures);
        }

        if (resource.entry.kind === 'expeditionEvents') {
            validateExpeditionEventRewardReferences(resource, registries, failures);
        }

        if (resource.entry.kind === 'expeditionShop') {
            validateExpeditionShopRewardReferences(resource, registries, failures);
        }

        if (resource.entry.kind === 'worldSeed') {
            validateCanonicalWorldSeedReferences(resource, registries, failures);
        }
    }
}

function validateCanonicalWorldSeedReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (resource.entry.resourceId === CANONICAL_INITIAL_STATE_RESOURCE_ID) {
        validateCanonicalInitialStateStarterStash(resource, registries, failures);
    }

    if (resource.entry.resourceId === CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID) {
        validateCanonicalWorldItemRegistryShape(resource, failures);
    }
}

function validateCanonicalInitialStateStarterStash(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        addFailure(
            failures,
            resource.entry,
            `World seed ${resource.entry.resourceId} in ${resource.entry.publicPath} must be an object before starter stash references can be validated.`,
        );
        return;
    }

    const stash = resource.json.stash;
    const stashContext = `World seed ${resource.entry.resourceId} stash`;

    if (!isRecord(stash)) {
        addFailure(
            failures,
            resource.entry,
            `${stashContext} must be an object so the catalog can verify starter stash deck and item references.`,
        );
        return;
    }

    validateRequiredStarterStashStringField(
        resource.entry,
        stash,
        'stashId',
        stashContext,
        'the starter stash identity',
        failures,
    );

    const deckRef = readReferenceId(resource.entry, stash, 'deckRef', stashContext, failures);

    if (deckRef) {
        validateRegisteredIdReference(
            registries.decks,
            resource.entry,
            `${stashContext}.deckRef`,
            'deck',
            deckRef,
            failures,
        );
    }

    validateStarterStashItems(resource, stash.items, stashContext, registries, failures);
    validateNonNegativeIntegerValue(
        resource.entry,
        stash.spiritStones,
        `${stashContext}.spiritStones`,
        failures,
    );
}

function validateRequiredStarterStashStringField(
    ownerEntry: ContentCatalogEntry,
    record: Record<string, unknown>,
    field: string,
    context: string,
    purpose: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
        return;
    }

    addFailure(
        failures,
        ownerEntry,
        `${context}.${field} must be a non-empty string so the catalog can verify ${purpose}.`,
    );
}

function validateStarterStashItems(
    resource: CatalogIdResource,
    value: unknown,
    stashContext: string,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!Array.isArray(value)) {
        addFailure(
            failures,
            resource.entry,
            `${stashContext}.items must be an array so the catalog can verify starter stash item references.`,
        );
        return;
    }

    value.forEach((stack, index) => {
        const stackContext = `${stashContext}.items[${index}]`;

        if (!isRecord(stack)) {
            addFailure(
                failures,
                resource.entry,
                `${stackContext} must be an object so the catalog can verify its starter stash item ID.`,
            );
            return;
        }

        const itemId = readReferenceId(resource.entry, stack, 'id', stackContext, failures);
        const itemType = readStarterStashItemType(resource.entry, stack, stackContext, failures);
        validatePositiveIntegerValue(resource.entry, stack.count, `${stackContext}.count`, failures);

        if (!itemId) {
            return;
        }

        const itemLocation = validateRegisteredIdReference(
            registries.worldItems,
            resource.entry,
            `${stackContext}.id`,
            'world item',
            itemId,
            failures,
        );

        if (!itemLocation) {
            return;
        }

        validateCanonicalStarterStashItemLocation(resource.entry, stackContext, itemId, itemLocation, failures);

        if (itemType && itemLocation.itemType && itemLocation.itemType !== itemType) {
            addFailure(
                failures,
                resource.entry,
                `${stackContext}.itemType is ${itemType}, but item ${itemId} is declared as ${itemLocation.itemType} in ${formatCatalogIdLocation(itemLocation)}.`,
            );
        }
    });
}

function readStarterStashItemType(
    ownerEntry: ContentCatalogEntry,
    record: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): StashItemType | undefined {
    const value = record.itemType;

    if (typeof value === 'string' && (STASH_ITEM_TYPE_VALUES as readonly string[]).includes(value)) {
        return value as StashItemType;
    }

    addFailure(
        failures,
        ownerEntry,
        `${context}.itemType must be one of: ${formatAllowedValues(STASH_ITEM_TYPE_VALUES)}.`,
    );
    return undefined;
}

function validateCanonicalStarterStashItemLocation(
    ownerEntry: ContentCatalogEntry,
    context: string,
    itemId: string,
    itemLocation: CatalogIdLocation,
    failures: ContentCatalogValidationFailure[],
): void {
    if (
        itemLocation.resourceId === CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID
        && itemLocation.publicPath === CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH
    ) {
        return;
    }

    addFailure(
        failures,
        ownerEntry,
        `${context}.id references world item id ${itemId}, but starter stash items must be declared by canonical ${CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH}; found ${formatCatalogIdLocation(itemLocation)}.`,
    );
}

function validatePositiveIntegerValue(
    ownerEntry: ContentCatalogEntry,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return;
    }

    addFailure(failures, ownerEntry, `${context} must be a positive integer.`);
}

function validateNonNegativeIntegerValue(
    ownerEntry: ContentCatalogEntry,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return;
    }

    addFailure(failures, ownerEntry, `${context} must be a non-negative integer.`);
}

function validateCanonicalWorldItemRegistryShape(
    resource: CatalogIdResource,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        addFailure(
            failures,
            resource.entry,
            `World item seed ${resource.entry.resourceId} in ${resource.entry.publicPath} must be an object.`,
        );
        return;
    }

    for (const { collectionName } of WORLD_ITEM_COLLECTIONS) {
        const collection = resource.json[collectionName];

        if (collection === undefined || Array.isArray(collection)) {
            continue;
        }

        addFailure(
            failures,
            resource.entry,
            `World item seed ${resource.entry.resourceId} ${collectionName} in ${resource.entry.publicPath} must be an array when present.`,
        );
    }
}

function validateRegisteredIdReference(
    registry: Map<string, CatalogIdLocation>,
    ownerEntry: ContentCatalogEntry,
    context: string,
    registryName: CatalogIdRegistryName,
    id: string,
    failures: ContentCatalogValidationFailure[],
): CatalogIdLocation | undefined {
    const location = registry.get(id);

    if (!location) {
        reportMissingRegistryId(ownerEntry, context, registryName, id, failures);
        return undefined;
    }

    return location;
}

function readReferenceId(
    ownerEntry: ContentCatalogEntry,
    record: Record<string, unknown>,
    field: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    addFailure(
        failures,
        ownerEntry,
        `${context}.${field} must be a non-empty string so the catalog can verify the content ID reference.`,
    );
    return undefined;
}

function validateDeckCardReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    if (!Array.isArray(resource.json.cards)) {
        addFailure(
            failures,
            resource.entry,
            `Deck ${resource.entry.resourceId} must declare a cards array so the catalog can verify deck card IDs.`,
        );
        return;
    }

    resource.json.cards.forEach((value, index) => {
        const stackContext = `Deck ${resource.entry.resourceId} cards[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `${stackContext} must be an object so the catalog can verify its card ID.`,
            );
            return;
        }

        const cardId = readReferenceId(resource.entry, value, 'id', stackContext, failures);

        if (!cardId) {
            return;
        }

        validateRegisteredIdReference(
            registries.cards,
            resource.entry,
            `${stackContext}.id`,
            'card',
            cardId,
            failures,
        );
    });
}

function validateEncounterEnemyCardReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    if (!Array.isArray(resource.json.enemies)) {
        addFailure(
            failures,
            resource.entry,
            `Encounter ${resource.entry.resourceId} must declare an enemies array so the catalog can verify enemy card IDs.`,
        );
        return;
    }

    resource.json.enemies.forEach((value, index) => {
        const enemyContext = `Encounter ${resource.entry.resourceId} enemies[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `${enemyContext} must be an object so the catalog can verify its card ID.`,
            );
            return;
        }

        const cardId = readReferenceId(resource.entry, value, 'cardId', enemyContext, failures);

        if (!cardId) {
            return;
        }

        validateRegisteredIdReference(
            registries.cards,
            resource.entry,
            `${enemyContext}.cardId`,
            'card',
            cardId,
            failures,
        );
    });
}

function validateExpeditionEventRewardReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json) || !isRecord(resource.json.eventsByNodeId)) {
        return;
    }

    for (const [nodeId, definition] of Object.entries(resource.json.eventsByNodeId)) {
        if (!isRecord(definition) || !Array.isArray(definition.pool)) {
            continue;
        }

        definition.pool.forEach((outcome, outcomeIndex) => {
            if (!isRecord(outcome)) {
                return;
            }

            validateRewardBundleReferences(
                resource.entry,
                outcome.rewards,
                `Expedition events ${resource.entry.resourceId} eventsByNodeId.${nodeId}.pool[${outcomeIndex}].rewards`,
                registries,
                failures,
            );
        });
    }
}

function validateExpeditionShopRewardReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json) || !isRecord(resource.json.shopsByNodeId)) {
        return;
    }

    for (const [nodeId, definition] of Object.entries(resource.json.shopsByNodeId)) {
        if (!isRecord(definition) || !Array.isArray(definition.offers)) {
            continue;
        }

        definition.offers.forEach((offer, offerIndex) => {
            if (!isRecord(offer)) {
                return;
            }

            validateRewardBundleReferences(
                resource.entry,
                offer.rewards,
                `Expedition shop ${resource.entry.resourceId} shopsByNodeId.${nodeId}.offers[${offerIndex}].rewards`,
                registries,
                failures,
            );
        });
    }
}

function validateRewardBundleReferences(
    ownerEntry: ContentCatalogEntry,
    value: unknown,
    context: string,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(value)) {
        return;
    }

    validateRewardCardReferences(ownerEntry, value.cards, `${context}.cards`, registries, failures);
    validateRewardItemReferences(ownerEntry, value.items, `${context}.items`, registries, failures);
}

function validateRewardCardReferences(
    ownerEntry: ContentCatalogEntry,
    value: unknown,
    context: string,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!Array.isArray(value)) {
        return;
    }

    value.forEach((stack, index) => {
        const stackContext = `${context}[${index}]`;

        if (!isRecord(stack)) {
            addFailure(
                failures,
                ownerEntry,
                `${stackContext} must be an object so the catalog can verify its card ID.`,
            );
            return;
        }

        const cardId = readReferenceId(ownerEntry, stack, 'id', stackContext, failures);

        if (!cardId) {
            return;
        }

        validateRegisteredIdReference(
            registries.cards,
            ownerEntry,
            `${stackContext}.id`,
            'card',
            cardId,
            failures,
        );
    });
}

function validateRewardItemReferences(
    ownerEntry: ContentCatalogEntry,
    value: unknown,
    context: string,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!Array.isArray(value)) {
        return;
    }

    value.forEach((stack, index) => {
        const stackContext = `${context}[${index}]`;

        if (!isRecord(stack)) {
            addFailure(
                failures,
                ownerEntry,
                `${stackContext} must be an object so the catalog can verify its world item ID.`,
            );
            return;
        }

        const itemId = readReferenceId(ownerEntry, stack, 'id', stackContext, failures);

        if (!itemId) {
            return;
        }

        validateRegisteredIdReference(
            registries.worldItems,
            ownerEntry,
            `${stackContext}.id`,
            'world item',
            itemId,
            failures,
        );
    });
}

export function validateCatalogContentIdReferences(
    resources: Iterable<CatalogIdResource>,
    failures: ContentCatalogValidationFailure[],
): void {
    const resourceList = [...resources];
    const registries = buildContentIdRegistries(resourceList, failures);

    validateContentIdReferences(resourceList, registries, failures);
}
