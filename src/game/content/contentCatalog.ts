import {
    validatePlayableStoryGraph,
    type StoryGraph,
} from '../scenes/story/storyFlow';
import {
    validateHubTownDefinition,
    type HubTownDefinition,
} from '../scenes/hub/hubTown';
import {
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapExpeditionDestination,
    type WorldMapHubDestination,
} from '../scenes/worldmap/worldMap';
import {
    validatePrototypeExpeditionContent,
} from '../types/prototypeExpeditionContent';
import {
    validateStoryContentGraph,
    type StoryContentGraph,
} from '../types/storyContent';
import { validateCatalogContentIdReferences } from './contentIdRegistry';
import type {
    ExpeditionEncounterMapNode,
    EventMapNode,
    ExpeditionMapDefinition,
    ExpeditionMapNode,
    PrototypeEventCollection,
    PrototypeShopCollection,
    ShopMapNode,
} from '../types/expedition';

export const CONTENT_CATALOG_PUBLIC_PATH = 'data/content-catalog.json';

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

interface LoadedCatalogResource {
    entry: ContentCatalogEntry;
    json?: unknown;
    validated?: unknown;
}

interface LoadedCatalogIndex {
    byPath: Map<string, LoadedCatalogResource>;
    byResourceId: Map<string, LoadedCatalogResource>;
}

type ContentKindValidator = (json: unknown) => unknown;

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function validateResourceDomainId(
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

function loadCatalogResources(
    catalog: ContentCatalogDefinition,
    fileSource: ContentCatalogFileSource,
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

        const validator = KIND_VALIDATORS[entry.kind];

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

function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function requireCatalogedResource(
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

function isWorldMapDefinition(value: unknown): value is WorldMapDefinition {
    return isRecord(value) && Array.isArray(value.destinations) && typeof value.id === 'string';
}

function isHubTownDefinition(value: unknown): value is HubTownDefinition {
    return isRecord(value) && Array.isArray(value.locations) && typeof value.hubId === 'string';
}

function isStoryGraph(value: unknown): value is StoryGraph {
    return isRecord(value) && typeof value.storyId === 'string' && Array.isArray(value.nodes) && Array.isArray(value.choices);
}

function isExpeditionMapDefinition(value: unknown): value is ExpeditionMapDefinition {
    return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.nodes);
}

function isPrototypeEventCollection(value: unknown): value is PrototypeEventCollection {
    return isRecord(value) && typeof value.id === 'string' && isRecord(value.eventsByNodeId);
}

function isPrototypeShopCollection(value: unknown): value is PrototypeShopCollection {
    return isRecord(value) && typeof value.id === 'string' && isRecord(value.shopsByNodeId);
}

function validateWorldMapReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'worldMap' || !isWorldMapDefinition(resource.validated)) {
            continue;
        }

        for (const destination of resource.validated.destinations) {
            if (destination.kind === 'hub') {
                validateWorldMapHubDestinationReferences(resource.entry, destination, index, failures);
            } else {
                validateWorldMapExpeditionDestinationReferences(resource.entry, destination, index, failures);
            }
        }
    }
}

function validateWorldMapHubDestinationReferences(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapHubDestination,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `WorldMap ${ownerEntry.resourceId} destination ${destination.id} hubFile`;
    const hubResource = requireCatalogedResource(index, failures, ownerEntry, destination.hubFile, context, ['hub']);

    if (!hubResource || !isHubTownDefinition(hubResource.validated)) {
        return;
    }

    if (hubResource.validated.hubId !== destination.hubId) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} expects hubId ${destination.hubId}, but ${destination.hubFile} declares ${hubResource.validated.hubId}.`,
        );
    }

    if (destination.targetLocationId && !hubResource.validated.locations.some((location) => location.id === destination.targetLocationId)) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} targetLocationId ${destination.targetLocationId} does not exist in ${destination.hubFile}.`,
        );
    }
}

function validateWorldMapExpeditionDestinationReferences(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        destination.worldStateFile,
        `WorldMap ${ownerEntry.resourceId} destination ${destination.id} worldStateFile`,
        ['worldSeed'],
    );
    requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        destination.starterDeckFile,
        `WorldMap ${ownerEntry.resourceId} destination ${destination.id} starterDeckFile`,
        ['deck'],
    );
    const mapResource = requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        destination.mapFile,
        `WorldMap ${ownerEntry.resourceId} destination ${destination.id} mapFile`,
        ['expeditionMap'],
    );
    requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        destination.eventsFile,
        `WorldMap ${ownerEntry.resourceId} destination ${destination.id} eventsFile`,
        ['expeditionEvents'],
    );
    requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        destination.shopFile,
        `WorldMap ${ownerEntry.resourceId} destination ${destination.id} shopFile`,
        ['expeditionShop'],
    );

    if (!mapResource || !isExpeditionMapDefinition(mapResource.json)) {
        return;
    }

    if (mapResource.json.id !== destination.mapId) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} expects mapId ${destination.mapId}, but ${destination.mapFile} declares ${mapResource.json.id}.`,
        );
    }

    validateWorldMapExpeditionContentFileAlignment(ownerEntry, destination, mapResource.json, failures);
}

function validateWorldMapExpeditionContentFileAlignment(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    map: ExpeditionMapDefinition,
    failures: ContentCatalogValidationFailure[],
): void {
    map.nodes.forEach((node, nodeIndex) => {
        if (!isRecord(node)) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} map nodes[${nodeIndex}] must be an object before Expedition content-file alignment can be validated.`,
            );
            return;
        }

        if (node.type !== 'event' && node.type !== 'shop') {
            return;
        }

        const nodeId = readDiagnosticNodeId(node, `nodes[${nodeIndex}]`);
        const contentFile = readWorldMapExpeditionNodeContentFile(ownerEntry, destination, node, nodeId, failures);

        if (!contentFile) {
            return;
        }

        if (node.type === 'event' && contentFile !== destination.eventsFile) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} eventsFile is ${destination.eventsFile}, but map node ${nodeId} references ${contentFile}.`,
            );
        }

        if (node.type === 'shop' && contentFile !== destination.shopFile) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} shopFile is ${destination.shopFile}, but map node ${nodeId} references ${contentFile}.`,
            );
        }
    });
}

