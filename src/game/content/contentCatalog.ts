import {
    validatePlayableStoryGraph,
    type StoryGraph,
} from '../scenes/story/storyFlow';
import { validateHubTownDefinition } from '../scenes/hub/hubTown';
import { validateWorldMapDefinition } from '../scenes/worldmap/worldMap';
import {
    validateStoryContentGraph,
    type StoryContentGraph,
} from '../types/storyContent';
import { validateCatalogContentIdReferences } from './contentIdRegistry';
import { validateCatalogRouteReferences } from './contentCatalogRouteReferences';
import {
    formatErrorMessage,
    isRecord,
    loadContentCatalogValidationIndex,
    type ContentKindValidator,
} from './contentCatalogValidationIndex';

export const CONTENT_CATALOG_PUBLIC_PATH = 'data/content-catalog.json';
export const CONTENT_CATALOG_CACHE_KEY = 'contentCatalog';
export const QINGYUN_WORLD_MAP_RESOURCE_ID = 'worldmap.qingyun-region';

export const CONTENT_RESOURCE_KINDS = [
    'worldMap',
    'hub',
    'story',
    'expeditionMap',
    'expeditionEvents',
    'expeditionShop',
    'deck',
    'encounter',
    'card',
    'status',
    'gongfa',
    'config',
    'worldSeed',
] as const;

export type ContentResourceKind = typeof CONTENT_RESOURCE_KINDS[number];

export interface ContentCatalogEntry {
    resourceId: string;
    kind: ContentResourceKind;
    schemaVersion: number;
    publicPath: string;
}

export interface ContentCatalogDefinition {
    schemaVersion: 1;
    resources: ContentCatalogEntry[];
}

export interface ContentCatalogFileSource {
    readText(publicPath: string): string | undefined;
}

export interface ContentCatalogValidationFailure {
    resourceId: string;
    publicPath?: string;
    message: string;
}

export interface ContentCatalogValidationResult {
    validatedResourceCount: number;
    registeredValidatorNames: string[];
    failures: ContentCatalogValidationFailure[];
}

export interface ContentCatalogResolverOptions {
    context: string;
    sourcePublicPath?: string;
}

export interface ContentCatalogResourceRequest {
    resourceId: string;
    expectedKind: ContentResourceKind;
}

export interface ContentCatalogPublicPathRequest {
    publicPath: string;
    expectedKind: ContentResourceKind;
}

export interface ContentCatalogResolver {
    resolveJsonResource(request: ContentCatalogResourceRequest): ContentCatalogEntry;
    resolveJsonResourceByPublicPath(request: ContentCatalogPublicPathRequest): ContentCatalogEntry;
}

const REGISTERED_VALIDATOR_NAMES = [
    'worldMap:validateWorldMapDefinition',
    'hub:validateHubTownDefinition',
    'story:validatePlayableStoryGraph|validateStoryContentGraph',
    'expedition:validatePrototypeExpeditionContent',
] as const;

const KIND_VALIDATORS: Partial<Record<ContentResourceKind, ContentKindValidator>> = {
    worldMap: validateWorldMapDefinition,
    hub: validateHubTownDefinition,
    story: validateStoryResource,
};

function readStringField(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }

    return value;
}

function readPositiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive integer.`);
    }

    return value;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object.`);
    }

    return value;
}

function parseContentResourceKind(value: unknown, label: string): ContentResourceKind {
    const kind = readStringField(value, label);

    if (!CONTENT_RESOURCE_KINDS.includes(kind as ContentResourceKind)) {
        throw new Error(`${label} must be one of ${CONTENT_RESOURCE_KINDS.join(', ')}.`);
    }

    return kind as ContentResourceKind;
}

function parseCatalogEntry(value: unknown, index: number): ContentCatalogEntry {
    const record = readRecord(value, `contentCatalog.resources[${index}]`);
    const publicPath = readStringField(record.publicPath, `contentCatalog.resources[${index}].publicPath`);

    if (publicPath.startsWith('/') || publicPath.startsWith('public/')) {
        throw new Error(
            `contentCatalog.resources[${index}].publicPath must be relative to public/, for example data/world/world-map.json.`,
        );
    }

    if (!publicPath.endsWith('.json')) {
        throw new Error(`contentCatalog.resources[${index}].publicPath must point to a JSON file.`);
    }

    return {
        resourceId: readStringField(record.resourceId, `contentCatalog.resources[${index}].resourceId`),
        kind: parseContentResourceKind(record.kind, `contentCatalog.resources[${index}].kind`),
        schemaVersion: readPositiveInteger(record.schemaVersion, `contentCatalog.resources[${index}].schemaVersion`),
        publicPath,
    };
}

