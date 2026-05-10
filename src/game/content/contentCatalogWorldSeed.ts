import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import { addFailure, isRecord } from './contentCatalogValidationIndex';

export const CANONICAL_INITIAL_STATE_RESOURCE_ID = 'world.seed.initial-state';
export const CANONICAL_INITIAL_STATE_PUBLIC_PATH = 'data/world/initial-state.json';
export const CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID = 'world.seed.items-artifacts';
export const CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH = 'data/world/items.artifacts.json';

const STASH_ITEM_TYPE_VALUES = ['artifact', 'tool', 'consumable', 'quest'] as const;
const WORLD_ITEM_COLLECTIONS = [
    { collectionName: 'artifacts', itemType: 'artifact' },
    { collectionName: 'tools', itemType: 'tool' },
    { collectionName: 'consumables', itemType: 'consumable' },
    { collectionName: 'quests', itemType: 'quest' },
    { collectionName: 'questItems', itemType: 'quest' },
] as const;

type WorldSeedRegistryName = 'deck' | 'world item';
type StashItemType = typeof STASH_ITEM_TYPE_VALUES[number];

export interface WorldSeedCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

export interface WorldSeedCatalogIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
}

export interface WorldItemIdLocation extends WorldSeedCatalogIdLocation {
    itemType: StashItemType;
}

export type WorldItemIdRegistry = Map<string, WorldItemIdLocation>;

export interface CanonicalWorldSeedReferenceRegistries {
    decks: Map<string, WorldSeedCatalogIdLocation>;
    worldItems: WorldItemIdRegistry;
}

function formatAllowedValues(values: readonly string[]): string {
    return values.join(', ');
}

function formatWorldSeedCatalogIdLocation(location: WorldSeedCatalogIdLocation): string {
    return `${location.resourceId} ${location.context} in ${location.publicPath}`;
}

function readRegistryStringId(
    resource: WorldSeedCatalogResource,
    record: Record<string, unknown>,
    context: string,
    registryName: 'world item',
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

function validateCanonicalWorldSeedCatalogEntry(
    resource: WorldSeedCatalogResource,
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

function getCanonicalWorldSeedPublicPath(resourceId: string): string | undefined {
    if (resourceId === CANONICAL_INITIAL_STATE_RESOURCE_ID) {
        return CANONICAL_INITIAL_STATE_PUBLIC_PATH;
    }

    if (resourceId === CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID) {
        return CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH;
    }

    return undefined;
}

export function validateCanonicalWorldSeedCatalogEntries(
    resources: Iterable<WorldSeedCatalogResource>,
    failures: ContentCatalogValidationFailure[],
): Set<string> {
    const invalidResourceIds = new Set<string>();

    for (const resource of resources) {
        const expectedPublicPath = getCanonicalWorldSeedPublicPath(resource.entry.resourceId);

        if (
            expectedPublicPath
            && !validateCanonicalWorldSeedCatalogEntry(resource, expectedPublicPath, failures)
        ) {
            invalidResourceIds.add(resource.entry.resourceId);
        }
    }

    return invalidResourceIds;
}

export function registerWorldItemIds(
    resource: WorldSeedCatalogResource,
    registry: WorldItemIdRegistry,
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

            registerWorldItemId(resource, registry, id, itemType, context, failures);
        });
    }
}

function registerWorldItemId(
    resource: WorldSeedCatalogResource,
    registry: WorldItemIdRegistry,
    id: string,
    itemType: StashItemType,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: WorldItemIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
        itemType,
    };
    const existing = registry.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog world item id ${id} is declared more than once: ${formatWorldSeedCatalogIdLocation(existing)}; duplicate ${formatWorldSeedCatalogIdLocation(location)}.`,
        );
        return;
    }

    registry.set(id, location);
}

export function validateCanonicalWorldSeedReferences(
    resource: WorldSeedCatalogResource,
    registries: CanonicalWorldSeedReferenceRegistries,
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
    resource: WorldSeedCatalogResource,
    registries: CanonicalWorldSeedReferenceRegistries,
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
    resource: WorldSeedCatalogResource,
    value: unknown,
    stashContext: string,
    registries: CanonicalWorldSeedReferenceRegistries,
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

        if (itemType && itemLocation.itemType !== itemType) {
            addFailure(
                failures,
                resource.entry,
                `${stackContext}.itemType is ${itemType}, but item ${itemId} is declared as ${itemLocation.itemType} in ${formatWorldSeedCatalogIdLocation(itemLocation)}.`,
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
    itemLocation: WorldSeedCatalogIdLocation,
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
        `${context}.id references world item id ${itemId}, but starter stash items must be declared by canonical ${CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH}; found ${formatWorldSeedCatalogIdLocation(itemLocation)}.`,
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
    resource: WorldSeedCatalogResource,
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

function reportMissingRegistryId(
    ownerEntry: ContentCatalogEntry,
    context: string,
    registryName: WorldSeedRegistryName,
    id: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        ownerEntry,
        `${context} references ${registryName} id ${id}, but no catalog ${registryName} resource declares that id.`,
    );
}

function validateRegisteredIdReference<TLocation extends WorldSeedCatalogIdLocation>(
    registry: Map<string, TLocation>,
    ownerEntry: ContentCatalogEntry,
    context: string,
    registryName: WorldSeedRegistryName,
    id: string,
    failures: ContentCatalogValidationFailure[],
): TLocation | undefined {
    const location = registry.get(id);

    if (!location) {
        reportMissingRegistryId(ownerEntry, context, registryName, id, failures);
        return undefined;
    }

    return location;
}