function readDiagnosticNodeId(node: Record<string, unknown>, fallback: string): string {
    return typeof node.id === 'string' && node.id.trim().length > 0 ? node.id : fallback;
}

function readWorldMapExpeditionNodeContentFile(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    node: Record<string, unknown>,
    nodeId: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const context = `WorldMap ${ownerEntry.resourceId} destination ${destination.id} map node ${nodeId} payloadRef`;

    if (!isRecord(node.payloadRef)) {
        addFailure(
            failures,
            ownerEntry,
            `${context} must be an object before Expedition content-file alignment can be validated.`,
        );
        return undefined;
    }

    const contentFile = node.payloadRef.contentFile;

    if (typeof contentFile !== 'string' || contentFile.trim().length === 0) {
        addFailure(
            failures,
            ownerEntry,
            `${context}.contentFile must be a non-empty string before Expedition content-file alignment can be validated.`,
        );
        return undefined;
    }

    return contentFile;
}

function validateHubReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'hub' || !isHubTownDefinition(resource.validated)) {
            continue;
        }

        for (const location of resource.validated.locations) {
            for (const action of location.actions) {
                if (action.kind !== 'startStory') {
                    continue;
                }

                requireCatalogedResource(
                    index,
                    failures,
                    resource.entry,
                    action.storyGraphFile,
                    `Hub ${resource.entry.resourceId} location ${location.id} action ${action.id} storyGraphFile`,
                    ['story'],
                );
            }
        }
    }
}

function validateStoryBattleReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'story' || !isStoryGraph(resource.validated)) {
            continue;
        }

        resource.validated.nodes.forEach((node, nodeIndex) => {
            node.onEnter.forEach((effect, effectIndex) => {
                if (effect.kind === 'startBattle') {
                    validateStoryBattleTriggerReferences(
                        resource.entry,
                        effect.battle.encounterFile,
                        effect.battle.encounterId,
                        effect.battle.deckFile,
                        `Story ${resource.entry.resourceId} nodes[${nodeIndex}] ${node.id} onEnter[${effectIndex}].battle`,
                        index,
                        failures,
                    );
                }
            });
        });

        resource.validated.choices.forEach((choice, choiceIndex) => {
            choice.effects.forEach((effect, effectIndex) => {
                if (effect.kind === 'startBattle') {
                    validateStoryBattleTriggerReferences(
                        resource.entry,
                        effect.battle.encounterFile,
                        effect.battle.encounterId,
                        effect.battle.deckFile,
                        `Story ${resource.entry.resourceId} choices[${choiceIndex}] ${choice.id} effects[${effectIndex}].battle`,
                        index,
                        failures,
                    );
                }
            });
        });
    }
}

function validateStoryBattleTriggerReferences(
    ownerEntry: ContentCatalogEntry,
    encounterFile: string,
    encounterId: string,
    deckFile: string,
    context: string,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    validateEncounterFileReference(ownerEntry, encounterFile, encounterId, `${context}.encounterFile`, index, failures);
    requireCatalogedResource(index, failures, ownerEntry, deckFile, `${context}.deckFile`, ['deck']);
}

function validateExpeditionReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'expeditionMap' || !isExpeditionMapDefinition(resource.json)) {
            continue;
        }

        validateExpeditionMapNodeReferences(resource.entry, resource.json, index, failures);
        validateExpeditionMapWithRegisteredBundleValidator(resource.entry, resource.json, index, failures);
    }
}

function validateExpeditionMapNodeReferences(
    ownerEntry: ContentCatalogEntry,
    map: ExpeditionMapDefinition,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    map.nodes.forEach((node, nodeIndex) => {
        if (!isRecord(node)) {
            addFailure(
                failures,
                ownerEntry,
                `Expedition map ${ownerEntry.resourceId} nodes[${nodeIndex}] must be an object before route-critical references can be validated.`,
            );
            return;
        }

        const typedNode = node as ExpeditionMapNode;

        if (typedNode.type === 'battle' || typedNode.type === 'boss') {
            validateEncounterNodeReference(ownerEntry, typedNode, index, failures);
        }

        if (typedNode.type === 'event') {
            validateEventNodeReference(ownerEntry, typedNode, index, failures);
        }

        if (typedNode.type === 'shop') {
            validateShopNodeReference(ownerEntry, typedNode, index, failures);
        }
    });
}

function validateEncounterNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: ExpeditionEncounterMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const encounterFile = readPayloadString(ownerEntry, payloadRef, 'encounterFile', context, failures);
    const encounterId = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);

    if (!encounterFile || !encounterId) {
        return;
    }

    validateEncounterFileReference(
        ownerEntry,
        encounterFile,
        encounterId,
        `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef.encounterFile`,
        index,
        failures,
    );
}

function validateEventNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: EventMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const contentFile = readPayloadString(ownerEntry, payloadRef, 'contentFile', context, failures);
    const eventRef = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);

    if (!contentFile || !eventRef) {
        return;
    }

    const eventResource = requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        contentFile,
        `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef.contentFile`,
        ['expeditionEvents'],
    );

    if (!eventResource || !isPrototypeEventCollection(eventResource.json)) {
        return;
    }

    if (!(eventRef in eventResource.json.eventsByNodeId)) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} node ${node.id} event ref ${eventRef} is missing from ${contentFile}.eventsByNodeId.`,
        );
    }
}

function validateShopNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: ShopMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const contentFile = readPayloadString(ownerEntry, payloadRef, 'contentFile', context, failures);
    const shopRef = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);

    if (!contentFile || !shopRef) {
        return;
    }

    const shopResource = requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        contentFile,
        `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef.contentFile`,
        ['expeditionShop'],
    );

    if (!shopResource || !isPrototypeShopCollection(shopResource.json)) {
        return;
    }

    if (!(shopRef in shopResource.json.shopsByNodeId)) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} node ${node.id} shop ref ${shopRef} is missing from ${contentFile}.shopsByNodeId.`,
        );
    }
}

function readExpeditionPayloadRef(
    ownerEntry: ContentCatalogEntry,
    node: ExpeditionMapNode,
    context: string,
    failures: ContentCatalogValidationFailure[],
): Record<string, unknown> | undefined {
    if (!isRecord(node.payloadRef)) {
        addFailure(
            failures,
            ownerEntry,
            `${context} must be an object before route-critical references can be validated.`,
        );
        return undefined;
    }

    return node.payloadRef;
}

function readPayloadString(
    ownerEntry: ContentCatalogEntry,
    payloadRef: Record<string, unknown> | undefined,
    field: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    if (!payloadRef) {
        return undefined;
    }

    const value = payloadRef[field];

    if (typeof value !== 'string' || value.trim().length === 0) {
        addFailure(
            failures,
            ownerEntry,
            `${context}.${field} must be a non-empty string before route-critical references can be validated.`,
        );
        return undefined;
    }

    return value;
}

function validateEncounterFileReference(
    ownerEntry: ContentCatalogEntry,
    encounterFile: string,
    expectedEncounterId: string,
    context: string,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const encounterResource = requireCatalogedResource(index, failures, ownerEntry, encounterFile, context, ['encounter']);

    if (!encounterResource || !isRecord(encounterResource.json)) {
        return;
    }

    const declaredEncounterId = encounterResource.json.id;

    if (typeof declaredEncounterId === 'string' && declaredEncounterId !== expectedEncounterId) {
        addFailure(
            failures,
            ownerEntry,
            `${context} expects encounterId ${expectedEncounterId}, but ${encounterFile} declares ${declaredEncounterId}.`,
        );
    }
}

function validateExpeditionMapWithRegisteredBundleValidator(
    ownerEntry: ContentCatalogEntry,
    map: ExpeditionMapDefinition,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const firstEventResource = findFirstContentResourceForMapNode(index, map.nodes, 'event')
        ?? findFirstResourceByKind(index, 'expeditionEvents');
    const firstShopResource = findFirstContentResourceForMapNode(index, map.nodes, 'shop')
        ?? findFirstResourceByKind(index, 'expeditionShop');

    if (!firstEventResource?.json || !firstShopResource?.json) {
        return;
    }

    try {
        validatePrototypeExpeditionContent({
            map,
            events: firstEventResource.json,
            shops: firstShopResource.json,
        });
    } catch (error) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} failed registered pure validator validatePrototypeExpeditionContent with ${firstEventResource.entry.publicPath} and ${firstShopResource.entry.publicPath}: ${formatErrorMessage(error)}.`,
        );
    }
}

function findFirstContentResourceForMapNode(
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

function findFirstResourceByKind(
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

    const { index, validatedResourceCount } = loadCatalogResources(catalog, fileSource, failures);

    validateCatalogContentIdReferences(index.byResourceId.values(), failures);
    validateWorldMapReferences(index, failures);
    validateHubReferences(index, failures);
    validateStoryBattleReferences(index, failures);
    validateExpeditionReferences(index, failures);

    return {
        validatedResourceCount,
        registeredValidatorNames: [...REGISTERED_VALIDATOR_NAMES],
        failures,
    };
}
