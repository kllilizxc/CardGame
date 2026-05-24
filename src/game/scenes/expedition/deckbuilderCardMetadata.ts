import type { CardKind } from '@data/types/cards/core';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
} from '../../content/contentCatalog';

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

const CARD_KIND_VALUES: CardKind[] = ['unit', 'artifact', 'talisman', 'field', 'skill', 'pill'];

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCardKind(value: unknown): value is CardKind {
    return typeof value === 'string' && CARD_KIND_VALUES.includes(value as CardKind);
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

export function buildDeckbuilderCardMetadataMap(
    resources: DeckbuilderCardMetadataResources,
    readJson: (cacheKey: DeckbuilderCardMetadataCacheKey) => unknown,
): CardMetadataMap {
    const metadata: Record<string, { kind?: CardKind; name?: string }> = {};

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

            metadata[entry.id] = next;
        });
    });

    return metadata;
}
