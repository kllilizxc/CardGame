import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import {
    validateStatusDefinitionIdReference,
    type StatusDefinitionIdRegistry,
} from './contentCatalogStatusDefinitions';
import { addFailure, isRecord } from './contentCatalogValidationIndex';
import type { ArtifactWeaponType } from '@data/types/cards/artifact';

const GONGFA_EVENT_TYPE_VALUES = [
    'TurnStart',
    'TurnEnd',
    'OnSummon',
    'OnDeath',
    'OnAttack',
    'OnKill',
    'OnEquipArtifact',
    'Custom',
] as const;
const GONGFA_EVENT_SIDE_VALUES = ['Ally', 'Enemy', 'Any'] as const;
const GONGFA_CONDITION_TYPE_VALUES = [
    'ArtifactUsedThisTurn',
    'UnitOnField',
    'CardInHand',
    'ArtifactEquipped',
    'Custom',
] as const;
const GONGFA_ACTION_TYPE_VALUES = [
    'RecoverCardFromDiscard',
    'SearchCardFromDeck',
    'DrawCards',
    'DrawAndFilter',
    'ModifyStats',
    'DealDamage',
    'ApplyStatus',
    'ImmediateAttack',
    'GainArmor',
    'AddLog',
    'Custom',
] as const;
const GONGFA_ACTION_DESTINATION_VALUES = ['Hand', 'Field', 'DeckTop', 'DiscardPile'] as const;
const GONGFA_CARD_FILTER_FIELDS = ['kind', 'labelsAnyOf', 'maxStar', 'amount', 'weaponTypesAnyOf'] as const;
const GONGFA_CARD_FILTER_KIND_VALUES = ['unit', 'artifact', 'talisman', 'field'] as const;
const GONGFA_WEAPON_TYPE_VALUES = ['剑', '刀', '鞭', '枪', '锤', '弓', '尺', '印', '棍', '棒', '毒', '琴', '笛子', '拳套', '符箓', '斧头', '匕首', '飞镖', '扇子'] as const satisfies readonly ArtifactWeaponType[];
const GONGFA_DEAL_DAMAGE_TARGET_VALUES = ['singleEnemy', 'allEnemies', 'randomEnemy'] as const;
const GONGFA_APPLY_STATUS_TARGET_VALUES = ['self', 'singleAlly', 'singleEnemy', 'allEnemies'] as const;
const GONGFA_IMMEDIATE_ATTACK_TARGET_VALUES = ['singleEnemy', 'allEnemies'] as const;
const GONGFA_GAIN_ARMOR_TARGET_VALUES = ['self', 'singleAlly', 'allAllies'] as const;
const CANONICAL_GONGFA_CUSTOM_SCRIPT_IDS = [] as const;

export interface GongfaDefinitionCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
}

export interface GongfaIdLocation {
    resourceId: string;
    publicPath: string;
    context: string;
}

export type GongfaIdRegistry = Map<string, GongfaIdLocation>;

function formatGongfaIdLocation(location: GongfaIdLocation): string {
    return `${location.resourceId} ${location.context} in ${location.publicPath}`;
}

function formatAllowedValues(values: readonly string[]): string {
    return values.join(', ');
}

function readGongfaRegistryStringId(
    resource: GongfaDefinitionCatalogResource,
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
        `Catalog gongfa entry ${resource.entry.resourceId} ${context} in ${resource.entry.publicPath} must declare a non-empty string id.`,
    );
    return undefined;
}

function registerGongfaId(
    registry: GongfaIdRegistry,
    resource: GongfaDefinitionCatalogResource,
    id: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const location: GongfaIdLocation = {
        resourceId: resource.entry.resourceId,
        publicPath: resource.entry.publicPath,
        context,
    };
    const existing = registry.get(id);

    if (existing) {
        addFailure(
            failures,
            resource.entry,
            `Catalog gongfa id ${id} is declared more than once: ${formatGongfaIdLocation(existing)}; duplicate ${formatGongfaIdLocation(location)}.`,
        );
        return;
    }

    registry.set(id, location);
}

function reportMissingGongfaId(
    ownerEntry: ContentCatalogEntry,
    context: string,
    id: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        ownerEntry,
        `${context} references gongfa id ${id}, but no catalog gongfa resource declares that id.`,
    );
}

function validateRegisteredGongfaIdReference(
    registry: GongfaIdRegistry,
    ownerEntry: ContentCatalogEntry,
    context: string,
    id: string,
    failures: ContentCatalogValidationFailure[],
): GongfaIdLocation | undefined {
    const location = registry.get(id);

    if (!location) {
        reportMissingGongfaId(ownerEntry, context, id, failures);
        return undefined;
    }

    return location;
}

