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

type CatalogIdRegistryName = 'card' | 'deck' | 'world item' | 'realm' | 'grade';

const CANONICAL_INITIAL_STATE_RESOURCE_ID = 'world.seed.initial-state';
const CANONICAL_INITIAL_STATE_PUBLIC_PATH = 'data/world/initial-state.json';
const CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID = 'world.seed.items-artifacts';
const CANONICAL_WORLD_ITEM_REGISTRY_PUBLIC_PATH = 'data/world/items.artifacts.json';
const CANONICAL_REALM_PRESETS_RESOURCE_ID = 'config.realm-presets';
const CANONICAL_REALM_PRESETS_PUBLIC_PATH = 'data/config/realm-presets.json';
const CANONICAL_REALM_REGISTRY_RESOURCE_ID = 'config.combat-baseline';
const CANONICAL_REALM_REGISTRY_PUBLIC_PATH = 'data/config/combat-baseline.json';
const CANONICAL_GRADE_REGISTRY_RESOURCE_ID = 'config.artifact-grade';
const CANONICAL_GRADE_REGISTRY_PUBLIC_PATH = 'data/config/artifact-grade.json';
const MAX_ARTIFACT_STAR = 12;
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
    realmPresetValues: CanonicalNumericValueRegistry;
    realms: CanonicalContentIdRegistry;
    grades: CanonicalContentIdRegistry;
    worldItems: Map<string, CatalogIdLocation>;
    invalidCanonicalConfigResourceIds: Set<string>;
    invalidCanonicalWorldSeedResourceIds: Set<string>;
}

interface CanonicalContentIdRegistry {
    ids: Map<string, CatalogIdLocation>;
    resourceId: string;
    publicPath: string;
    collectionName: string;
    registryName: 'realm' | 'grade';
    cardKindName: 'unit' | 'artifact';
    referenceField: 'realmId' | 'gradeId';
    isPresent: boolean;
    missingReported: boolean;
}

interface CanonicalNumericValueRegistry {
    values: Map<number, CatalogIdLocation>;
    resourceId: string;
    publicPath: string;
    isPresent: boolean;
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

function createCanonicalContentIdRegistry(
    resourceId: string,
    publicPath: string,
    collectionName: string,
    registryName: 'realm' | 'grade',
    cardKindName: 'unit' | 'artifact',
    referenceField: 'realmId' | 'gradeId',
): CanonicalContentIdRegistry {
    return {
        ids: new Map(),
        resourceId,
        publicPath,
        collectionName,
        registryName,
        cardKindName,
        referenceField,
        isPresent: false,
        missingReported: false,
    };
}

function createCanonicalNumericValueRegistry(
    resourceId: string,
    publicPath: string,
): CanonicalNumericValueRegistry {
    return {
        values: new Map(),
        resourceId,
        publicPath,
        isPresent: false,
    };
}

function validateCanonicalConfigCatalogEntry(
    resource: CatalogIdResource,
    expectedPublicPath: string,
    failures: ContentCatalogValidationFailure[],
): boolean {
    let isValid = true;

    if (resource.entry.kind !== 'config') {
        addFailure(
            failures,
            resource.entry,
            `Catalog canonical config ${resource.entry.resourceId} must have kind config; found ${resource.entry.kind}.`,
        );
        isValid = false;
    }

    if (resource.entry.publicPath !== expectedPublicPath) {
        addFailure(
            failures,
            resource.entry,
            `Catalog canonical config ${resource.entry.resourceId} must use publicPath ${expectedPublicPath}; found ${resource.entry.publicPath}.`,
        );
        isValid = false;
    }

    return isValid;
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

function addCanonicalConfigShapeFailure(
    resource: CatalogIdResource,
    subject: string,
    context: string,
    message: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        resource.entry,
        `Catalog ${subject} ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} ${message}.`,
    );
}

function validateCanonicalStringField(
    resource: CatalogIdResource,
    record: Record<string, unknown>,
    subject: string,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (typeof record[field] === 'string') {
        return;
    }

    addCanonicalConfigShapeFailure(resource, subject, context, `${field} must be a string`, failures);
}

function readCanonicalNonNegativeNumberField(
    resource: CatalogIdResource,
    record: Record<string, unknown>,
    subject: string,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): number | undefined {
    const value = record[field];

    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value;
    }

    addCanonicalConfigShapeFailure(
        resource,
        subject,
        context,
        `${field} must be a finite non-negative number`,
        failures,
    );
    return undefined;
}

