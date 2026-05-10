import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import { addFailure, isRecord } from './contentCatalogValidationIndex';
import type {
    StackConsumeType,
    StatusCategory,
    StatusEffectType,
    StatusTiming,
} from '@data/types/status';

export const CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH = 'data/config/status-definitions.json';

const STATUS_CATEGORY_VALUES = ['buff', 'debuff', 'special'] as const satisfies readonly StatusCategory[];
const STATUS_TIMING_VALUES = [
    'turnStart',
    'turnEnd',
    'onDamaged',
    'onAttack',
    'onBeAttacked',
    'persistent',
] as const satisfies readonly StatusTiming[];
const STATUS_EFFECT_TYPE_VALUES = [
    'damage',
    'heal',
    'modifyAttack',
    'modifyDefense',
    'amplifyDamage',
    'reduceDamage',
    'preventAction',
    'preventSkill',
    'taunt',
    'stealth',
    'mark',
] as const satisfies readonly StatusEffectType[];
const STATUS_STACK_CONSUME_TYPE_VALUES = [
    'onTrigger',
    'onDamage',
    'allAtOnce',
    'none',
] as const satisfies readonly StackConsumeType[];

export interface StatusDefinitionCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

export interface StatusDefinitionIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
}

export type StatusDefinitionIdRegistry = Map<string, StatusDefinitionIdLocation>;

export function isCanonicalStatusDefinitionsCatalogResource(
    resource: StatusDefinitionCatalogResource,
): boolean {
    return resource.entry.kind === 'status'
        && resource.entry.publicPath === CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH;
}

function formatStatusDefinitionIdLocation(location: StatusDefinitionIdLocation): string {
    return `${location.resourceId} ${location.context} in ${location.publicPath}`;
}

function formatAllowedValues(values: readonly string[]): string {
    return values.join(', ');
}

function readStatusDefinitionRegistryStringId(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    if (typeof record.id === 'string' && record.id.trim().length > 0) {
        return record.id;
    }

    addFailure(
        failures,
        resource.entry,
        `Catalog status entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must declare a non-empty string id.`,
    );
    return undefined;
}