function assertUniqueCatalogValues(entries: ContentCatalogEntry[], field: 'resourceId' | 'publicPath'): void {
    const seen = new Set<string>();

    for (const entry of entries) {
        const value = entry[field];

        if (seen.has(value)) {
            throw new Error(`contentCatalog.resources contains duplicate ${field}: ${value}`);
        }

        seen.add(value);
    }
}

export function parseContentCatalogDefinition(value: unknown): ContentCatalogDefinition {
    const record = readRecord(value, 'contentCatalog');

    if (record.schemaVersion !== 1) {
        throw new Error('contentCatalog.schemaVersion must be 1.');
    }

    if (!Array.isArray(record.resources)) {
        throw new Error('contentCatalog.resources must be an array.');
    }

    const resources = record.resources.map(parseCatalogEntry);

    if (resources.length === 0) {
        throw new Error('contentCatalog.resources must contain at least one resource.');
    }

    assertUniqueCatalogValues(resources, 'resourceId');
    assertUniqueCatalogValues(resources, 'publicPath');

    return {
        schemaVersion: 1,
        resources,
    };
}

export function createContentCatalogResolver(
    rawCatalog: unknown,
    options: ContentCatalogResolverOptions,
): ContentCatalogResolver {
    const sourcePublicPath = options.sourcePublicPath ?? CONTENT_CATALOG_PUBLIC_PATH;

    if (rawCatalog === undefined) {
        throw new Error(
            `${options.context} requires runtime content catalog ${sourcePublicPath}, but it was not loaded or is missing from the JSON cache.`,
        );
    }

    let catalog: ContentCatalogDefinition;

    try {
        catalog = parseContentCatalogDefinition(rawCatalog);
    } catch (error) {
        throw new Error(
            `${options.context} runtime content catalog ${sourcePublicPath} is malformed: ${formatErrorMessage(error)}`,
        );
    }

    const byResourceId = new Map<string, ContentCatalogEntry>();
    const byPublicPath = new Map<string, ContentCatalogEntry>();

    for (const entry of catalog.resources) {
        byResourceId.set(entry.resourceId, entry);
        byPublicPath.set(entry.publicPath, entry);
    }

    return {
        resolveJsonResource(request: ContentCatalogResourceRequest): ContentCatalogEntry {
            const entry = byResourceId.get(request.resourceId);

            if (!entry) {
                throw new Error(
                    `${options.context} could not resolve catalog resource ${request.resourceId}: no catalog entry exists for that resource id.`,
                );
            }

            if (entry.kind !== request.expectedKind) {
                throw new Error(
                    `${options.context} could not resolve catalog resource ${request.resourceId}: catalog resource has kind ${entry.kind}; expected ${request.expectedKind}.`,
                );
            }

            return { ...entry };
        },
        resolveJsonResourceByPublicPath(request: ContentCatalogPublicPathRequest): ContentCatalogEntry {
            const entry = byPublicPath.get(request.publicPath);

            if (!entry) {
                throw new Error(
                    `${options.context} could not resolve catalog public path ${request.publicPath}: no catalog entry exists for that public path.`,
                );
            }

            if (entry.kind !== request.expectedKind) {
                throw new Error(
                    `${options.context} could not resolve catalog public path ${request.publicPath}: catalog resource ${entry.resourceId} has kind ${entry.kind}; expected ${request.expectedKind}.`,
                );
            }

            return { ...entry };
        },
    };
}

function validateStoryResource(json: unknown): StoryGraph | StoryContentGraph {
    const record = readRecord(json, 'story resource');

    if (typeof record.storyId === 'string') {
        return validatePlayableStoryGraph(json);
    }

    if (record.schemaVersion === 1 && typeof record.id === 'string') {
        return validateStoryContentGraph(json);
    }

    throw new Error('Story resources must declare either storyId for playable StoryState graphs or schemaVersion/id for executable story content graphs.');
}

export function validateContentCatalog(
    rawCatalog: unknown,
    fileSource: ContentCatalogFileSource,
): ContentCatalogValidationResult {
    const failures: ContentCatalogValidationFailure[] = [];
    let catalog: ContentCatalogDefinition;

    try {
        catalog = parseContentCatalogDefinition(rawCatalog);
    } catch (error) {
        return {
            validatedResourceCount: 0,
            registeredValidatorNames: [...REGISTERED_VALIDATOR_NAMES],
            failures: [
                {
                    resourceId: 'content-catalog',
                    publicPath: CONTENT_CATALOG_PUBLIC_PATH,
                    message: `Content catalog manifest is invalid: ${formatErrorMessage(error)}.`,
                },
            ],
        };
    }

    const { index, validatedResourceCount } = loadContentCatalogValidationIndex(catalog, fileSource, KIND_VALIDATORS, failures);

    validateCatalogContentIdReferences(index.byResourceId.values(), failures);
    validateCatalogRouteReferences(index, failures);

    return {
        validatedResourceCount,
        registeredValidatorNames: [...REGISTERED_VALIDATOR_NAMES],
        failures,
    };
}