function addGongfaSchemaFailure(
    resource: GongfaDefinitionCatalogResource,
    context: string,
    expectation: string,
    failures: ContentCatalogValidationFailure[],
): void {
    addFailure(
        failures,
        resource.entry,
        `${context} ${expectation}.`,
    );
}

function validateRequiredGongfaVocabularyField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    allowedValues: readonly string[],
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (typeof value === 'string' && allowedValues.includes(value)) {
        return value;
    }

    addGongfaSchemaFailure(
        resource,
        `${context}.${field}`,
        `must be one of: ${formatAllowedValues(allowedValues)}`,
        failures,
    );
    return undefined;
}

function validateOptionalGongfaVocabularyField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    allowedValues: readonly string[],
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value === 'string' && allowedValues.includes(value)) {
        return value;
    }

    addGongfaSchemaFailure(
        resource,
        `${context}.${field}`,
        `must be one of: ${formatAllowedValues(allowedValues)} when present`,
        failures,
    );
    return undefined;
}

function validateRequiredGongfaStringField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a non-empty string', failures);
    return undefined;
}

function validateOptionalGongfaStringField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const value = record[field];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        return value;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a non-empty string when present', failures);
    return undefined;
}

function validateRequiredGongfaFiniteNumberField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'number' && Number.isFinite(value)) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a finite number', failures);
}

function validateOptionalGongfaFiniteNumberField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || (typeof value === 'number' && Number.isFinite(value))) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a finite number when present', failures);
}

function validateOptionalGongfaPositiveNumberField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0)) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a positive finite number when present', failures);
}

function validateRequiredGongfaPositiveIntegerField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a positive integer', failures);
}

function validateOptionalGongfaPositiveIntegerField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || (typeof value === 'number' && Number.isInteger(value) && value > 0)) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a positive integer when present', failures);
}

function validateOptionalGongfaNonNegativeIntegerField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a non-negative integer when present', failures);
}

function validateRequiredGongfaNumberOrStringField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (
        (typeof value === 'number' && Number.isFinite(value))
        || (typeof value === 'string' && value.trim().length > 0)
    ) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a finite number or non-empty string', failures);
}

function validateOptionalGongfaNumberOrStringField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    field: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const value = record[field];

    if (
        value === undefined
        || (typeof value === 'number' && Number.isFinite(value))
        || (typeof value === 'string' && value.trim().length > 0)
    ) {
        return;
    }

    addGongfaSchemaFailure(resource, `${context}.${field}`, 'must be a finite number or non-empty string', failures);
}

function validateGongfaOptionalStringArray(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        addGongfaSchemaFailure(resource, context, 'must be an array when present', failures);
        return;
    }

    value.forEach((item, index) => {
        if (typeof item === 'string' && item.trim().length > 0) {
            return;
        }

        addGongfaSchemaFailure(resource, `${context}[${index}]`, 'must be a non-empty string', failures);
    });
}

function validateGongfaOptionalVocabularyArray(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    allowedValues: readonly string[],
    failures: ContentCatalogValidationFailure[],
): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        addGongfaSchemaFailure(resource, context, 'must be an array when present', failures);
        return;
    }

    value.forEach((item, index) => {
        const itemContext = `${context}[${index}]`;

        if (typeof item !== 'string' || item.trim().length === 0) {
            addGongfaSchemaFailure(resource, itemContext, 'must be a non-empty string', failures);
            return;
        }

        if (!allowedValues.includes(item)) {
            addGongfaSchemaFailure(
                resource,
                itemContext,
                `must be one of: ${formatAllowedValues(allowedValues)}`,
                failures,
            );
        }
    });
}

function validateCanonicalGongfaCustomScriptId(
    resource: GongfaDefinitionCatalogResource,
    scriptId: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if ((CANONICAL_GONGFA_CUSTOM_SCRIPT_IDS as readonly string[]).includes(scriptId)) {
        return;
    }

    addGongfaSchemaFailure(
        resource,
        context,
        `references non-canonical gongfa Custom script id ${scriptId}; add an explicit catalog validator allowlist entry before using runtime custom semantics`,
        failures,
    );
}

function validateGongfaCustomScriptIdField(
    resource: GongfaDefinitionCatalogResource,
    record: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const scriptId = validateRequiredGongfaStringField(resource, record, context, 'scriptId', failures);

    if (scriptId) {
        validateCanonicalGongfaCustomScriptId(resource, scriptId, `${context}.scriptId`, failures);
    }
}

function validateGongfaEvent(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(value)) {
        addGongfaSchemaFailure(resource, context, 'must be an object', failures);
        return;
    }

    const eventType = validateRequiredGongfaVocabularyField(
        resource,
        value,
        context,
        'type',
        GONGFA_EVENT_TYPE_VALUES,
        failures,
    );
    validateOptionalGongfaVocabularyField(resource, value, context, 'side', GONGFA_EVENT_SIDE_VALUES, failures);

    if (eventType === 'Custom') {
        validateGongfaCustomScriptIdField(resource, value, context, failures);
    }
}

