import { describe, expect, it } from 'bun:test';

import type { CardKind } from '@data/types/cards/core';
import type { ExpeditionCardStack } from '../types/expedition';
import {
    applyCardCollectionFilters,
    applyCardCollectionSort,
    buildCardCollectionRows,
    computeCardCollectionViewModel,
    type CardCollectionRow,
    type CardMetadataMap,
} from './CardCollectionViewModel';

const STACKS: ExpeditionCardStack[] = [
    { id: 'CR_001', count: 3 },
    { id: 'CR_002', count: 1 },
    { id: 'CR_003', count: 0 },
    { id: 'AR_001', count: 5 },
    { id: 'AR_002', count: 2 },
    { id: 'TL_001', count: 0 },
];

const METADATA: CardMetadataMap = {
    CR_001: { kind: 'unit' as CardKind, name: 'Flame Tiger' },
    CR_002: { kind: 'unit' as CardKind, name: 'Azure Serpent' },
    CR_003: { kind: 'unit' as CardKind, name: 'Stone Golem' },
    AR_001: { kind: 'artifact' as CardKind, name: 'Spirit Sword' },
    AR_002: { kind: 'artifact' as CardKind, name: 'Shadow Cloak' },
    TL_001: { kind: 'talisman' as CardKind, name: 'Lightning Talisman' },
};

function ids(rows: readonly CardCollectionRow[]): string[] {
    return rows.map((r) => r.id);
}

// ─── buildCardCollectionRows ─────────────────────────────────────────

describe('buildCardCollectionRows', () => {
    it('converts empty stacks to empty rows', () => {
        expect(buildCardCollectionRows([])).toEqual([]);
    });

    it('converts stacks to rows with id and count', () => {
        const rows = buildCardCollectionRows(STACKS);
        expect(rows).toHaveLength(STACKS.length);
        for (let i = 0; i < STACKS.length; i++) {
            expect(rows[i].id).toBe(STACKS[i].id);
            expect(rows[i].count).toBe(STACKS[i].count);
        }
    });

    it('includes kind and name when metadata is available', () => {
        const rows = buildCardCollectionRows(STACKS, METADATA);
        expect(rows[0].kind).toBe('unit');
        expect(rows[0].name).toBe('Flame Tiger');
        expect(rows[3].kind).toBe('artifact');
        expect(rows[3].name).toBe('Spirit Sword');
    });

    it('leaves kind and name undefined for unknown card ids', () => {
        const stacks: ExpeditionCardStack[] = [{ id: 'UNKNOWN', count: 1 }];
        const rows = buildCardCollectionRows(stacks);
        expect(rows[0].kind).toBeUndefined();
        expect(rows[0].name).toBeUndefined();
    });

    it('does not mutate the input stacks array', () => {
        const copy = [...STACKS];
        buildCardCollectionRows(STACKS, METADATA);
        expect(STACKS).toEqual(copy);
    });

    it('accepts undefined metadata', () => {
        const rows = buildCardCollectionRows(STACKS, undefined);
        expect(rows).toHaveLength(STACKS.length);
        expect(rows[0].kind).toBeUndefined();
    });
});

// ─── applyCardCollectionFilters ──────────────────────────────────────

