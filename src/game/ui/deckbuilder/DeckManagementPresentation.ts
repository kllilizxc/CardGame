import type { CardKind, CardRarity } from '@data/types/cards/core';
import type { CardMetadata, CardMetadataMap } from '../../state/CardCollectionViewModel';
import { countDeckCards } from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, SavedDeck } from '../../types/expedition';

export type DeckSectionKey = 'main' | 'extra';

export interface DeckManagementTileViewModel {
    readonly id: string;
    readonly sourceIndex: number;
    readonly count: number;
    readonly section: DeckSectionKey;
    readonly displayName: string;
    readonly subtitle: string;
    readonly kind?: CardKind;
    readonly rarity?: CardRarity;
    readonly ownedCount: number;
    readonly remainingCount: number;
    readonly shortageCount: number;
}

export interface DeckManagementSectionDescriptor {
    readonly key: DeckSectionKey;
    readonly label: string;
    readonly shortLabel: string;
}

export interface DeckManagementSectionViewModel extends DeckManagementSectionDescriptor {
    readonly count: number;
    readonly entryCount: number;
    readonly tiles: readonly DeckManagementTileViewModel[];
}

export interface DeckManagementPresentationViewModel {
    readonly deckId: string;
    readonly deckName: string;
    readonly totalCount: number;
    readonly totalEntryCount: number;
    readonly sections: readonly DeckManagementSectionViewModel[];
}

export interface DeckManagementSectionClassifierContext {
    readonly deck: Readonly<SavedDeck>;
    readonly stack: Readonly<ExpeditionCardStack>;
    readonly metadata?: Readonly<CardMetadata>;
    readonly sourceIndex: number;
}

export type DeckManagementSectionClassifier = (
    context: DeckManagementSectionClassifierContext,
) => DeckSectionKey | null | undefined;

export interface DeckManagementPresentationOptions {
    readonly classifySection?: DeckManagementSectionClassifier;
}

export const DECK_SECTION_DESCRIPTORS: readonly DeckManagementSectionDescriptor[] = [
    { key: 'main', label: 'Main Deck', shortLabel: 'MAIN' },
    { key: 'extra', label: 'Extra Deck', shortLabel: 'EX' },
] as const;

const KIND_LABEL: Record<CardKind, string> = {
    unit: '生物',
    artifact: '神器',
    talisman: '护符',
    field: '场地',
    skill: '技能',
    pill: '丹药',
};

function resolveSectionKey(section: DeckSectionKey | null | undefined): DeckSectionKey {
    return section === 'extra' ? 'extra' : 'main';
}

function getStackCount(stacks: readonly ExpeditionCardStack[], cardId: string): number {
    return stacks.find((stack) => stack.id === cardId)?.count ?? 0;
}

function buildTileSubtitle(cardId: string, metadata?: Readonly<CardMetadata>): string {
    const parts: string[] = [];

    if (metadata?.name && metadata.name !== cardId) {
        parts.push(cardId);
    }

    if (metadata?.kind) {
        parts.push(KIND_LABEL[metadata.kind] ?? metadata.kind);
    }

    return parts.join(' · ');
}

function buildSectionTileViewModel(
    stack: ExpeditionCardStack,
    stashCards: readonly ExpeditionCardStack[],
    metadata: CardMetadataMap | undefined,
    section: DeckSectionKey,
    sourceIndex: number,
): DeckManagementTileViewModel {
    const entry = metadata?.[stack.id];
    const ownedCount = getStackCount(stashCards, stack.id);
    const remainingCount = Math.max(ownedCount - stack.count, 0);
    const shortageCount = Math.max(stack.count - ownedCount, 0);

    return {
        id: stack.id,
        sourceIndex,
        count: stack.count,
        section,
        displayName: entry?.name ?? stack.id,
        subtitle: buildTileSubtitle(stack.id, entry),
        kind: entry?.kind,
        rarity: entry?.rarity,
        ownedCount,
        remainingCount,
        shortageCount,
    };
}

export function buildDeckManagementPresentationViewModel(
    deck: Readonly<SavedDeck>,
    stashCards: readonly ExpeditionCardStack[],
    metadata?: CardMetadataMap,
    options: DeckManagementPresentationOptions = {},
): DeckManagementPresentationViewModel {
    const sectionBuckets: Record<DeckSectionKey, DeckManagementTileViewModel[]> = {
        main: [],
        extra: [],
    };

    deck.cards.forEach((stack, sourceIndex) => {
        if (stack.count <= 0) {
            return;
        }

        const section = resolveSectionKey(options.classifySection?.({
            deck,
            stack,
            metadata: metadata?.[stack.id],
            sourceIndex,
        }));

        sectionBuckets[section].push(
            buildSectionTileViewModel(stack, stashCards, metadata, section, sourceIndex),
        );
    });

    return {
        deckId: deck.id,
        deckName: deck.name,
        totalCount: countDeckCards(deck.cards),
        totalEntryCount: deck.cards.filter((stack) => stack.count > 0).length,
        sections: DECK_SECTION_DESCRIPTORS.map((descriptor) => {
            const tiles = sectionBuckets[descriptor.key];
            const count = tiles.reduce((total, tile) => total + tile.count, 0);

            return {
                ...descriptor,
                count,
                entryCount: tiles.length,
                tiles,
            };
        }),
    };
}

export function getDeckManagementSection(
    presentation: DeckManagementPresentationViewModel,
    section: DeckSectionKey,
): DeckManagementSectionViewModel {
    const sectionView = presentation.sections.find((entry) => entry.key === section);

    if (!sectionView) {
        throw new Error(`Unknown deck management section: ${section}`);
    }

    return sectionView;
}
