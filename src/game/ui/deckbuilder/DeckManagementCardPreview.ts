import type { PreviewCardData } from '../../managers/common/cardPreviewProtocol';
import type { DeckbuilderCardMetadataResources } from '../../scenes/expedition/deckbuilderCardMetadata';

export const DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID = 'deck-management';

export type DeckManagementCardPreviewResolver = (cardId: string) => PreviewCardData | null;

const SUPPORTED_PREVIEW_KINDS = new Set<PreviewCardData['kind']>([
    'unit',
    'artifact',
    'talisman',
    'field',
    'pill',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPreviewCardData(value: unknown): value is PreviewCardData {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.id === 'string'
        && typeof value.kind === 'string'
        && SUPPORTED_PREVIEW_KINDS.has(value.kind as PreviewCardData['kind']);
}

export function buildDeckManagementCardPreviewResolver(
    resources: DeckbuilderCardMetadataResources,
    readJson: (cacheKey: keyof DeckbuilderCardMetadataResources) => unknown,
): DeckManagementCardPreviewResolver {
    const previewCards = new Map<string, PreviewCardData>();

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
            if (!isPreviewCardData(entry)) {
                return;
            }

            previewCards.set(entry.id, entry);
        });
    });

    return (cardId: string) => previewCards.get(cardId) ?? null;
}
