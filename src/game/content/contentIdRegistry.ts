import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';

type CatalogIdRegistryName = 'card' | 'gongfa' | 'world item';

interface CatalogIdResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

interface CatalogIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
}

interface ContentIdRegistries {
    cards: Map<string, CatalogIdLocation>;
    gongfa: Map<string, CatalogIdLocation>;
    worldItems: Map<string, CatalogIdLocation>;
}

const WORLD_ITEM_COLLECTION_NAMES = ['artifacts', 'tools', 'consumables', 'quests', 'questItems'] as const;

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

function buildContentIdRegistries(
    resources: Iterable<CatalogIdResource>,
    failures: ContentCatalogValidationFailure[],
): ContentIdRegistries {
    const registries: ContentIdRegistries = {
        cards: new Map(),
        gongfa: new Map(),
        worldItems: new Map(),
    };

    for (const resource of resources) {
        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            registerCardIds(resource, registries, failures);
        }

        if (resource.entry.kind === 'gongfa') {
            registerGongfaIds(resource, registries, failures);
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

function registerGongfaIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    if (!Array.isArray(resource.json.gongfa)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog gongfa resource ${resource.entry.resourceId} in ${resource.entry.publicPath} must declare a top-level gongfa array.`,
        );
        return;
    }

    resource.json.gongfa.forEach((value, index) => {
        const context = `gongfa[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `Catalog gongfa entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
            );
            return;
        }

        const id = readRegistryStringId(resource, value, context, 'gongfa', failures);

        if (!id) {
            return;
        }

        registerCatalogId(registries.gongfa, 'gongfa', resource, id, context, failures);
    });
}

function registerWorldItemIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    for (const collectionName of WORLD_ITEM_COLLECTION_NAMES) {
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

            registerCatalogId(registries.worldItems, 'world item', resource, id, context, failures);
        });
    }
}

function validateContentIdReferences(
    resources: Iterable<CatalogIdResource>,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of resources) {
        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            validateCardGongfaReferences(resource, registries, failures);
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

function validateCardGongfaReferences(
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
            if (!isRecord(value)) {
                return;
            }

            const cardId = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : undefined;
            const cardContext = `Card ${resource.entry.resourceId} ${collectionName}[${index}]${cardId ? ` ${cardId}` : ''}`;

            if (value.gongfaIds === undefined) {
                return;
            }

            if (!Array.isArray(value.gongfaIds)) {
                addFailure(
                    failures,
                    resource.entry,
                    `${cardContext} gongfaIds must be a string array so the catalog can verify gongfa references.`,
                );
                return;
            }

            value.gongfaIds.forEach((gongfaId, gongfaIndex) => {
                const context = `${cardContext} gongfaIds[${gongfaIndex}]`;

                if (typeof gongfaId !== 'string' || gongfaId.trim().length === 0) {
                    addFailure(
                        failures,
                        resource.entry,
                        `${context} must be a non-empty string so the catalog can verify the gongfa reference.`,
                    );
                    return;
                }

                validateRegisteredIdReference(
                    registries.gongfa,
                    resource.entry,
                    context,
                    'gongfa',
                    gongfaId,
                    failures,
                );
            });
        });
    }
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
