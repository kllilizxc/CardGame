import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import prototypeEventsJson from '../../../public/data/mijing/prototype-events.json';
import prototypeMapJson from '../../../public/data/mijing/prototype-map.json';
import prototypeShopJson from '../../../public/data/mijing/prototype-shop.json';

import { validatePrototypeExpeditionContent } from './prototypeExpeditionContent';

function readJsonFixture<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('validatePrototypeExpeditionContent', () => {
    it('parses the checked-in Phase 01 prototype content bundle', () => {
        const content = validatePrototypeExpeditionContent({
            map: prototypeMapJson,
            events: prototypeEventsJson,
            shops: prototypeShopJson,
        });

        expect(content.map.entryNodeId).toBe('entrance.mountain-gate');
        expect(content.map.nodes.some((node) => node.type === 'boss')).toBe(true);
        expect(Object.keys(content.events.eventsByNodeId)).toContain('event.abandoned-cache');
        expect(Object.keys(content.shops.shopsByNodeId)).toContain('shop.wandering-peddler');
    });

    it('rejects event nodes whose payload ref does not exist in the event content file', () => {
        const brokenMap = structuredClone(prototypeMapJson);
        const eventNode = brokenMap.nodes.find((node) => node.type === 'event');

        if (!eventNode) {
            throw new Error('Expected the prototype map fixture to contain an event node.');
        }

        eventNode.payloadRef.ref = 'event.missing';

        expect(() =>
            validatePrototypeExpeditionContent({
                map: brokenMap,
                events: prototypeEventsJson,
                shops: prototypeShopJson,
            }),
        ).toThrow('event.missing');
    });

    it('rejects shop nodes whose payload ref does not exist in the shop content file', () => {
        const brokenMap = structuredClone(prototypeMapJson);
        const shopNode = brokenMap.nodes.find((node) => node.type === 'shop');

        if (!shopNode) {
            throw new Error('Expected the prototype map fixture to contain a shop node.');
        }

        shopNode.payloadRef.ref = 'shop.missing';

        expect(() =>
            validatePrototypeExpeditionContent({
                map: brokenMap,
                events: prototypeEventsJson,
                shops: prototypeShopJson,
            }),
        ).toThrow('shop.missing');
    });

    it('rejects maps whose entryNodeId does not point at the entrance node', () => {
        const brokenMap = structuredClone(prototypeMapJson);
        const battleNode = brokenMap.nodes.find((node) => node.type === 'battle');

        if (!battleNode) {
            throw new Error('Expected the prototype map fixture to contain a battle node.');
        }

        brokenMap.entryNodeId = battleNode.id;

        expect(() =>
            validatePrototypeExpeditionContent({
                map: brokenMap,
                events: prototypeEventsJson,
                shops: prototypeShopJson,
            }),
        ).toThrow(battleNode.id);
    });

    it('points the prototype boss node at the dedicated mijing boss encounter', () => {
        const bossNode = prototypeMapJson.nodes.find((node) => node.type === 'boss');

        expect(bossNode?.payloadRef.ref).toBe('mijing_boss_01');
        expect(bossNode?.payloadRef.encounterResourceId).toBe('mijing_boss_01');
        expect(bossNode?.payloadRef.encounterFile).toBe('data/encounters/mijing-boss.json');
    });

    it('keeps checked-in battle and boss payload refs catalog-addressable without dropping encounter ref/file aliases', () => {
        const jadeCaveMapJson = readJsonFixture<typeof prototypeMapJson>('public/data/mijing/jade-cave-map.json');

        for (const mapJson of [prototypeMapJson, jadeCaveMapJson]) {
            const content = validatePrototypeExpeditionContent({
                map: mapJson,
                events: prototypeEventsJson,
                shops: prototypeShopJson,
            });
            const encounterRefs = content.map.nodes
                .filter((node) => node.type === 'battle' || node.type === 'boss')
                .map((node) => ({
                    nodeId: node.id,
                    ref: node.payloadRef.ref,
                    encounterResourceId: node.payloadRef.encounterResourceId,
                    encounterFile: node.payloadRef.encounterFile,
                }));

            expect(encounterRefs).toEqual([
                {
                    nodeId: 'battle.mist-foxes',
                    ref: 'test_encounter_01',
                    encounterResourceId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                },
                {
                    nodeId: 'battle.ruined-courtyard',
                    ref: 'test_encounter_02',
                    encounterResourceId: 'test_encounter_02',
                    encounterFile: 'data/encounters/medium-enemy.json',
                },
                {
                    nodeId: 'boss.sealed-guardian',
                    ref: 'mijing_boss_01',
                    encounterResourceId: 'mijing_boss_01',
                    encounterFile: 'data/encounters/mijing-boss.json',
                },
            ]);
        }
    });

    it('continues to parse legacy encounter payload refs that only carry ref and encounterFile', () => {
        const legacyMap = structuredClone(prototypeMapJson);

        for (const node of legacyMap.nodes) {
            if (node.type === 'battle' || node.type === 'boss') {
                delete node.payloadRef.encounterResourceId;
            }
        }

        const content = validatePrototypeExpeditionContent({
            map: legacyMap,
            events: prototypeEventsJson,
            shops: prototypeShopJson,
        });

        const legacyBattleNode = content.map.nodes.find((node) => node.id === 'battle.mist-foxes');

        expect(legacyBattleNode?.type).toBe('battle');
        if (legacyBattleNode?.type === 'battle') {
            expect(legacyBattleNode.payloadRef).toEqual({
                kind: 'encounter',
                ref: 'test_encounter_01',
                encounterFile: 'data/encounters/test-enemy.json',
            });
        }
    });

    it('parses the checked-in jade-cave map against the reused prototype event and shop content', () => {
        const jadeCaveMapJson = readJsonFixture('public/data/mijing/jade-cave-map.json');
        const content = validatePrototypeExpeditionContent({
            map: jadeCaveMapJson,
            events: prototypeEventsJson,
            shops: prototypeShopJson,
        });

        expect(content.map.id).toBe('phase01-jade-cave-map');
        expect(content.map.entryNodeId).toBe('entrance.mountain-gate');
        expect(content.map.nodes.some((node) => node.type === 'boss')).toBe(true);
    });

    it('rejects maps whose outgoing edges skip layers', () => {
        const brokenMap = structuredClone(prototypeMapJson);
        const entranceNode = brokenMap.nodes.find((node) => node.type === 'entrance');
        const bossNode = brokenMap.nodes.find((node) => node.type === 'boss');

        if (!entranceNode || !bossNode) {
            throw new Error('Expected the prototype map fixture to contain entrance and boss nodes.');
        }

        entranceNode.outgoingNodeIds = [bossNode.id];

        expect(() =>
            validatePrototypeExpeditionContent({
                map: brokenMap,
                events: prototypeEventsJson,
                shops: prototypeShopJson,
            }),
        ).toThrow('next layer');
    });
});
