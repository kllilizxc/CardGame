import type { CardKind, CardRarity } from '@data/types/cards/core';
import type { ExpeditionCardStack } from '../types/expedition';

export type CardCollectionSortField = 'id' | 'count' | 'kind' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface CardCollectionSortConfig {
    field: CardCollectionSortField;
    direction: SortDirection;
}

export interface CardCollectionFilters {
    /** Locale-stable substring match against card id and name (when metadata is available). */
    query?: string;
    /** If set, only include cards whose kind matches (requires metadata). */
    kind?: CardKind;
    /** When true, omit cards with count <= 0. */
    hideZeroCount?: boolean;
}

export interface CardMetadata {
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

export interface CardCollectionRow {
    id: string;
    count: number;
    kind?: CardKind;
    name?: string;
}

export type CardMetadataMap = Readonly<Record<string, CardMetadata>>;

function resolveMetadata(id: string, metadata?: CardMetadataMap): { kind?: CardKind; name?: string } {
    const entry = metadata?.[id];
    return { kind: entry?.kind, name: entry?.name };
}

export function buildCardCollectionRows(
    stacks: readonly ExpeditionCardStack[],
    metadata?: CardMetadataMap,
): CardCollectionRow[] {
    return stacks.map((stack) => {
        const meta = resolveMetadata(stack.id, metadata);
        return {
            id: stack.id,
            count: stack.count,
            kind: meta.kind,
            name: meta.name,
        };
    });
}

const CARD_COLLECTION_MACHINE_TEXT_LOCALE = 'en-US';
const CARD_COLLECTION_NAME_SORT_LOCALE = 'zh-Hans-CN';

const CARD_COLLECTION_MACHINE_TEXT_COLLATOR = new Intl.Collator(CARD_COLLECTION_MACHINE_TEXT_LOCALE, {
    usage: 'sort',
    sensitivity: 'variant',
    numeric: true,
});

const CARD_COLLECTION_NAME_COLLATOR = new Intl.Collator(CARD_COLLECTION_NAME_SORT_LOCALE, {
    usage: 'sort',
    sensitivity: 'variant',
});

function normalizeSearchableText(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase(CARD_COLLECTION_MACHINE_TEXT_LOCALE);
}

function matchesNormalizedQuery(value: string | undefined, normalizedQuery: string): boolean {
    return value !== undefined && normalizeSearchableText(value).includes(normalizedQuery);
}

function compareMachineText(left: string, right: string): number {
    return CARD_COLLECTION_MACHINE_TEXT_COLLATOR.compare(left, right);
}

function compareLocalizedName(left: string | undefined, right: string | undefined): number {
    return CARD_COLLECTION_NAME_COLLATOR.compare(left ?? '', right ?? '');
}

export function applyCardCollectionFilters(
    rows: readonly CardCollectionRow[],
    filters: CardCollectionFilters | undefined,
): CardCollectionRow[] {
    if (!filters) return [...rows];

    let result = rows;

    if (filters.hideZeroCount) {
        result = result.filter((row) => row.count > 0);
    }

    if (filters.kind !== undefined) {
        result = result.filter((row) => row.kind === filters.kind);
    }

    if (filters.query !== undefined && filters.query.trim().length > 0) {
        const q = normalizeSearchableText(filters.query.trim());
        result = result.filter((row) => {
            if (matchesNormalizedQuery(row.id, q)) return true;
            if (matchesNormalizedQuery(row.name, q)) return true;
            return false;
        });
    }

    return result;
}

const CARD_KIND_SORT_ORDER: Record<CardKind, number> = {
    unit: 0,
    artifact: 1,
    talisman: 2,
    field: 3,
    skill: 4,
    pill: 5,
};

function compareByField(a: CardCollectionRow, b: CardCollectionRow, field: CardCollectionSortField): number {
    switch (field) {
        case 'id':
            return compareMachineText(a.id, b.id);
        case 'count':
            return a.count - b.count;
        case 'kind': {
            const ka = a.kind !== undefined ? (CARD_KIND_SORT_ORDER[a.kind] ?? 99) : 99;
            const kb = b.kind !== undefined ? (CARD_KIND_SORT_ORDER[b.kind] ?? 99) : 99;
            if (ka !== kb) return ka - kb;
            return compareMachineText(a.kind ?? '', b.kind ?? '');
        }
        case 'name':
            return compareLocalizedName(a.name, b.name);
    }
}

export function applyCardCollectionSort(
    rows: readonly CardCollectionRow[],
    sort: CardCollectionSortConfig | undefined,
): CardCollectionRow[] {
    if (!sort) return [...rows];

    const multiplier = sort.direction === 'desc' ? -1 : 1;
    const sorted = [...rows];
    sorted.sort((a, b) => compareByField(a, b, sort.field) * multiplier);
    return sorted;
}

export interface CardCollectionViewModelOptions {
    metadata?: CardMetadataMap;
    filters?: CardCollectionFilters;
    sort?: CardCollectionSortConfig;
}

export function computeCardCollectionViewModel(
    stacks: readonly ExpeditionCardStack[],
    options?: CardCollectionViewModelOptions,
): CardCollectionRow[] {
    const rows = buildCardCollectionRows(stacks, options?.metadata);
    const filtered = applyCardCollectionFilters(rows, options?.filters);
    return applyCardCollectionSort(filtered, options?.sort);
}