function validateGongfaConditions(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        addGongfaSchemaFailure(resource, context, 'must be an array when present', failures);
        return;
    }

    value.forEach((condition, index) => {
        const conditionContext = `${context}[${index}]`;

        if (!isRecord(condition)) {
            addGongfaSchemaFailure(resource, conditionContext, 'must be an object', failures);
            return;
        }

        validateGongfaCondition(resource, condition, conditionContext, failures);
    });
}

function validateGongfaCondition(
    resource: GongfaDefinitionCatalogResource,
    condition: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    const conditionType = validateRequiredGongfaVocabularyField(
        resource,
        condition,
        context,
        'type',
        GONGFA_CONDITION_TYPE_VALUES,
        failures,
    );

    switch (conditionType) {
        case 'ArtifactUsedThisTurn':
            validateOptionalGongfaVocabularyField(resource, condition, context, 'weaponType', GONGFA_WEAPON_TYPE_VALUES, failures);
            validateOptionalGongfaPositiveIntegerField(resource, condition, context, 'minimum', failures);
            break;
        case 'UnitOnField':
            validateOptionalGongfaStringField(resource, condition, context, 'unitId', failures);
            validateGongfaOptionalStringArray(resource, condition.requiredLabelsAnyOf, `${context}.requiredLabelsAnyOf`, failures);
            break;
        case 'CardInHand':
            validateGongfaOptionalStringArray(resource, condition.requiredLabelsAnyOf, `${context}.requiredLabelsAnyOf`, failures);
            validateOptionalGongfaPositiveIntegerField(resource, condition, context, 'minimum', failures);
            break;
        case 'ArtifactEquipped':
            validateOptionalGongfaVocabularyField(resource, condition, context, 'weaponType', GONGFA_WEAPON_TYPE_VALUES, failures);
            validateOptionalGongfaNumberOrStringField(resource, condition, context, 'maxStar', failures);
            break;
        case 'Custom':
            validateGongfaCustomScriptIdField(resource, condition, context, failures);
            break;
        default:
            break;
    }
}

function validateGongfaActions(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    statusDefinitions: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!Array.isArray(value) || value.length === 0) {
        addGongfaSchemaFailure(resource, context, 'must be a non-empty array', failures);
        return;
    }

    value.forEach((action, index) => {
        const actionContext = `${context}[${index}]`;

        if (!isRecord(action)) {
            addGongfaSchemaFailure(resource, actionContext, 'must be an object', failures);
            return;
        }

        validateGongfaAction(resource, action, actionContext, statusDefinitions, failures);
    });
}

function validateGongfaAction(
    resource: GongfaDefinitionCatalogResource,
    action: Record<string, unknown>,
    context: string,
    statusDefinitions: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    const actionType = validateRequiredGongfaVocabularyField(
        resource,
        action,
        context,
        'type',
        GONGFA_ACTION_TYPE_VALUES,
        failures,
    );

    switch (actionType) {
        case 'RecoverCardFromDiscard':
        case 'SearchCardFromDeck':
            validateGongfaRequiredCardFilter(resource, action.filter, `${context}.filter`, failures);
            validateRequiredGongfaVocabularyField(resource, action, context, 'destination', GONGFA_ACTION_DESTINATION_VALUES, failures);
            validateOptionalGongfaPositiveIntegerField(resource, action, context, 'amount', failures);
            break;
        case 'DrawCards':
            validateRequiredGongfaFiniteNumberField(resource, action, context, 'value', failures);
            break;
        case 'DrawAndFilter':
            validateRequiredGongfaPositiveIntegerField(resource, action, context, 'amount', failures);
            validateGongfaRequiredCardFilter(resource, action.filter, `${context}.filter`, failures);
            validateRequiredGongfaVocabularyField(resource, action, context, 'matchDestination', GONGFA_ACTION_DESTINATION_VALUES, failures);
            validateRequiredGongfaVocabularyField(resource, action, context, 'nonMatchDestination', GONGFA_ACTION_DESTINATION_VALUES, failures);
            break;
        case 'ModifyStats':
            validateOptionalGongfaFiniteNumberField(resource, action, context, 'attackDelta', failures);
            validateOptionalGongfaFiniteNumberField(resource, action, context, 'healthDelta', failures);
            break;
        case 'DealDamage':
            validateRequiredGongfaFiniteNumberField(resource, action, context, 'value', failures);
            validateRequiredGongfaVocabularyField(resource, action, context, 'target', GONGFA_DEAL_DAMAGE_TARGET_VALUES, failures);
            break;
        case 'ApplyStatus':
            validateGongfaApplyStatusAction(resource, action, context, statusDefinitions, failures);
            break;
        case 'ImmediateAttack':
            validateRequiredGongfaVocabularyField(resource, action, context, 'target', GONGFA_IMMEDIATE_ATTACK_TARGET_VALUES, failures);
            validateOptionalGongfaPositiveNumberField(resource, action, context, 'damageMultiplier', failures);
            break;
        case 'GainArmor':
            validateRequiredGongfaVocabularyField(resource, action, context, 'target', GONGFA_GAIN_ARMOR_TARGET_VALUES, failures);
            validateRequiredGongfaNumberOrStringField(resource, action, context, 'value', failures);
            break;
        case 'AddLog':
            validateRequiredGongfaStringField(resource, action, context, 'message', failures);
            break;
        case 'Custom':
            validateGongfaCustomScriptIdField(resource, action, context, failures);
            break;
        default:
            break;
    }
}