function readCanonicalArtifactStarField(
    resource: CatalogIdResource,
    record: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): number | undefined {
    const value = record.star;

    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ARTIFACT_STAR) {
        return value;
    }

    addCanonicalConfigShapeFailure(
        resource,
        'artifact grade',
        context,
        `star must be an integer between 1 and ${MAX_ARTIFACT_STAR}`,
        failures,
    );
    return undefined;
}

function validateCanonicalMinMaxFields(
    resource: CatalogIdResource,
    subject: string,
    context: string,
    minField: string,
    maxField: string,
    minValue: number | undefined,
    maxValue: number | undefined,
    failures: ContentCatalogValidationFailure[],
): void {
    if (minValue === undefined || maxValue === undefined || minValue <= maxValue) {
        return;
    }

    addCanonicalConfigShapeFailure(
        resource,
        subject,
        context,
        `${minField} must be <= ${maxField}`,
        failures,
    );
}

function registerCatalogNumericValue(
    registry: Map<number, CatalogIdLocation>,
    registryName: string,
    resource: CatalogIdResource,
    value: number,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: CatalogIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(value);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registryName} value ${value} is declared more than once: ${formatCatalogIdLocation(existing)}; duplicate ${formatCatalogIdLocation(location)}.`,
        );
        return;
    }

    registry.set(value, location);
}

function formatAllowedValues(values: readonly string[]): string {
    return values.join(', ');
}

function buildContentIdRegistries(
    resources: Iterable<CatalogIdResource>,
    failures: ContentCatalogValidationFailure[],
): ContentIdRegistries {
    const resourceList = [...resources];
    const registries: ContentIdRegistries = {
        cards: new Map(),
        decks: new Map(),
        gongfa: new Map(),
        statuses: new Map(),
        realmPresetValues: createCanonicalNumericValueRegistry(
            CANONICAL_REALM_PRESETS_RESOURCE_ID,
            CANONICAL_REALM_PRESETS_PUBLIC_PATH,
        ),
        realms: createCanonicalContentIdRegistry(
            CANONICAL_REALM_REGISTRY_RESOURCE_ID,
            CANONICAL_REALM_REGISTRY_PUBLIC_PATH,
            'realms',
            'realm',
            'unit',
            'realmId',
        ),
        grades: createCanonicalContentIdRegistry(
            CANONICAL_GRADE_REGISTRY_RESOURCE_ID,
            CANONICAL_GRADE_REGISTRY_PUBLIC_PATH,
            'grades',
            'grade',
            'artifact',
            'gradeId',
        ),
        worldItems: new Map(),
        invalidCanonicalConfigResourceIds: new Set(),
        invalidCanonicalWorldSeedResourceIds: new Set(),
    };

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_REALM_PRESETS_RESOURCE_ID) {
            registries.realmPresetValues.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_REALM_PRESETS_PUBLIC_PATH, failures)) {
                validateCanonicalRealmPresetsConfig(resource, registries.realmPresetValues, failures);
            } else {
                registries.invalidCanonicalConfigResourceIds.add(resource.entry.resourceId);
            }
        }
    }

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_REALM_REGISTRY_RESOURCE_ID) {
            registries.realms.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_REALM_REGISTRY_PUBLIC_PATH, failures)) {
                validateCanonicalCombatBaselineConfig(resource, registries.realms, registries.realmPresetValues, failures);
            } else {
                registries.invalidCanonicalConfigResourceIds.add(resource.entry.resourceId);
            }
        }
    }

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_GRADE_REGISTRY_RESOURCE_ID) {
            registries.grades.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_GRADE_REGISTRY_PUBLIC_PATH, failures)) {
                validateCanonicalArtifactGradeConfig(resource, registries.grades, failures);
            } else {
                registries.invalidCanonicalConfigResourceIds.add(resource.entry.resourceId);
            }
        }
    }

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
            registries.invalidCanonicalConfigResourceIds.has(resource.entry.resourceId)
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

function validateCanonicalRealmPresetsConfig(
    resource: CatalogIdResource,
    registry: CanonicalNumericValueRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog realm presets config ${resource.entry.resourceId} in ${resource.entry.publicPath} must be an object.`,
        );
        return;
    }

    if (!Array.isArray(resource.json.realmStages)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog realm presets config ${resource.entry.resourceId} in ${resource.entry.publicPath} must declare a top-level realmStages array.`,
        );
        return;
    }

    resource.json.realmStages.forEach((stageValue, stageIndex) => {
        const stageContext = `realmStages[${stageIndex}]`;

        if (!isRecord(stageValue)) {
            addCanonicalConfigShapeFailure(
                resource,
                'realm preset stage',
                stageContext,
                'must be an object',
                failures,
            );
            return;
        }

        validateCanonicalStringField(resource, stageValue, 'realm preset stage', stageContext, 'stage', failures);

        if (!Array.isArray(stageValue.phases)) {
            addCanonicalConfigShapeFailure(
                resource,
                'realm preset stage',
                stageContext,
                'must declare a phases array',
                failures,
            );
            return;
        }

        stageValue.phases.forEach((phaseValue, phaseIndex) => {
            const phaseContext = `${stageContext}.phases[${phaseIndex}]`;

            if (!isRecord(phaseValue)) {
                addCanonicalConfigShapeFailure(
                    resource,
                    'realm preset phase',
                    phaseContext,
                    'must be an object',
                    failures,
                );
                return;
            }

            validateCanonicalStringField(resource, phaseValue, 'realm preset phase', phaseContext, 'phase', failures);
            const presetValue = readCanonicalNonNegativeNumberField(
                resource,
                phaseValue,
                'realm preset phase',
                phaseContext,
                'value',
                failures,
            );

            if (presetValue !== undefined) {
                registerCatalogNumericValue(
                    registry.values,
                    'realm preset',
                    resource,
                    presetValue,
                    phaseContext,
                    failures,
                );
            }
        });
    });
}

function validateCanonicalCombatBaselineConfig(
    resource: CatalogIdResource,
    registry: CanonicalContentIdRegistry,
    realmPresetValues: CanonicalNumericValueRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registry.registryName} registry ${resource.entry.resourceId} in ${resource.entry.publicPath} must be an object.`,
        );
        return;
    }

    const collection = resource.json[registry.collectionName];

    if (!Array.isArray(collection)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registry.registryName} registry ${resource.entry.resourceId} in ${resource.entry.publicPath} must declare a top-level ${registry.collectionName} array.`,
        );
        return;
    }

    const values = new Map<number, CatalogIdLocation>();

    collection.forEach((value, index) => {
        const context = `${registry.collectionName}[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `Catalog ${registry.registryName} entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
            );
            return;
        }

        const id = readRegistryStringId(resource, value, context, registry.registryName, failures);
        validateCanonicalStringField(resource, value, 'combat baseline realm', context, 'stage', failures);
        validateCanonicalStringField(resource, value, 'combat baseline realm', context, 'phase', failures);
        const realmValue = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'combat baseline realm',
            context,
            'value',
            failures,
        );
        const attackMin = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'combat baseline realm',
            context,
            'attackMin',
            failures,
        );
        const attackMax = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'combat baseline realm',
            context,
            'attackMax',
            failures,
        );
        const healthMin = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'combat baseline realm',
            context,
            'healthMin',
            failures,
        );
        const healthMax = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'combat baseline realm',
            context,
            'healthMax',
            failures,
        );

        validateCanonicalMinMaxFields(
            resource,
            'combat baseline realm',
            context,
            'attackMin',
            'attackMax',
            attackMin,
            attackMax,
            failures,
        );
        validateCanonicalMinMaxFields(
            resource,
            'combat baseline realm',
            context,
            'healthMin',
            'healthMax',
            healthMin,
            healthMax,
            failures,
        );

        if (id) {
            registerCatalogId(registry.ids, registry.registryName, resource, id, context, failures);
        }

        if (realmValue !== undefined) {
            registerCatalogNumericValue(values, 'realm', resource, realmValue, context, failures);

            if (realmPresetValues.isPresent && !realmPresetValues.values.has(realmValue)) {
                addCanonicalConfigShapeFailure(
                    resource,
                    'combat baseline realm',
                    context,
                    `value ${realmValue} is not declared by canonical ${realmPresetValues.publicPath}`,
                    failures,
                );
            }
        }
    });
}

function validateCanonicalArtifactGradeConfig(
    resource: CatalogIdResource,
    registry: CanonicalContentIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registry.registryName} registry ${resource.entry.resourceId} in ${resource.entry.publicPath} must be an object.`,
        );
        return;
    }

    const collection = resource.json[registry.collectionName];

    if (!Array.isArray(collection)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registry.registryName} registry ${resource.entry.resourceId} in ${resource.entry.publicPath} must declare a top-level ${registry.collectionName} array.`,
        );
        return;
    }

    const values = new Map<number, CatalogIdLocation>();

    collection.forEach((value, index) => {
        const context = `${registry.collectionName}[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `Catalog ${registry.registryName} entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
            );
            return;
        }

        const id = readRegistryStringId(resource, value, context, registry.registryName, failures);
        validateCanonicalStringField(resource, value, 'artifact grade', context, 'tier', failures);
        validateCanonicalStringField(resource, value, 'artifact grade', context, 'quality', failures);
        readCanonicalArtifactStarField(resource, value, context, failures);
        const gradeValue = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'artifact grade',
            context,
            'value',
            failures,
        );
        const attackBonusMin = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'artifact grade',
            context,
            'attackBonusMin',
            failures,
        );
        const attackBonusMax = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'artifact grade',
            context,
            'attackBonusMax',
            failures,
        );
        const healthBonusMin = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'artifact grade',
            context,
            'healthBonusMin',
            failures,
        );
        const healthBonusMax = readCanonicalNonNegativeNumberField(
            resource,
            value,
            'artifact grade',
            context,
            'healthBonusMax',
            failures,
        );

        validateCanonicalMinMaxFields(
            resource,
            'artifact grade',
            context,
            'attackBonusMin',
            'attackBonusMax',
            attackBonusMin,
            attackBonusMax,
            failures,
        );
        validateCanonicalMinMaxFields(
            resource,
            'artifact grade',
            context,
            'healthBonusMin',
            'healthBonusMax',
            healthBonusMin,
            healthBonusMax,
            failures,
        );

        if (id) {
            registerCatalogId(registry.ids, registry.registryName, resource, id, context, failures);
        }

        if (gradeValue !== undefined) {
            registerCatalogNumericValue(values, 'grade', resource, gradeValue, context, failures);
        }
    });
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
            registries.invalidCanonicalConfigResourceIds.has(resource.entry.resourceId)
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
            validateCardRealmAndGradeReferences(resource, registries, failures);
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

function reportMissingCanonicalRegistry(
    registry: CanonicalContentIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (registry.missingReported) {
        return;
    }

    registry.missingReported = true;
    addFailure(
        failures,
        {
            resourceId: registry.resourceId,
            publicPath: registry.publicPath,
        },
        `Catalog ${registry.registryName} registry ${registry.resourceId} (${registry.publicPath}) is missing; add it to the content catalog so ${registry.cardKindName} card ${registry.referenceField} references can be verified.`,
    );
}

function validateCanonicalIdReference(
    registry: CanonicalContentIdRegistry,
    ownerEntry: ContentCatalogEntry,
    context: string,
    id: string,
    failures: ContentCatalogValidationFailure[],
): CatalogIdLocation | undefined {
    if (!registry.isPresent) {
        reportMissingCanonicalRegistry(registry, failures);
        return undefined;
    }

    const location = registry.ids.get(id);

    if (!location) {
        addFailure(
            failures,
            ownerEntry,
            `${context} references ${registry.registryName} id ${id}, but canonical ${registry.publicPath} does not declare that id.`,
        );
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

function readCardMetadataReferenceId(
    ownerEntry: ContentCatalogEntry,
    record: Record<string, unknown>,
    field: 'realmId' | 'gradeId',
    context: string,
    referenceName: 'realm' | 'grade',
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    addFailure(
        failures,
        ownerEntry,
        `${context}.${field} must be a non-empty string so the catalog can verify the ${referenceName} reference.`,
    );
    return undefined;
}

function validateCardRealmAndGradeReferences(
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

            if (value.kind === 'unit' || collectionName === 'units') {
                const realmId = readCardMetadataReferenceId(
                    resource.entry,
                    value,
                    'realmId',
                    cardContext,
                    'realm',
                    failures,
                );

                if (realmId) {
                    validateCanonicalIdReference(
                        registries.realms,
                        resource.entry,
                        `${cardContext} realmId`,
                        realmId,
                        failures,
                    );
                }
            }

            if (value.kind === 'artifact' || collectionName === 'artifacts') {
                const gradeId = readCardMetadataReferenceId(
                    resource.entry,
                    value,
                    'gradeId',
                    cardContext,
                    'grade',
                    failures,
                );

                if (gradeId) {
                    validateCanonicalIdReference(
                        registries.grades,
                        resource.entry,
                        `${cardContext} gradeId`,
                        gradeId,
                        failures,
                    );
                }
            }
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