describe('applyCardCollectionFilters', () => {
    const rows = buildCardCollectionRows(STACKS, METADATA);

    it('passes all rows when filters is undefined', () => {
        expect(applyCardCollectionFilters(rows, undefined)).toEqual(rows);
    });

    it('passes all rows with empty filters object', () => {
        expect(applyCardCollectionFilters(rows, {})).toEqual(rows);
    });

    it('returns a new array (does not mutate input)', () => {
        const input = [...rows];
        const result = applyCardCollectionFilters(rows, { hideZeroCount: true });
        expect(result).not.toBe(input);
        expect(rows).toEqual(input);
    });

    describe('hideZeroCount', () => {
        it('removes cards with count <= 0', () => {
            const result = applyCardCollectionFilters(rows, { hideZeroCount: true });
            expect(ids(result)).toEqual(['CR_001', 'CR_002', 'AR_001', 'AR_002']);
        });

        it('keeps cards with count > 0', () => {
            const result = applyCardCollectionFilters(rows, { hideZeroCount: true });
            for (const row of result) {
                expect(row.count).toBeGreaterThan(0);
            }
        });
    });

    describe('query filter', () => {
        it('matches by id substring (case-insensitive)', () => {
            const result = applyCardCollectionFilters(rows, { query: 'cr' });
            expect(ids(result)).toEqual(['CR_001', 'CR_002', 'CR_003']);
        });

        it('matches by name substring (case-insensitive)', () => {
            const result = applyCardCollectionFilters(rows, { query: 'flame' });
            expect(ids(result)).toEqual(['CR_001']);
        });

        it('matches uppercase query against lowercase name', () => {
            const result = applyCardCollectionFilters(rows, { query: 'SPIRIT' });
            expect(ids(result)).toEqual(['AR_001']);
        });

        it('returns no rows when query matches nothing', () => {
            const result = applyCardCollectionFilters(rows, { query: 'zzz_nonexistent' });
            expect(result).toEqual([]);
        });

        it('skips filter for empty/whitespace query', () => {
            expect(ids(applyCardCollectionFilters(rows, { query: '' }))).toEqual(ids(rows));
            expect(ids(applyCardCollectionFilters(rows, { query: '   ' }))).toEqual(ids(rows));
        });
    });

    describe('kind filter', () => {
        it('returns only artifact rows', () => {
            const result = applyCardCollectionFilters(rows, { kind: 'artifact' as CardKind });
            expect(ids(result)).toEqual(['AR_001', 'AR_002']);
        });

        it('returns only unit rows', () => {
            const result = applyCardCollectionFilters(rows, { kind: 'unit' as CardKind });
            expect(ids(result)).toEqual(['CR_001', 'CR_002', 'CR_003']);
        });

        it('returns only talisman rows', () => {
            const result = applyCardCollectionFilters(rows, { kind: 'talisman' as CardKind });
            expect(ids(result)).toEqual(['TL_001']);
        });

        it('returns no rows for a kind with no matches', () => {
            const result = applyCardCollectionFilters(rows, { kind: 'pill' as CardKind });
            expect(result).toEqual([]);
        });

        it('omits rows without kind metadata', () => {
            const noMetaRows = buildCardCollectionRows(STACKS);
            const result = applyCardCollectionFilters(noMetaRows, { kind: 'unit' as CardKind });
            expect(result).toEqual([]);
        });
    });

    describe('combined filters', () => {
        it('applies query + hideZeroCount together', () => {
            const result = applyCardCollectionFilters(rows, {
                query: 'cr',
                hideZeroCount: true,
            });
            // CR_003 has count 0, so only CR_001 and CR_002 remain
            expect(ids(result)).toEqual(['CR_001', 'CR_002']);
        });

        it('applies kind + query together', () => {
            const result = applyCardCollectionFilters(rows, {
                kind: 'unit' as CardKind,
                query: 'flame',
            });
            expect(ids(result)).toEqual(['CR_001']);
        });

        it('applies all three filters together', () => {
            const result = applyCardCollectionFilters(rows, {
                kind: 'artifact' as CardKind,
                query: 'sword',
                hideZeroCount: true,
            });
            expect(ids(result)).toEqual(['AR_001']);
        });
    });
});

// ─── applyCardCollectionSort ─────────────────────────────────────────

