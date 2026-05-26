import type { CardKind, CardRarity } from '@data/types/cards/core';
import type { CardEffect } from '@data/types/cards/effects';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
} from '../../content/contentCatalog';
import { CardEffectFormatter } from '../../utils/CardEffectFormatter';

type DeckbuilderCardMetadataCacheKey =
    | 'unitCards'
    | 'artifactCards'
    | 'talismanCards'
    | 'pillCards'
    | 'fieldCards'
    | 'skillCards';

type DeckbuilderCardMetadataCollectionKey =
    | 'units'
    | 'artifacts'
    | 'talismans'
    | 'pills'
    | 'fields'
    | 'skills';

interface DeckbuilderCardMetadataResourceRequest {
    cacheKey: DeckbuilderCardMetadataCacheKey;
    collectionKey: DeckbuilderCardMetadataCollectionKey;
    resourceId: string;
}

export interface DeckbuilderCardMetadataResource extends DeckbuilderCardMetadataResourceRequest {
    publicPath: string;
}

export type DeckbuilderCardMetadataResources = Record<
    DeckbuilderCardMetadataCacheKey,
    DeckbuilderCardMetadataResource
>;

export interface DeckbuilderWorldItemMetadataResource {
    cacheKey: 'worldItemMetadata';
    resourceId: 'world.seed.items-artifacts';
    publicPath: string;
}

const CARD_KIND_VALUES: CardKind[] = ['unit', 'artifact', 'talisman', 'field', 'skill', 'pill'];
const CARD_RARITY_VALUES: CardRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const ARTIFACT_GRADE_TIER_LABELS: Record<string, string> = {
    yellow: '黄阶',
    earth: '地阶',
    mystic: '玄阶',
    heaven: '天阶',
    immortal: '仙阶',
    divine: '神阶',
};

const ARTIFACT_GRADE_QUALITY_LABELS: Record<string, string> = {
    lower: '下品',
    middle: '中品',
    upper: '上品',
};

const PILL_GRADE_LABELS: Record<number, string> = {
    1: '一品丹药',
    2: '二品丹药',
    3: '三品丹药',
    4: '四品丹药',
    5: '五品丹药',
    6: '六品丹药',
    7: '七品丹药',
    8: '八品丹药',
    9: '九品丹药',
};

const DECKBUILDER_CARD_METADATA_RESOURCE_REQUESTS: readonly DeckbuilderCardMetadataResourceRequest[] = [
    {
        cacheKey: 'unitCards',
        collectionKey: 'units',
        resourceId: 'cards.units',
    },
    {
        cacheKey: 'artifactCards',
        collectionKey: 'artifacts',
        resourceId: 'cards.artifacts',
    },
    {
        cacheKey: 'talismanCards',
        collectionKey: 'talismans',
        resourceId: 'cards.talismans',
    },
    {
        cacheKey: 'pillCards',
        collectionKey: 'pills',
        resourceId: 'cards.pills',
    },
    {
        cacheKey: 'fieldCards',
        collectionKey: 'fields',
        resourceId: 'cards.fields',
    },
    {
        cacheKey: 'skillCards',
        collectionKey: 'skills',
        resourceId: 'cards.skills',
    },
] as const;

const WORLD_ITEM_METADATA_RESOURCE_ID = 'world.seed.items-artifacts';
const WORLD_ITEM_COLLECTION_KEYS = ['artifacts', 'tools', 'consumables', 'quests', 'questItems'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCardKind(value: unknown): value is CardKind {
    return typeof value === 'string' && CARD_KIND_VALUES.includes(value as CardKind);
}

function isCardRarity(value: unknown): value is CardRarity {
    return typeof value === 'string' && CARD_RARITY_VALUES.includes(value as CardRarity);
}

function normalizeOptionalText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePositiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const normalized = value
        .map((entry) => normalizeOptionalText(entry))
        .filter((entry): entry is string => entry !== undefined);

    return normalized.length > 0 ? normalized : undefined;
}

