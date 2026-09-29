import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import { addFailure, isRecord } from './contentCatalogValidationIndex';

export const CANONICAL_REALM_PRESETS_RESOURCE_ID = 'config.realm-presets';
export const CANONICAL_REALM_PRESETS_PUBLIC_PATH = 'data/config/realm-presets.json';
export const CANONICAL_REALM_REGISTRY_RESOURCE_ID = 'config.combat-baseline';
export const CANONICAL_REALM_REGISTRY_PUBLIC_PATH = 'data/config/combat-baseline.json';
export const CANONICAL_GRADE_REGISTRY_RESOURCE_ID = 'config.artifact-grade';
export const CANONICAL_GRADE_REGISTRY_PUBLIC_PATH = 'data/config/artifact-grade.json';

const MAX_ARTIFACT_STAR = 12;

export interface CanonicalConfigCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

export interface CanonicalConfigIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
}

export interface CanonicalContentIdRegistry {
    ids: Map<string, CanonicalConfigIdLocation>;
    resourceId: string;
    publicPath: string;
    collectionName: string;
    registryName: 'realm' | 'grade';
    cardKindName: 'unit' | 'artifact';
    referenceField: 'realmId' | 'gradeId';
    isPresent: boolean;
    missingReported: boolean;
}

export interface CanonicalNumericValueRegistry {
    values: Map<number, CanonicalConfigIdLocation>;
    resourceId: string;
    publicPath: string;
    isPresent: boolean;
}

export interface CanonicalConfigRegistries {
    realmPresetValues: CanonicalNumericValueRegistry;
    realms: CanonicalContentIdRegistry;
    grades: CanonicalContentIdRegistry;
    invalidResourceIds: Set<string>;
}

function formatCanonicalConfigLocation(location: CanonicalConfigIdLocation): string {
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

export function createCanonicalConfigRegistries(): CanonicalConfigRegistries {
    return {
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
        invalidResourceIds: new Set(),
    };
}

function validateCanonicalConfigCatalogEntry(
    resource: CanonicalConfigCatalogResource,
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

function readRegistryStringId(
    resource: CanonicalConfigCatalogResource,
    record: Record<string, unknown>,
    context: string,
    registryName: 'realm' | 'grade',
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
    resource: CanonicalConfigCatalogResource,
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
    resource: CanonicalConfigCatalogResource,
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
    resource: CanonicalConfigCatalogResource,
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
    resource: CanonicalConfigCatalogResource,
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
    resource: CanonicalConfigCatalogResource,
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

function registerCatalogId(
    registry: Map<string, CanonicalConfigIdLocation>,
    registryName: 'realm' | 'grade',
    resource: CanonicalConfigCatalogResource,
    id: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: CanonicalConfigIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registryName} id ${id} is declared more than once: ${formatCanonicalConfigLocation(existing)}; duplicate ${formatCanonicalConfigLocation(location)}.`,
        );
        return;
    }

    registry.set(id, location);
}

function registerCatalogNumericValue(
    registry: Map<number, CanonicalConfigIdLocation>,
    registryName: string,
    resource: CanonicalConfigCatalogResource,
    value: number,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: CanonicalConfigIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(value);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog ${registryName} value ${value} is declared more than once: ${formatCanonicalConfigLocation(existing)}; duplicate ${formatCanonicalConfigLocation(location)}.`,
        );
        return;
    }

    registry.set(value, location);
}

function validateCanonicalRealmPresetsConfig(
    resource: CanonicalConfigCatalogResource,
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
    resource: CanonicalConfigCatalogResource,
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

    const values = new Map<number, CanonicalConfigIdLocation>();

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
    resource: CanonicalConfigCatalogResource,
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

    const values = new Map<number, CanonicalConfigIdLocation>();

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

export function buildCanonicalConfigRegistries(
    resources: Iterable<CanonicalConfigCatalogResource>,
    failures: ContentCatalogValidationFailure[],
): CanonicalConfigRegistries {
    const resourceList = [...resources];
    const registries = createCanonicalConfigRegistries();

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_REALM_PRESETS_RESOURCE_ID) {
            registries.realmPresetValues.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_REALM_PRESETS_PUBLIC_PATH, failures)) {
                validateCanonicalRealmPresetsConfig(resource, registries.realmPresetValues, failures);
            } else {
                registries.invalidResourceIds.add(resource.entry.resourceId);
            }
        }
    }

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_REALM_REGISTRY_RESOURCE_ID) {
            registries.realms.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_REALM_REGISTRY_PUBLIC_PATH, failures)) {
                validateCanonicalCombatBaselineConfig(resource, registries.realms, registries.realmPresetValues, failures);
            } else {
                registries.invalidResourceIds.add(resource.entry.resourceId);
            }
        }
    }

    for (const resource of resourceList) {
        if (resource.entry.resourceId === CANONICAL_GRADE_REGISTRY_RESOURCE_ID) {
            registries.grades.isPresent = true;

            if (validateCanonicalConfigCatalogEntry(resource, CANONICAL_GRADE_REGISTRY_PUBLIC_PATH, failures)) {
                validateCanonicalArtifactGradeConfig(resource, registries.grades, failures);
            } else {
                registries.invalidResourceIds.add(resource.entry.resourceId);
            }
        }
    }

    return registries;
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
): CanonicalConfigIdLocation | undefined {
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

export function validateCardRealmAndGradeReferences(
    resource: CanonicalConfigCatalogResource,
    registries: CanonicalConfigRegistries,
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