describe('applyCardCollectionSort', () => {
    const rows = buildCardCollectionRows(STACKS, METADATA);

    it('returns unsorted copy when sort is undefined', () => {
        expect(applyCardCollectionSort(rows, undefined)).toEqual(rows);
    });

    it('returns a new array (does not mutate input)', () => {
        const input = [...rows];
        const result = applyCardCollectionSort(rows, { field: 'count', direction: 'desc' });
        expect(result).not.toBe(input);
        expect(rows).toEqual(input);
    });

    describe('sort by id', () => {
        it('ascending', () => {
            const result = applyCardCollectionSort(rows, { field: 'id', direction: 'asc' });
            expect(ids(result)).toEqual([
                'AR_001', 'AR_002', 'CR_001', 'CR_002', 'CR_003', 'TL_001',
            ]);
        });

        it('descending', () => {
            const result = applyCardCollectionSort(rows, { field: 'id', direction: 'desc' });
            expect(ids(result)).toEqual([
                'TL_001', 'CR_003', 'CR_002', 'CR_001', 'AR_002', 'AR_001',
            ]);
        });
    });

    describe('sort by count', () => {
        it('ascending', () => {
            const result = applyCardCollectionSort(rows, { field: 'count', direction: 'asc' });
            expect(ids(result)).toEqual([
                'CR_003', 'TL_001', 'CR_002', 'AR_002', 'CR_001', 'AR_001',
            ]);
        });

        it('descending', () => {
            const result = applyCardCollectionSort(rows, { field: 'count', direction: 'desc' });
            expect(ids(result)).toEqual([
                'AR_001', 'CR_001', 'AR_002', 'CR_002', 'CR_003', 'TL_001',
            ]);
        });
    });

    describe('sort by kind', () => {
        it('ascending (unit < artifact < talisman < ...)', () => {
            const result = applyCardCollectionSort(rows, { field: 'kind', direction: 'asc' });
            expect(ids(result)).toEqual([
                'CR_001', 'CR_002', 'CR_003',
                'AR_001', 'AR_002',
                'TL_001',
            ]);
        });

        it('descending', () => {
            const result = applyCardCollectionSort(rows, { field: 'kind', direction: 'desc' });
            expect(ids(result)).toEqual([
                'TL_001',
                'AR_001', 'AR_002',
                'CR_001', 'CR_002', 'CR_003',
            ]);
        });

        it('puts unknown kinds at the end in ascending order', () => {
            const mixed: CardCollectionRow[] = [
                { id: 'X', count: 1 },
                { id: 'A', count: 1, kind: 'unit' as CardKind, name: 'A' },
                { id: 'Y', count: 1 },
                { id: 'B', count: 1, kind: 'artifact' as CardKind, name: 'B' },
            ];
            const result = applyCardCollectionSort(mixed, { field: 'kind', direction: 'asc' });
            expect(ids(result)).toEqual(['A', 'B', 'X', 'Y']);
        });
    });

    describe('sort by name', () => {
        it('ascending', () => {
            const result = applyCardCollectionSort(rows, { field: 'name', direction: 'asc' });
            expect(ids(result)).toEqual([
                'CR_002', // Azure Serpent
                'CR_001', // Flame Tiger
                'TL_001', // Lightning Talisman
                'AR_002', // Shadow Cloak
                'AR_001', // Spirit Sword
                'CR_003', // Stone Golem
            ]);
        });

        it('descending', () => {
            const result = applyCardCollectionSort(rows, { field: 'name', direction: 'desc' });
            expect(ids(result)).toEqual([
                'CR_003', // Stone Golem
                'AR_001', // Spirit Sword
                'AR_002', // Shadow Cloak
                'TL_001', // Lightning Talisman
                'CR_001', // Flame Tiger
                'CR_002', // Azure Serpent
            ]);
        });

        it('puts cards without name at the beginning in ascending order', () => {
            const mixed: CardCollectionRow[] = [
                { id: 'Z', count: 1 },
                { id: 'A', count: 1, name: 'Alpha' },
                { id: 'Y', count: 1 },
                { id: 'B', count: 1, name: 'Beta' },
            ];
            const result = applyCardCollectionSort(mixed, { field: 'name', direction: 'asc' });
            expect(ids(result)).toEqual(['Z', 'Y', 'A', 'B']);
        });
    });

    describe('sort stability', () => {
        it('preserves insertion order for equal values', () => {
            const input: CardCollectionRow[] = [
                { id: 'B', count: 2, kind: 'unit' as CardKind },
                { id: 'A', count: 2, kind: 'unit' as CardKind },
                { id: 'C', count: 2, kind: 'unit' as CardKind },
            ];
            const result = applyCardCollectionSort(input, { field: 'count', direction: 'asc' });
            expect(ids(result)).toEqual(['B', 'A', 'C']);
        });
    });
});

// ─── computeCardCollectionViewModel ──────────────────────────────────

describe('computeCardCollectionViewModel', () => {
    it('runs the full pipeline: build → filter → sort', () => {
        const result = computeCardCollectionViewModel(STACKS, {
            metadata: METADATA,
            filters: { hideZeroCount: true },
            sort: { field: 'count', direction: 'desc' },
        });
        expect(ids(result)).toEqual(['AR_001', 'CR_001', 'AR_002', 'CR_002']);
    });

    it('returns all rows in insertion order when no options are given', () => {
        const result = computeCardCollectionViewModel(STACKS);
        expect(ids(result)).toEqual(['CR_001', 'CR_002', 'CR_003', 'AR_001', 'AR_002', 'TL_001']);
    });

    it('handles empty stacks with options', () => {
        const result = computeCardCollectionViewModel([], {
            metadata: METADATA,
            filters: { hideZeroCount: true, query: 'flame' },
            sort: { field: 'name', direction: 'asc' },
        });
        expect(result).toEqual([]);
    });

    it('does not mutate the input stacks', () => {
        const copy = [...STACKS];
        computeCardCollectionViewModel(STACKS, {
            metadata: METADATA,
            filters: { hideZeroCount: true },
            sort: { field: 'count', direction: 'desc' },
        });
        expect(STACKS).toEqual(copy);
    });

    it('does not mutate the metadata map', () => {
        const meta: CardMetadataMap = { ...METADATA };
        computeCardCollectionViewModel(STACKS, {
            metadata: meta,
            filters: { query: 'flame' },
            sort: { field: 'name', direction: 'asc' },
        });
        expect(meta).toEqual(METADATA);
    });
});
