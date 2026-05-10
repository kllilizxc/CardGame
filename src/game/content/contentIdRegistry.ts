import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
} from './contentCatalog';
import type {
    StackConsumeType,
    StatusCategory,
    StatusEffectType,
    StatusTiming,
} from '@data/types/status';
import type { ArtifactWeaponType } from '@data/types/cards/artifact';

type CatalogIdRegistryName = 'card' | 'gongfa' | 'status' | 'world item' | 'realm' | 'grade';

const CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH = 'data/config/status-definitions.json';
const CANONICAL_REALM_PRESETS_RESOURCE_ID = 'config.realm-presets';
const CANONICAL_REALM_PRESETS_PUBLIC_PATH = 'data/config/realm-presets.json';
const CANONICAL_REALM_REGISTRY_RESOURCE_ID = 'config.combat-baseline';
const CANONICAL_REALM_REGISTRY_PUBLIC_PATH = 'data/config/combat-baseline.json';
const CANONICAL_GRADE_REGISTRY_RESOURCE_ID = 'config.artifact-grade';
const CANONICAL_GRADE_REGISTRY_PUBLIC_PATH = 'data/config/artifact-grade.json';
const MAX_ARTIFACT_STAR = 12;

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
    statuses: Map<string, CatalogIdLocation>;
    realmPresetValues: CanonicalNumericValueRegistry;
    realms: CanonicalContentIdRegistry;
    grades: CanonicalContentIdRegistry;
    worldItems: Map<string, CatalogIdLocation>;
    invalidCanonicalConfigResourceIds: Set<string>;
}

const WORLD_ITEM_COLLECTION_NAMES = ['artifacts', 'tools', 'consumables', 'quests', 'questItems'] as const;

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
    const missingDeclaration = registryName === 'status'
        ? `canonical ${CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH} does not declare that id`
        : `no catalog ${registryName} resource declares that id`;

    addFailure(
        failures,
        ownerEntry,
        `${context} references ${registryName} id ${id}, but ${missingDeclaration}.`,
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

function addStatusDefinitionShapeFailure(
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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

function addGongfaSchemaFailure(
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
    value: unknown,
    context: string,
    registries: ContentIdRegistries,
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

        validateGongfaAction(resource, action, actionContext, registries, failures);
    });
}

function validateGongfaAction(
    resource: CatalogIdResource,
    action: Record<string, unknown>,
    context: string,
    registries: ContentIdRegistries,
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
            validateGongfaApplyStatusAction(resource, action, context, registries, failures);
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
    resource: CatalogIdResource,
    action: Record<string, unknown>,
    context: string,
    registries: ContentIdRegistries,
    failures: ContentCatalogValidationFailure[],
): void {
    const statusId = validateRequiredGongfaStringField(resource, action, context, 'statusId', failures);

    if (statusId) {
        validateRegisteredIdReference(
            registries.statuses,
            resource.entry,
            `${context}.statusId`,
            'status',
            statusId,
            failures,
        );
    }

    validateOptionalGongfaNonNegativeIntegerField(resource, action, context, 'duration', failures);
    validateRequiredGongfaVocabularyField(resource, action, context, 'target', GONGFA_APPLY_STATUS_TARGET_VALUES, failures);
}

function validateGongfaRequiredCardFilter(
    resource: CatalogIdResource,
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
    resource: CatalogIdResource,
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

function validateGongfaSchemaShapesAndReferences(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
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
        validateGongfaActions(resource, value.schema.actions, `${definitionContext} schema.actions`, registries, failures);
    });
}

function buildContentIdRegistries(
    resources: Iterable<CatalogIdResource>,
    failures: ContentCatalogValidationFailure[],
): ContentIdRegistries {
    const resourceList = [...resources];
    const registries: ContentIdRegistries = {
        cards: new Map(),
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
        if (registries.invalidCanonicalConfigResourceIds.has(resource.entry.resourceId)) {
            continue;
        }

        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            registerCardIds(resource, registries, failures);
        }

        if (resource.entry.kind === 'gongfa') {
            registerGongfaIds(resource, registries, failures);
        }

        if (
            resource.entry.kind === 'status'
            && resource.entry.publicPath === CANONICAL_STATUS_DEFINITIONS_PUBLIC_PATH
        ) {
            registerStatusIds(resource, registries, failures);
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

function registerStatusIds(
    resource: CatalogIdResource,
    registries: ContentIdRegistries,
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

        const id = readRegistryStringId(resource, value, context, 'status', failures);

        if (!id) {
            return;
        }

        validateCanonicalStatusDefinitionShape(resource, value, context, id, failures);
        registerCatalogId(registries.statuses, 'status', resource, id, context, failures);
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
        if (registries.invalidCanonicalConfigResourceIds.has(resource.entry.resourceId)) {
            continue;
        }

        if (!resource.json || !isRecord(resource.json)) {
            continue;
        }

        if (resource.entry.kind === 'card') {
            validateCardGongfaReferences(resource, registries, failures);
            validateCardLegacyApplyStatusReferences(resource, registries, failures);
            validateCardRealmAndGradeReferences(resource, registries, failures);
        }

        if (resource.entry.kind === 'gongfa') {
            validateGongfaSchemaShapesAndReferences(resource, registries, failures);
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

function validateCardLegacyApplyStatusReferences(
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
                    const statusId = readReferenceId(resource.entry, action, 'statusId', actionContext, failures);

                    if (!statusId) {
                        return;
                    }

                    validateRegisteredIdReference(
                        registries.statuses,
                        resource.entry,
                        `${actionContext}.statusId`,
                        'status',
                        statusId,
                        failures,
                    );
                });
            });
        });
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
