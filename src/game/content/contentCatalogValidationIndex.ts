import type {
    ContentCatalogDefinition,
    ContentCatalogEntry,
    ContentCatalogFileSource,
    ContentCatalogValidationFailure,
    ContentResourceKind,
} from './contentCatalog';
import type { ExpeditionMapNode } from '../types/expedition';

export interface LoadedCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
    validated?: unknown;
}

export interface LoadedCatalogIndex {
    byPath: Map<string, LoadedCatalogResource>;
    byResourceId: Map<string, LoadedCatalogResource>;
}

export type ContentKindValidator = (json: unknown) => unknown;
export type ContentKindValidatorMap = Partial<Record<ContentResourceKind, ContentKindValidator>>;

export interface ContentCatalogResourceIdReference {
    context: string;
    resourceIdField: string;
    resourceId: string;
    publicPathField: string;
    publicPath: string;
    expectedKinds: ContentResourceKind[];
    publicPathOwnerLabel?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function addFailure(
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

function getRequiredDomainIdField(kind: ContentResourceKind, json: unknown): string | undefined {
    if (kind === 'story') {
        const record = isRecord(json) ? json : undefined;

        if (typeof record?.storyId === 'string') {
            return 'storyId';
        }

        if (typeof record?.id === 'string') {
            return 'id';
        }

        return 'storyId|id';
    }

    const fieldByKind: Partial<Record<ContentResourceKind, string>> = {
        worldMap: 'id',
        hub: 'hubId',
        expeditionMap: 'id',
        expeditionEvents: 'id',
        expeditionShop: 'id',
        encounter: 'id',
    };

    return fieldByKind[kind];
}

function readDomainId(kind: ContentResourceKind, json: unknown): { field: string; value?: string } | undefined {
    const field = getRequiredDomainIdField(kind, json);

    if (!field) {
        return undefined;
    }

    const record = isRecord(json) ? json : undefined;
    const value = field === 'storyId|id'
        ? undefined
        : record && typeof record[field] === 'string'
            ? record[field]
            : undefined;

    return { field, value };
}

export function validateResourceDomainId(
    entry: ContentCatalogEntry,
    json: unknown,
    failures: ContentCatalogValidationFailure[],
): void {
    const domainId = readDomainId(entry.kind, json);

    if (!domainId) {
        return;
    }

    if (!domainId.value) {
        addFailure(
            failures,
            entry,
            `Catalog resource ${entry.resourceId} (${entry.kind}) must declare top-level ${domainId.field} so the catalog can verify its domain id.`,
        );
        return;
    }

    if (domainId.value !== entry.resourceId) {
        addFailure(
            failures,
            entry,
            `Catalog resource ${entry.resourceId} (${entry.kind}) domain id mismatch: ${entry.publicPath} declares ${domainId.field} "${domainId.value}".`,
        );
    }
}

export function loadContentCatalogValidationIndex(
    catalog: ContentCatalogDefinition,
    fileSource: ContentCatalogFileSource,
    kindValidators: ContentKindValidatorMap,
    failures: ContentCatalogValidationFailure[],
): { index: LoadedCatalogIndex; validatedResourceCount: number } {
    const byPath = new Map<string, LoadedCatalogResource>();
    const byResourceId = new Map<string, LoadedCatalogResource>();
    let validatedResourceCount = 0;

    for (const entry of catalog.resources) {
        const loadedResource: LoadedCatalogResource = { entry };
        byPath.set(entry.publicPath, loadedResource);
        byResourceId.set(entry.resourceId, loadedResource);

        const text = fileSource.readText(entry.publicPath);

        if (text === undefined) {
            addFailure(
                failures,
                entry,
                `Catalog resource ${entry.resourceId} (${entry.kind}) is missing JSON file at public/${entry.publicPath}.`,
            );
            continue;
        }

        try {
            loadedResource.json = JSON.parse(text);
        } catch (error) {
            addFailure(
                failures,
                entry,
                `Catalog resource ${entry.resourceId} (${entry.kind}) at public/${entry.publicPath} is not parseable JSON: ${formatErrorMessage(error)}.`,
            );
            continue;
        }

        const failuresBeforeResourceValidation = failures.length;
        validateResourceDomainId(entry, loadedResource.json, failures);

        const validator = kindValidators[entry.kind];

        if (validator) {
            try {
                loadedResource.validated = validator(loadedResource.json);
            } catch (error) {
                addFailure(
                    failures,
                    entry,
                    `Catalog resource ${entry.resourceId} (${entry.kind}) failed registered pure validator for ${entry.publicPath}: ${formatErrorMessage(error)}.`,
                );
            }
        }

        if (failures.length === failuresBeforeResourceValidation) {
            validatedResourceCount += 1;
        }
    }

    return {
        index: {
            byPath,
            byResourceId,
        },
        validatedResourceCount,
    };
}

export function requireCatalogedResource(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
    ownerEntry: ContentCatalogEntry,
    referencePath: string,
    context: string,
    allowedKinds?: ContentResourceKind[],
): LoadedCatalogResource | undefined {
    const resource = index.byPath.get(referencePath);

    if (!resource) {
        addFailure(
            failures,
            ownerEntry,
            `${context} references ${referencePath}, but no catalog entry exists for that public path.`,
        );
        return undefined;
    }

    if (allowedKinds && !allowedKinds.includes(resource.entry.kind)) {
        addFailure(
            failures,
            ownerEntry,
            `${context} references ${referencePath}, but catalog resource ${resource.entry.resourceId} has kind ${resource.entry.kind}; expected ${allowedKinds.join(' or ')}.`,
        );
    }

    return resource;
}

export function resolveCatalogResourceIdReference(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
    ownerEntry: ContentCatalogEntry,
    reference: ContentCatalogResourceIdReference,
): LoadedCatalogResource | undefined {
    const resource = index.byResourceId.get(reference.resourceId);

    if (!resource) {
        addFailure(
            failures,
            ownerEntry,
            `${reference.context} ${reference.resourceIdField} references catalog resource id ${reference.resourceId}, but no catalog entry exists for that resource id.`,
        );
        return undefined;
    }

    let failed = false;

    if (!reference.expectedKinds.includes(resource.entry.kind)) {
        addFailure(
            failures,
            ownerEntry,
            `${reference.context} ${reference.resourceIdField} references catalog resource id ${reference.resourceId}, but catalog resource has kind ${resource.entry.kind}; expected ${reference.expectedKinds.join(' or ')}.`,
        );
        failed = true;
    }

    if (resource.entry.publicPath !== reference.publicPath) {
        const publicPathOwnerLabel = reference.publicPathOwnerLabel ?? 'destination';

        addFailure(
            failures,
            ownerEntry,
            `${reference.context} ${reference.resourceIdField} references catalog resource id ${reference.resourceId}, but catalog publicPath is ${resource.entry.publicPath}; ${publicPathOwnerLabel} ${reference.publicPathField} is ${reference.publicPath}.`,
        );
        failed = true;
    }

    return failed ? undefined : resource;
}

export function findFirstContentResourceForMapNode(
    index: LoadedCatalogIndex,
    nodes: ExpeditionMapNode[],
    nodeType: 'event' | 'shop',
): LoadedCatalogResource | undefined {
    for (const node of nodes) {
        if (node.type === nodeType && isRecord(node.payloadRef) && typeof node.payloadRef.contentFile === 'string') {
            return index.byPath.get(node.payloadRef.contentFile);
        }
    }

    return undefined;
}

export function findFirstResourceByKind(
    index: LoadedCatalogIndex,
    kind: ContentResourceKind,
): LoadedCatalogResource | undefined {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind === kind) {
            return resource;
        }
    }

    return undefined;
}