function registerStatusDefinitionId(
    registry: StatusDefinitionIdRegistry,
    resource: StatusDefinitionCatalogResource,
    id: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: StatusDefinitionIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog status id ${id} is declared more than once: ${formatStatusDefinitionIdLocation(existing)}; duplicate ${formatStatusDefinitionIdLocation(location)}.`,
        );
        return;
    }

    registry.set(id, location);
}

function addStatusDefinitionShapeFailure(
    resource: StatusDefinitionCatalogResource,
    context: string,
    field: string,
    expectation: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        resource.entry,
        `${context} in ${resource.entry.publicPath} ${field} ${expectation}.`,
    );
}

function validateRequiredStatusStringField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a non-empty string', failures);
}

function validateRequiredStatusVocabularyField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    allowedValues: readonly string[],
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'string' && allowedValues.includes(value)) {
        return;
    }

    addStatusDefinitionShapeFailure(
        resource,
        context,
        field,
        `must be one of: ${formatAllowedValues(allowedValues)}`,
        failures,
    );
}

function validateRequiredFiniteNumberField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'number' && Number.isFinite(value)) {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a finite number', failures);
}

function validateRequiredBooleanField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (typeof record[field] === 'boolean') {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a boolean', failures);
}

function validateOptionalBooleanField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || typeof value === 'boolean') {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a boolean when present', failures);
}

function validateRequiredPositiveIntegerField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a positive integer', failures);
}

function validateOptionalNonNegativeIntegerField(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
        return;
    }

    addStatusDefinitionShapeFailure(resource, context, field, 'must be a non-negative integer when present', failures);
}

function validateCanonicalStatusDefinitionShape(
    resource: StatusDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    id: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const definitionContext = `Catalog status definition ${resource.entry.resourceId} ${context} ${id}`;

    validateRequiredStatusStringField(resource, record, definitionContext, 'name', failures);
    validateRequiredStatusStringField(resource, record, definitionContext, 'description', failures);
    validateRequiredStatusVocabularyField(
        resource,
        record,
        definitionContext,
        'category',
        STATUS_CATEGORY_VALUES,
        failures,
    );
    validateRequiredStatusVocabularyField(
        resource,
        record,
        definitionContext,
        'timing',
        STATUS_TIMING_VALUES,
        failures,
    );
    validateRequiredStatusVocabularyField(
        resource,
        record,
        definitionContext,
        'effectType',
        STATUS_EFFECT_TYPE_VALUES,
        failures,
    );
    validateRequiredStatusVocabularyField(
        resource,
        record,
        definitionContext,
        'stackConsumeType',
        STATUS_STACK_CONSUME_TYPE_VALUES,
        failures,
    );
    validateRequiredFiniteNumberField(resource, record, definitionContext, 'baseValue', failures);
    validateOptionalBooleanField(resource, record, definitionContext, 'ignoreArmor', failures);
    validateOptionalBooleanField(resource, record, definitionContext, 'affectedByArmor', failures);
    validateRequiredStatusStringField(resource, record, definitionContext, 'icon', failures);
    validateRequiredStatusStringField(resource, record, definitionContext, 'color', failures);
    validateRequiredBooleanField(resource, record, definitionContext, 'stackable', failures);
    validateRequiredPositiveIntegerField(resource, record, definitionContext, 'maxStacks', failures);
    validateOptionalNonNegativeIntegerField(resource, record, definitionContext, 'defaultDuration', failures);
}

export function registerCanonicalStatusDefinitionIds(
    resource: StatusDefinitionCatalogResource,
    registry: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    if (!Array.isArray(resource.json.statuses)) {
        addFailure(
            failures,
            resource.entry,
            `Catalog status resource ${resource.entry.resourceId} in ${resource.entry.publicPath} must declare a top-level statuses array.`,
        );
        return;
    }

    resource.json.statuses.forEach((value, index) => {
        const context = `statuses[${index}]`;

        if (!isRecord(value)) {
            addFailure(
                failures,
                resource.entry,
                `Catalog status entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must be an object.`,
            );
            return;
        }

        const id = readStatusDefinitionRegistryStringId(resource, value, context, failures);

        if (!id) {
            return;
        }

        validateCanonicalStatusDefinitionShape(resource, value, context, id, failures);
        registerStatusDefinitionId(registry, resource, id, context, failures);
    });
}

export function validateStatusDefinitionIdReference(
    registry: StatusDefinitionIdRegistry,
    ownerEntry: ContentCatalogEntry,
    context: string,
    id: string,
    failures: ContentCatalogValidationFailure[],
): StatusDefinitionIdLocation | undefined {
    const location = registry.get(id);

    if (!location) {
        addFailure(
            failures,
            ownerEntry,
            `${context} references status id ${id}, but canonical ${CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH} does not declare that id.`,
        );
        return undefined;
    }

    return location;
}

function readStatusDefinitionReferenceId(
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

export function validateCardLegacyApplyStatusReferences(
    resource: StatusDefinitionCatalogResource,
    registry: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json)) {
        return;
    }

    for (const [collectionName, collection] of Object.entries(resource.json)) {
        if (!Array.isArray(collection)) {
            continue;
        }

        collection.forEach((value, cardIndex) => {
            if (!isRecord(value)) {
                return;
            }

            const cardId = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : undefined;
            const cardContext = `Card ${resource.entry.resourceId} ${collectionName}[${cardIndex}]${cardId ? ` ${cardId}` : ''}`;

            if (!Array.isArray(value.effects)) {
                return;
            }

            value.effects.forEach((effect, effectIndex) => {
                if (!isRecord(effect) || !Array.isArray(effect.actions)) {
                    return;
                }

                effect.actions.forEach((action, actionIndex) => {
                    if (!isRecord(action) || action.type !== 'applyStatus') {
                        return;
                    }

                    const actionContext = `${cardContext} effects[${effectIndex}].actions[${actionIndex}]`;
                    const statusId = readStatusDefinitionReferenceId(
                        resource.entry,
                        action,
                        'statusId',
                        actionContext,
                        failures,
                    );

                    if (!statusId) {
                        return;
                    }

                    validateStatusDefinitionIdReference(
                        registry,
                        resource.entry,
                        `${actionContext}.statusId`,
                        statusId,
                        failures,
                    );
                });
            });
        });
    }
}