function validateGongfaApplyStatusAction(
    resource: GongfaDefinitionCatalogResource,
    action: Record<string, unknown>,
    context: string,
    statusDefinitions: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    const statusId = validateRequiredGongfaStringField(resource, action, context, 'statusId', failures);

    if (statusId) {
        validateStatusDefinitionIdReference(
            statusDefinitions,
            resource.entry,
            `${context}.statusId`,
            statusId,
            failures,
        );
    }

    validateOptionalGongfaNonNegativeIntegerField(resource, action, context, 'duration', failures);
    validateRequiredGongfaVocabularyField(resource, action, context, 'target', GONGFA_APPLY_STATUS_TARGET_VALUES, failures);
}

function validateGongfaRequiredCardFilter(
    resource: GongfaDefinitionCatalogResource,
    value: unknown,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(value)) {
        addGongfaSchemaFailure(resource, context, 'must be an object', failures);
        return;
    }

    validateGongfaCardFilter(resource, value, context, failures);
}

function validateGongfaCardFilter(
    resource: GongfaDefinitionCatalogResource,
    filter: Record<string, unknown>,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    validateGongfaOptionalVocabularyArray(
        resource,
        filter.kind,
        `${context}.kind`,
        GONGFA_CARD_FILTER_KIND_VALUES,
        failures,
    );
    validateGongfaOptionalStringArray(resource, filter.labelsAnyOf, `${context}.labelsAnyOf`, failures);
    validateGongfaOptionalVocabularyArray(
        resource,
        filter.weaponTypesAnyOf,
        `${context}.weaponTypesAnyOf`,
        GONGFA_WEAPON_TYPE_VALUES,
        failures,
    );
    validateOptionalGongfaNumberOrStringField(resource, filter, context, 'maxStar', failures);
    validateOptionalGongfaPositiveIntegerField(resource, filter, context, 'amount', failures);

    for (const field of Object.keys(filter)) {
        if ((GONGFA_CARD_FILTER_FIELDS as readonly string[]).includes(field)) {
            continue;
        }

        addGongfaSchemaFailure(
            resource,
            `${context}.${field}`,
            `is not supported; allowed filter fields: ${formatAllowedValues(GONGFA_CARD_FILTER_FIELDS)}`,
            failures,
        );
    }
}

export function registerGongfaIds(
    resource: GongfaDefinitionCatalogResource,
    registry: GongfaIdRegistry,
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

        const id = readGongfaRegistryStringId(resource, value, context, failures);

        if (!id) {
            return;
        }

        registerGongfaId(registry, resource, id, context, failures);
    });
}

export function validateCardGongfaReferences(
    resource: GongfaDefinitionCatalogResource,
    registry: GongfaIdRegistry,
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

                validateRegisteredGongfaIdReference(
                    registry,
                    resource.entry,
                    context,
                    gongfaId,
                    failures,
                );
            });
        });
    }
}

export function validateGongfaSchemaShapesAndReferences(
    resource: GongfaDefinitionCatalogResource,
    statusDefinitions: StatusDefinitionIdRegistry,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!isRecord(resource.json) || !Array.isArray(resource.json.gongfa)) {
        return;
    }

    resource.json.gongfa.forEach((value, index) => {
        if (!isRecord(value)) {
            return;
        }

        const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : undefined;
        const definitionContext = `Catalog gongfa definition ${resource.entry.resourceId} gongfa[${index}]${id ? ` ${id}` : ''} in ${resource.entry.publicPath}`;

        if (!isRecord(value.schema)) {
            addGongfaSchemaFailure(resource, `${definitionContext} schema`, 'must be an object', failures);
            return;
        }

        validateGongfaEvent(resource, value.schema.event, `${definitionContext} schema.event`, failures);
        validateGongfaConditions(resource, value.schema.conditions, `${definitionContext} schema.conditions`, failures);
        validateGongfaActions(resource, value.schema.actions, `${definitionContext} schema.actions`, statusDefinitions, failures);
    });
}