function formatArtifactGradeLabel(value: unknown): string | undefined {
    const raw = normalizeOptionalText(value);
    if (!raw) {
        return undefined;
    }

    const [, tierKey, qualityKey] = raw.split('_');
    const tierLabel = ARTIFACT_GRADE_TIER_LABELS[tierKey];
    const qualityLabel = ARTIFACT_GRADE_QUALITY_LABELS[qualityKey];

    if (!tierLabel || !qualityLabel) {
        return undefined;
    }

    return `${tierLabel}${qualityLabel}`;
}

function formatPillGradeLabel(value: unknown): string | undefined {
    const grade = normalizePositiveInteger(value);
    return grade ? PILL_GRADE_LABELS[grade] : undefined;
}

function truncateCopy(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function summarizeCardEffects(effects: unknown): string | undefined {
    if (!Array.isArray(effects) || effects.length === 0) {
        return undefined;
    }

    const textSummaries = effects
        .map((effect) => (isRecord(effect) ? normalizeOptionalText(effect.text) : undefined))
        .filter((value): value is string => value !== undefined);

    if (textSummaries.length > 0) {
        return truncateCopy(textSummaries.join(' / '), 160);
    }

    const fallback = CardEffectFormatter.formatShort(effects as CardEffect[]);
    if (fallback === '无效果' || fallback === '特殊效果') {
        return undefined;
    }

    return truncateCopy(fallback, 160);
}

export function resolveDeckbuilderCardMetadataResources(
    rawCatalog: unknown,
): DeckbuilderCardMetadataResources {
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'ExpeditionScene deckbuilder metadata',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const resources: Partial<DeckbuilderCardMetadataResources> = {};

    DECKBUILDER_CARD_METADATA_RESOURCE_REQUESTS.forEach((request) => {
        const catalogResource = catalogResolver.resolveJsonResource({
            resourceId: request.resourceId,
            expectedKind: 'card',
        });

        resources[request.cacheKey] = {
            ...request,
            publicPath: catalogResource.publicPath,
        };
    });

    return resources as DeckbuilderCardMetadataResources;
}

export function resolveDeckbuilderWorldItemMetadataResource(
    rawCatalog: unknown,
): DeckbuilderWorldItemMetadataResource {
    const catalogResolver = createContentCatalogResolver(rawCatalog, {
        context: 'ExpeditionScene world item metadata',
        sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
    });
    const catalogResource = catalogResolver.resolveJsonResource({
        resourceId: WORLD_ITEM_METADATA_RESOURCE_ID,
        expectedKind: 'worldSeed',
    });

    return {
        cacheKey: 'worldItemMetadata',
        resourceId: WORLD_ITEM_METADATA_RESOURCE_ID,
        publicPath: catalogResource.publicPath,
    };
}

export function buildDeckbuilderCardMetadataMap(
    resources: DeckbuilderCardMetadataResources,
    readJson: (cacheKey: DeckbuilderCardMetadataCacheKey) => unknown,
    options: {
        worldItemSource?: unknown;
    } = {},
): CardMetadataMap {
    const metadata: Record<
        string,
        {
            kind?: CardKind;
            name?: string;
            description?: string;
            effectSummary?: string;
            rarity?: CardRarity;
            limitPerDeck?: number;
            labels?: string[];
            attack?: number;
            health?: number;
            attackBonus?: number;
            healthBonus?: number;
            race?: string;
            linggen?: string[];
            weaponType?: string;
            elements?: string[];
            equipTarget?: string;
            target?: string;
            isInstant?: boolean;
            duration?: number;
            symmetric?: boolean;
            cooldownType?: string;
            gradeLabel?: string;
        }
    > = {};

    Object.values(resources).forEach((resource) => {
        const source = readJson(resource.cacheKey);

        if (!isRecord(source)) {
            return;
        }

        const collection = source[resource.collectionKey];

        if (!Array.isArray(collection)) {
            return;
        }

        collection.forEach((entry) => {
            if (!isRecord(entry) || typeof entry.id !== 'string') {
                return;
            }

            const existing = metadata[entry.id] ?? {};
            const next = { ...existing };

            if (typeof entry.name === 'string' && entry.name.trim().length > 0) {
                next.name = entry.name;
            }

            if (isCardKind(entry.kind)) {
                next.kind = entry.kind;
            }

            const description = normalizeOptionalText(entry.description);
            if (description) {
                next.description = description;
            }

            const effectSummary = summarizeCardEffects(entry.effects);
            if (effectSummary) {
                next.effectSummary = effectSummary;
            }

            if (isCardRarity(entry.rarity)) {
                next.rarity = entry.rarity;
            }

            const limitPerDeck = normalizePositiveInteger(entry.limitPerDeck);
            if (limitPerDeck !== undefined) {
                next.limitPerDeck = limitPerDeck;
            }

            const labels = normalizeStringArray(entry.labels);
            if (labels) {
                next.labels = labels;
            }

            const attack = normalizeFiniteNumber(entry.attack);
            if (attack !== undefined) {
                next.attack = attack;
            }

            const health = normalizeFiniteNumber(entry.health);
            if (health !== undefined) {
                next.health = health;
            }

            const attackBonus = normalizeFiniteNumber(entry.attackBonus);
            if (attackBonus !== undefined) {
                next.attackBonus = attackBonus;
            }

            const healthBonus = normalizeFiniteNumber(entry.healthBonus);
            if (healthBonus !== undefined) {
                next.healthBonus = healthBonus;
            }

            const race = normalizeOptionalText(entry.race);
            if (race) {
                next.race = race;
            }

            const linggen = normalizeStringArray(entry.linggen);
            if (linggen) {
                next.linggen = linggen;
            }

            const weaponType = normalizeOptionalText(entry.weaponType);
            if (weaponType) {
                next.weaponType = weaponType;
            }

            const elements = normalizeStringArray(entry.elements);
            if (elements) {
                next.elements = elements;
            }

            const equipTarget = normalizeOptionalText(entry.equipTarget);
            if (equipTarget) {
                next.equipTarget = equipTarget;
            }

            const target = normalizeOptionalText(entry.target);
            if (target) {
                next.target = target;
            }

            if (typeof entry.isInstant === 'boolean') {
                next.isInstant = entry.isInstant;
            }

            const duration = normalizePositiveInteger(entry.duration);
            if (duration !== undefined) {
                next.duration = duration;
            }

            if (typeof entry.symmetric === 'boolean') {
                next.symmetric = entry.symmetric;
            }

            const cooldownType = normalizeOptionalText(entry.cooldownType);
            if (cooldownType) {
                next.cooldownType = cooldownType;
            }

            const gradeLabel = formatArtifactGradeLabel(entry.gradeId) ?? formatPillGradeLabel(entry.grade);
            if (gradeLabel) {
                next.gradeLabel = gradeLabel;
            }

            metadata[entry.id] = next;
        });
    });

    const worldItemSource = options.worldItemSource;

    if (isRecord(worldItemSource)) {
        WORLD_ITEM_COLLECTION_KEYS.forEach((collectionKey) => {
            const collection = worldItemSource[collectionKey];

            if (!Array.isArray(collection)) {
                return;
            }

            collection.forEach((entry) => {
                if (!isRecord(entry) || typeof entry.id !== 'string') {
                    return;
                }

                const existing = metadata[entry.id] ?? {};
                const next = { ...existing };

                const name = normalizeOptionalText(entry.name);
                if (name && !next.name) {
                    next.name = name;
                }

                const description = normalizeOptionalText(entry.description);
                if (description && !next.description) {
                    next.description = description;
                }

                const typeLabel = normalizeOptionalText(entry.type);
                if (typeLabel) {
                    next.labels = next.labels?.length
                        ? next.labels
                        : [typeLabel];
                }

                const gradeLabel = normalizeOptionalText(entry.grade);
                if (gradeLabel && !next.gradeLabel) {
                    next.gradeLabel = gradeLabel;
                }

                metadata[entry.id] = next;
            });
        });
    }

    return metadata;
}
