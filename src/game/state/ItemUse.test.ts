import { describe, expect, it } from 'bun:test';

import starterDeck from '../../../public/data/decks/starter-deck.json';
import { createExpeditionBattleCompleteEvent } from '../scenes/battle/battleCompletion';
import { normalizeBattleLaunchPayload } from '../scenes/battle/battleSceneLaunch';
import { createBattleLaunchPayload } from '../scenes/expedition/battleLaunchFlow';
import { createRunAfterBattleVictory } from '../scenes/expedition/runResultFlow';
import { createActiveRunStorageKey, loadActiveRun } from '../services/RunPersistence';
import { resolveBattleVictory } from '../services/RunResolution';
import type { ExpeditionEncounterMapNode } from '../types/expedition';
import { ExpeditionState } from './ExpeditionState';
import { indexItemActionPolicies } from './ItemActionRules';
import { getRunPlayerHealth } from './RunHealth';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

const target = { expeditionId: 'heal-expedition', mapId: 'heal-map' };
const medicine = { id: 'consumable.fog-salve', itemType: 'consumable' as const, count: 2 };
const tool = { id: 'tool.silver-needle', itemType: 'tool' as const, count: 1 };
const catalog = {
    consumables: [{ id: medicine.id, useEffect: { kind: 'heal', amount: 30 } }],
    tools: [{ id: tool.id }],
};
const node: ExpeditionEncounterMapNode = {
    id: 'battle.fog', type: 'battle', layer: 1, label: '雾林战斗', outgoingNodeIds: [],
    payloadRef: { kind: 'encounter', ref: 'fog-foxes', encounterFile: 'data/encounters/fog-foxes.json' },
};

function start(storage = new MemoryStorage()) {
    const state = ExpeditionState.bootstrap({
        worldState: { stash: { items: [medicine, tool], spiritStones: 0 } },
        starterDeck: structuredClone(starterDeck), targetIdentity: target,
        itemPolicies: indexItemActionPolicies(catalog), storage,
    });
    state.createRunSnapshot({ ...target, entryNodeId: 'entrance.fog' });
    return { state, storage };
}

describe('independent item use', () => {
    it('accepts only bounded consumable healing effects', () => {
        for (const useEffect of [{ kind: 'heal', amount: 0 }, { kind: 'heal', amount: 101 }, { kind: 'heal', amount: 2.5 }, { kind: 'unknown', amount: 20 }]) {
            expect(() => indexItemActionPolicies({ consumables: [{ id: medicine.id, useEffect }] })).toThrow('Invalid');
        }
        expect(() => indexItemActionPolicies({ consumables: [{ id: medicine.id,
            useEffect: { kind: 'heal', amount: 20, unexpected: true } }] })).toThrow('Invalid');
        expect(() => indexItemActionPolicies({ tools: [{ id: tool.id, useEffect: { kind: 'heal', amount: 30 } }] })).toThrow('Invalid');
        expect(indexItemActionPolicies(catalog)[medicine.id]?.useEffect).toEqual({ kind: 'heal', amount: 30 });
    });

    it('carries battle health into the run, heals and spends once, and restores both after reload', () => {
        const { state, storage } = start();
        const fullSave = JSON.stringify(loadActiveRun(target, undefined, storage));
        expect(state.useCarriedItem('consumable', medicine.id).status).toBe('fullHealth');
        expect(state.useCarriedItem('tool', tool.id).status).toBe('notUsable');
        expect(JSON.stringify(loadActiveRun(target, undefined, storage))).toBe(fullSave);

        const launch = createBattleLaunchPayload(state.activeRun!, node);
        expect(normalizeBattleLaunchPayload(launch)?.playerHealth).toBe(100);
        const result = createExpeditionBattleCompleteEvent(launch, true, '2026-09-27T00:00:00.000Z', 48);
        const continued = createRunAfterBattleVictory(state.activeRun!, result);
        const resolution = resolveBattleVictory({ run: continued, storage });
        state.activeRun = resolution.run;
        expect(loadActiveRun(target, undefined, storage)?.playerHealth).toBe(48);

        const used = state.useCarriedItem('consumable', medicine.id);
        expect(used).toMatchObject({ status: 'used', healed: 30 });
        expect(used.activeRun?.playerHealth).toBe(78);
        expect(used.activeRun?.carriedItems.find(item => item.id === medicine.id)?.count).toBe(1);
        const restored = ExpeditionState.bootstrap({
            worldState: { stash: { items: [], spiritStones: 0 } },
            starterDeck: structuredClone(starterDeck), targetIdentity: target,
            itemPolicies: indexItemActionPolicies(catalog), storage,
        });
        expect(restored.activeRun?.playerHealth).toBe(78);
        expect(restored.activeRun?.carriedItems.find(item => item.id === medicine.id)?.count).toBe(1);
        expect(createBattleLaunchPayload(restored.activeRun!, node).playerHealth).toBe(78);
        expect(restored.persistentStash.items.find(item => item.id === medicine.id)?.count).toBe(2);
        expect(restored.useCarriedItem('consumable', medicine.id)).toMatchObject({ status: 'used', healed: 22 });
        const fullAgain = JSON.stringify(loadActiveRun(target, undefined, storage));
        expect(restored.useCarriedItem('consumable', medicine.id).status).toBe('notOwned');
        expect(JSON.stringify(loadActiveRun(target, undefined, storage))).toBe(fullAgain);
    });

    it('treats an old run without health as full and rejects an invalid battle health payload', () => {
        const { state, storage } = start();
        const oldRun = { ...state.activeRun! };
        delete oldRun.playerHealth;
        expect(getRunPlayerHealth(oldRun.playerHealth)).toBe(100);
        expect(state.useCarriedItem('consumable', medicine.id).status).toBe('fullHealth');
        expect(normalizeBattleLaunchPayload({ ...createBattleLaunchPayload(oldRun, node), playerHealth: 120 })).toBeNull();
        expect(loadActiveRun(target, undefined, storage)?.playerHealth).toBe(100);
        const key = createActiveRunStorageKey(target);
        const corrupted = JSON.parse(storage.getItem(key)!);
        corrupted.playerHealth = 120;
        storage.setItem(key, JSON.stringify(corrupted));
        expect(loadActiveRun(target, undefined, storage)?.playerHealth).toBe(100);
        expect(JSON.parse(storage.getItem(key)!).playerHealth).toBe(100);
    });
});
