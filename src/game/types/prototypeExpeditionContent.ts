// Dev-time contract validator for the Phase 01 prototype expedition JSON.
import prototypeEventsJson from '../../../public/data/mijing/prototype-events.json';
import prototypeMapJson from '../../../public/data/mijing/prototype-map.json';
import prototypeShopJson from '../../../public/data/mijing/prototype-shop.json';

import type {
    ExpeditionCardStack,
    ExpeditionContentMapNode,
    ExpeditionEncounterMapNode,
    ExpeditionItemStack,
    ExpeditionItemType,
    ExpeditionMapDefinition,
    ExpeditionMapNode,
    ExpeditionNodeType,
    PrototypeEventDefinition,
    PrototypeEventOutcome,
    PrototypeEventCollection,
    PrototypeShopDefinition,
    PrototypeShopOffer,
    PrototypeShopCollection,
    RunRewardBundle,
} from './expedition';

export interface PrototypeExpeditionContentBundle {
    map: ExpeditionMapDefinition;
    events: PrototypeEventCollection;
    shops: PrototypeShopCollection;
}

const EXPEDITION_NODE_TYPES: ExpeditionNodeType[] = ['entrance', 'battle', 'event', 'shop', 'extract', 'boss'];
const EXPEDITION_ITEM_TYPES: ExpeditionItemType[] = ['artifact', 'tool', 'consumable', 'quest'];
const REQUIRED_PROTOTYPE_NODE_TYPES: ExpeditionNodeType[] = ['entrance', 'battle', 'event', 'shop', 'extract', 'boss'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object.`);
    }

    return value;
}

function expectString(value: unknown, label: string): string {
    if (typeof value !== 'string') {
        throw new Error(`${label} must be a string.`);
    }

    return value;
}

function expectOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return expectString(value, label);
}

function expectNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`${label} must be a number.`);
    }

    return value;
}

function expectStringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        throw new Error(`${label} must be a string array.`);
    }

    return value;
}

function expectLiteral<T extends string>(value: unknown, expected: T, label: string): T {
    if (value !== expected) {
        throw new Error(`${label} must be "${expected}".`);
    }

    return expected;
}

function parseNodeType(value: unknown, label: string): ExpeditionNodeType {
    const parsed = expectString(value, label);

    if (!EXPEDITION_NODE_TYPES.includes(parsed as ExpeditionNodeType)) {
        throw new Error(`${label} must be one of ${EXPEDITION_NODE_TYPES.join(', ')}.`);
    }

    return parsed as ExpeditionNodeType;
}

function parseItemType(value: unknown, label: string): ExpeditionItemType {
    const parsed = expectString(value, label);

    if (!EXPEDITION_ITEM_TYPES.includes(parsed as ExpeditionItemType)) {
        throw new Error(`${label} must be one of ${EXPEDITION_ITEM_TYPES.join(', ')}.`);
    }

    return parsed as ExpeditionItemType;
}

function parseCardStack(value: unknown, label: string): ExpeditionCardStack {
    const record = expectRecord(value, label);

    return {
        id: expectString(record.id, `${label}.id`),
        count: expectNumber(record.count, `${label}.count`),
    };
}

function parseItemStack(value: unknown, label: string): ExpeditionItemStack {
    const record = expectRecord(value, label);

    return {
        id: expectString(record.id, `${label}.id`),
        itemType: parseItemType(record.itemType, `${label}.itemType`),
        count: expectNumber(record.count, `${label}.count`),
    };
}

function parseRewardBundle(value: unknown, label: string): RunRewardBundle {
    const record = expectRecord(value, label);
    const cards = Array.isArray(record.cards) ? record.cards : [];
    const items = Array.isArray(record.items) ? record.items : [];

    return {
        cards: cards.map((entry, index) => parseCardStack(entry, `${label}.cards[${index}]`)),
        items: items.map((entry, index) => parseItemStack(entry, `${label}.items[${index}]`)),
        spiritStones: expectNumber(record.spiritStones, `${label}.spiritStones`),
    };
}

function parseMapNode(value: unknown, label: string): ExpeditionMapNode {
    const record = expectRecord(value, label);
    const type = parseNodeType(record.type, `${label}.type`);
    const payloadRef = expectRecord(record.payloadRef, `${label}.payloadRef`);
    const baseNode = {
        id: expectString(record.id, `${label}.id`),
        type,
        layer: expectNumber(record.layer, `${label}.layer`),
        label: expectString(record.label, `${label}.label`),
        outgoingNodeIds: expectStringArray(record.outgoingNodeIds, `${label}.outgoingNodeIds`),
    };

    switch (type) {
        case 'entrance':
            return {
                ...baseNode,
                type,
                payloadRef: {
                    kind: expectLiteral(payloadRef.kind, 'entrance', `${label}.payloadRef.kind`),
                    ref: expectString(payloadRef.ref, `${label}.payloadRef.ref`),
                },
            };
        case 'battle':
        case 'boss':
            {
                const encounterResourceId = expectOptionalString(
                    payloadRef.encounterResourceId,
                    `${label}.payloadRef.encounterResourceId`,
                );

                return {
                    ...baseNode,
                    type,
                    payloadRef: {
                        kind: expectLiteral(payloadRef.kind, 'encounter', `${label}.payloadRef.kind`),
                        ref: expectString(payloadRef.ref, `${label}.payloadRef.ref`),
                        ...(encounterResourceId ? { encounterResourceId } : {}),
                        encounterFile: expectString(payloadRef.encounterFile, `${label}.payloadRef.encounterFile`),
                    },
                };
            }
        case 'event':
            return {
                ...baseNode,
                type,
                payloadRef: {
                    kind: expectLiteral(payloadRef.kind, 'event', `${label}.payloadRef.kind`),
                    ref: expectString(payloadRef.ref, `${label}.payloadRef.ref`),
                    contentFile: expectString(payloadRef.contentFile, `${label}.payloadRef.contentFile`),
                },
            };
        case 'shop':
            return {
                ...baseNode,
                type,
                payloadRef: {
                    kind: expectLiteral(payloadRef.kind, 'shop', `${label}.payloadRef.kind`),
                    ref: expectString(payloadRef.ref, `${label}.payloadRef.ref`),
                    contentFile: expectString(payloadRef.contentFile, `${label}.payloadRef.contentFile`),
                },
            };
        case 'extract':
            return {
                ...baseNode,
                type,
                payloadRef: {
                    kind: expectLiteral(payloadRef.kind, 'extract', `${label}.payloadRef.kind`),
                    ref: expectString(payloadRef.ref, `${label}.payloadRef.ref`),
                },
            };
    }
}

function parseEventOutcome(value: unknown, label: string): PrototypeEventOutcome {
    const record = expectRecord(value, label);

    return {
        id: expectString(record.id, `${label}.id`),
        weight: expectNumber(record.weight, `${label}.weight`),
        label: expectString(record.label, `${label}.label`),
        description: expectString(record.description, `${label}.description`),
        rewards: parseRewardBundle(record.rewards, `${label}.rewards`),
    };
}

function parseEventDefinition(value: unknown, label: string): PrototypeEventDefinition {
    const record = expectRecord(value, label);
    const pool = Array.isArray(record.pool) ? record.pool : [];

    return {
        nodeId: expectString(record.nodeId, `${label}.nodeId`),
        title: expectString(record.title, `${label}.title`),
        description: expectString(record.description, `${label}.description`),
        pool: pool.map((entry, index) => parseEventOutcome(entry, `${label}.pool[${index}]`)),
    };
}

function parseShopOffer(value: unknown, label: string): PrototypeShopOffer {
    const record = expectRecord(value, label);
    const cost = expectRecord(record.cost, `${label}.cost`);

    return {
        id: expectString(record.id, `${label}.id`),
        label: expectString(record.label, `${label}.label`),
        description: expectString(record.description, `${label}.description`),
        cost: {
            spiritStones: expectNumber(cost.spiritStones, `${label}.cost.spiritStones`),
        },
        rewards: parseRewardBundle(record.rewards, `${label}.rewards`),
    };
}

function parseShopDefinition(value: unknown, label: string): PrototypeShopDefinition {
    const record = expectRecord(value, label);
    const offers = Array.isArray(record.offers) ? record.offers : [];

    return {
        nodeId: expectString(record.nodeId, `${label}.nodeId`),
        title: expectString(record.title, `${label}.title`),
        description: expectString(record.description, `${label}.description`),
        offers: offers.map((entry, index) => parseShopOffer(entry, `${label}.offers[${index}]`)),
    };
}

function parseExpeditionMapDefinition(value: unknown): ExpeditionMapDefinition {
    const record = expectRecord(value, 'prototypeMap');
    const nodeEntries = Array.isArray(record.nodes) ? record.nodes : [];
    const nodes = nodeEntries.map((entry, index) => parseMapNode(entry, `prototypeMap.nodes[${index}]`));
    const entryNodeId = expectString(record.entryNodeId, 'prototypeMap.entryNodeId');
    const nodeIds = new Set(nodes.map((node) => node.id));
    const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
    const entranceNode = nodes.find((node) => node.type === 'entrance');

    const entranceCount = nodes.filter((node) => node.type === 'entrance').length;
    if (entranceCount !== 1) {
        throw new Error(`prototypeMap must contain exactly one entrance node, found ${entranceCount}.`);
    }

    if (!nodeIds.has(entryNodeId)) {
        throw new Error(`prototypeMap.entryNodeId "${entryNodeId}" must reference an existing node.`);
    }

    if (!entranceNode || entryNodeId !== entranceNode.id) {
        throw new Error(`prototypeMap.entryNodeId "${entryNodeId}" must point to the entrance node.`);
    }

    for (const requiredType of REQUIRED_PROTOTYPE_NODE_TYPES) {
        if (!nodes.some((node) => node.type === requiredType)) {
            throw new Error(`prototypeMap is missing required node type "${requiredType}".`);
        }
    }

    for (const node of nodes) {
        for (const outgoingNodeId of node.outgoingNodeIds) {
            if (!nodeIds.has(outgoingNodeId)) {
                throw new Error(`prototypeMap node "${node.id}" links to missing node "${outgoingNodeId}".`);
            }

            const outgoingNode = nodesById.get(outgoingNodeId);

            if (!outgoingNode) {
                throw new Error(`prototypeMap node "${node.id}" could not resolve node "${outgoingNodeId}".`);
            }

            if (outgoingNode.layer !== node.layer + 1) {
                throw new Error(
                    `prototypeMap node "${node.id}" must only link to the next layer; "${outgoingNodeId}" is on layer ${outgoingNode.layer}.`,
                );
            }
        }
    }

    return {
        id: expectString(record.id, 'prototypeMap.id'),
        name: expectString(record.name, 'prototypeMap.name'),
        description: expectString(record.description, 'prototypeMap.description'),
        entryNodeId,
        nodes,
    };
}

function parsePrototypeEventCollection(value: unknown): PrototypeEventCollection {
    const record = expectRecord(value, 'prototypeEvents');
    const eventsByNodeIdRecord = expectRecord(record.eventsByNodeId, 'prototypeEvents.eventsByNodeId');
    const eventsByNodeId = Object.fromEntries(
        Object.entries(eventsByNodeIdRecord).map(([nodeId, definition]) => {
            const parsedDefinition = parseEventDefinition(definition, `prototypeEvents.eventsByNodeId.${nodeId}`);

            if (parsedDefinition.nodeId !== nodeId) {
                throw new Error(`prototypeEvents entry "${nodeId}" must match its nodeId field.`);
            }

            return [nodeId, parsedDefinition];
        }),
    );

    return {
        id: expectString(record.id, 'prototypeEvents.id'),
        eventsByNodeId,
    };
}

function parsePrototypeShopCollection(value: unknown): PrototypeShopCollection {
    const record = expectRecord(value, 'prototypeShops');
    const shopsByNodeIdRecord = expectRecord(record.shopsByNodeId, 'prototypeShops.shopsByNodeId');
    const shopsByNodeId = Object.fromEntries(
        Object.entries(shopsByNodeIdRecord).map(([nodeId, definition]) => {
            const parsedDefinition = parseShopDefinition(definition, `prototypeShops.shopsByNodeId.${nodeId}`);

            if (parsedDefinition.nodeId !== nodeId) {
                throw new Error(`prototypeShops entry "${nodeId}" must match its nodeId field.`);
            }

            return [nodeId, parsedDefinition];
        }),
    );

    return {
        id: expectString(record.id, 'prototypeShops.id'),
        shopsByNodeId,
    };
}

function validateEventAndShopNodeRefs(
    map: ExpeditionMapDefinition,
    events: PrototypeEventCollection,
    shops: PrototypeShopCollection,
): void {
    const referencedEventNodeIds = new Set<string>();
    const referencedShopNodeIds = new Set<string>();

    for (const node of map.nodes) {
        if (node.type === 'event') {
            referencedEventNodeIds.add(node.payloadRef.ref);

            if (!(node.payloadRef.ref in events.eventsByNodeId)) {
                throw new Error(
                    `prototypeEvents is missing an entry for event node ref "${node.payloadRef.ref}" used by "${node.id}".`,
                );
            }
        }

        if (node.type === 'shop') {
            referencedShopNodeIds.add(node.payloadRef.ref);

            if (!(node.payloadRef.ref in shops.shopsByNodeId)) {
                throw new Error(
                    `prototypeShops is missing an entry for shop node ref "${node.payloadRef.ref}" used by "${node.id}".`,
                );
            }
        }
    }

    for (const eventNodeId of Object.keys(events.eventsByNodeId)) {
        if (!referencedEventNodeIds.has(eventNodeId)) {
            throw new Error(`prototypeEvents entry "${eventNodeId}" is not referenced by any event node in prototypeMap.`);
        }
    }

    for (const shopNodeId of Object.keys(shops.shopsByNodeId)) {
        if (!referencedShopNodeIds.has(shopNodeId)) {
            throw new Error(`prototypeShops entry "${shopNodeId}" is not referenced by any shop node in prototypeMap.`);
        }
    }
}

export function validatePrototypeExpeditionContent(input: {
    map: unknown;
    events: unknown;
    shops: unknown;
}): PrototypeExpeditionContentBundle {
    const map = parseExpeditionMapDefinition(input.map);
    const events = parsePrototypeEventCollection(input.events);
    const shops = parsePrototypeShopCollection(input.shops);

    validateEventAndShopNodeRefs(map, events, shops);

    return {
        map,
        events,
        shops,
    };
}

const prototypeExpeditionContent = validatePrototypeExpeditionContent({
    map: prototypeMapJson,
    events: prototypeEventsJson,
    shops: prototypeShopJson,
});

export const prototypeExpeditionMap = prototypeExpeditionContent.map;
export const prototypeExpeditionEvents = prototypeExpeditionContent.events;
export const prototypeExpeditionShops = prototypeExpeditionContent.shops;

export function getPrototypeNodeContentFile(node: ExpeditionEncounterMapNode | ExpeditionContentMapNode): string {
    if (node.type === 'battle' || node.type === 'boss') {
        return node.payloadRef.encounterFile;
    }

    return node.payloadRef.contentFile;
}
