import type {
    ExpeditionEncounterMapNode,
    ExpeditionMapDefinition,
    ExpeditionMapNode,
    ExpeditionTargetConfig,
    RunSnapshot,
} from '../../types/expedition';
import { createBattleLaunchPayload } from './battleLaunchFlow';

export type ExpeditionNodeVisibility = 'cleared' | 'reachable' | 'silhouette';

export type VisibleExpeditionMapNode = ExpeditionMapNode & {
    visibility: ExpeditionNodeVisibility;
    selectable: boolean;
};

function getNodeById(map: ExpeditionMapDefinition, nodeId: string): ExpeditionMapNode | undefined {
    return map.nodes.find((node) => node.id === nodeId);
}

function isClearedNode(activeRun: RunSnapshot, nodeId: string): boolean {
    return activeRun.visitedNodeIds.includes(nodeId) || activeRun.nodeStates[nodeId]?.status === 'cleared';
}

function isEncounterNode(node: ExpeditionMapNode): node is ExpeditionEncounterMapNode {
    return node.type === 'battle' || node.type === 'boss';
}

function isReopenableNonCombatNode(node: ExpeditionMapNode): boolean {
    return node.type === 'event' || node.type === 'shop' || node.type === 'extract';
}

export function isReachableNode(
    map: ExpeditionMapDefinition,
    activeRun: RunSnapshot,
    nodeId: string,
): boolean {
    const currentNode = getNodeById(map, activeRun.currentNodeId);
    const targetNode = getNodeById(map, nodeId);

    if (!currentNode || !targetNode || isClearedNode(activeRun, nodeId)) {
        return false;
    }

    return currentNode.outgoingNodeIds.includes(nodeId);
}

export function getVisibleNodes(
    map: ExpeditionMapDefinition,
    activeRun: RunSnapshot,
): VisibleExpeditionMapNode[] {
    return map.nodes.map((node) => {
        const cleared = isClearedNode(activeRun, node.id);
        const reachable = isReachableNode(map, activeRun, node.id);
        const selectable = reachable || (cleared && isReopenableNonCombatNode(node));
        const visibility: ExpeditionNodeVisibility = cleared
            ? 'cleared'
            : reachable
                ? 'reachable'
                : 'silhouette';

        return {
            ...node,
            visibility,
            selectable,
        };
    });
}

export function enterReachableNode(
    map: ExpeditionMapDefinition,
    activeRun: RunSnapshot,
    nodeId: string,
    targetConfig?: ExpeditionTargetConfig,
): RunSnapshot | null {
    if (!isReachableNode(map, activeRun, nodeId)) {
        return null;
    }

    const node = getNodeById(map, nodeId);

    if (!node) {
        return null;
    }

    const visitedNodeIds = activeRun.visitedNodeIds.includes(nodeId)
        ? [...activeRun.visitedNodeIds]
        : [...activeRun.visitedNodeIds, nodeId];
    const nodeStates = {
        ...activeRun.nodeStates,
        [nodeId]: {
            nodeId,
            status: 'cleared' as const,
            visited: true,
            rewardClaimed: false,
        },
    };

    return {
        ...activeRun,
        currentNodeId: nodeId,
        visitedNodeIds,
        nodeStates,
        pendingEncounter: isEncounterNode(node) ? createBattleLaunchPayload(activeRun, node, targetConfig) : null,
    };
}
