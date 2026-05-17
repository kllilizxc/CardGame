import type { CardKind } from '@data/types/cards/core';
import type { ExpeditionCardStack } from '../types/expedition';

export type CardCollectionSortField = 'id' | 'count' | 'kind' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface CardCollectionSortConfig {
    field: CardCollectionSortField;
    direction: SortDirection;
}

export interface CardCollectionFilters {
    /** Case-insensitive substring match against card id and name (when metadata is available). */
    query?: string;
    /** If set, only include cards whose kind matches (requires metadata). */
    kind?: CardKind;
    /** When true, omit cards with count <= 0. */
    hideZeroCount?: boolean;
}

export interface CardMetadata {
    kind?: CardKind;
    name?: string;
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
        const q = filters.query.trim().toLowerCase();
        result = result.filter((row) => {
            if (row.id.toLowerCase().includes(q)) return true;
            if (row.name !== undefined && row.name.toLowerCase().includes(q)) return true;
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
            return a.id.localeCompare(b.id);
        case 'count':
            return a.count - b.count;
        case 'kind': {
            const ka = a.kind !== undefined ? (CARD_KIND_SORT_ORDER[a.kind] ?? 99) : 99;
            const kb = b.kind !== undefined ? (CARD_KIND_SORT_ORDER[b.kind] ?? 99) : 99;
            if (ka !== kb) return ka - kb;
            return (a.kind ?? '').localeCompare(b.kind ?? '');
        }
        case 'name':
            return (a.name ?? '').localeCompare(b.name ?? '');
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
