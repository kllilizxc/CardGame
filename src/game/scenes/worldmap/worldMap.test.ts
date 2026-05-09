import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const readJson = (path: string) => JSON.parse(read(path));

describe('world map shell content', () => {
    it('validates the checked-in world map with Hub and Expedition routes', async () => {
        expect(existsSync('public/data/world/world-map.json')).toBe(true);
        expect(existsSync('src/game/scenes/worldmap/worldMap.ts')).toBe(true);

        const worldMapJson = readJson('public/data/world/world-map.json');
        const { validateWorldMapDefinition } = await import('./worldMap');
        const worldMap = validateWorldMapDefinition(worldMapJson);

        expect(worldMap.id).toBe('world.qingyun-region');
        expect(worldMap.defaultRouteId).toBe('route.qingyun-town');
        expect(worldMap.routes.map((route) => ({
            id: route.id,
            sceneKey: route.sceneKey,
        }))).toEqual([
            {
                id: 'route.qingyun-town',
                sceneKey: 'HubScene',
            },
            {
                id: 'route.outer-mountain-trial',
                sceneKey: 'ExpeditionScene',
            },
        ]);
    });

    it('creates launch intents from route data without hard-coding route ids in the scene', async () => {
        expect(existsSync('public/data/world/world-map.json')).toBe(true);
        expect(existsSync('src/game/scenes/worldmap/worldMap.ts')).toBe(true);

        const worldMapJson = readJson('public/data/world/world-map.json');
        const {
            createWorldMapRouteIntent,
            validateWorldMapDefinition,
        } = await import('./worldMap');
        const worldMap = validateWorldMapDefinition(worldMapJson);
        const expeditionRoute = worldMap.routes.find((route) => route.sceneKey === 'ExpeditionScene');

        expect(expeditionRoute).toBeDefined();
        if (!expeditionRoute) {
            throw new Error('Expected world map to declare an expedition route.');
        }

        expect(createWorldMapRouteIntent(worldMap, expeditionRoute)).toEqual({
            kind: 'startScene',
            sceneKey: 'ExpeditionScene',
            payload: {
                source: 'worldMap',
                worldMapId: 'world.qingyun-region',
                routeId: 'route.outer-mountain-trial',
                statusText: '你离开镇口，前往青云外山试炼秘境。',
            },
        });
    });

    it('rejects route scene keys outside the existing Hub and Expedition shells', async () => {
        expect(existsSync('public/data/world/world-map.json')).toBe(true);
        expect(existsSync('src/game/scenes/worldmap/worldMap.ts')).toBe(true);

        const worldMapJson = readJson('public/data/world/world-map.json');
        const { validateWorldMapDefinition } = await import('./worldMap');
        const brokenMap = structuredClone(worldMapJson);

        brokenMap.routes[0].sceneKey = 'BattleScene';

        expect(() => validateWorldMapDefinition(brokenMap)).toThrow('BattleScene');
    });

    it('registers WorldMapScene and makes MainMenu enter the data-driven world map shell', () => {
        expect(existsSync('src/game/scenes/worldmap/WorldMapScene.ts')).toBe(true);

        const mainConfig = read('src/game/main.ts');
        const mainMenuScene = read('src/game/scenes/MainMenu.ts');
        const worldMapScene = read('src/game/scenes/worldmap/WorldMapScene.ts');

        expect(mainConfig).toContain("import { WorldMapScene } from './scenes/worldmap/WorldMapScene'");
        expect(mainConfig).toContain('WorldMapScene,\n        HubScene,');
        expect(mainMenuScene).toContain('进入大地图');
        expect(mainMenuScene).toContain("this.scene.start('WorldMapScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('HubScene')");
        expect(worldMapScene).toContain("this.load.json('worldMapShell', 'data/world/world-map.json')");
        expect(worldMapScene).toContain('createWorldMapRouteIntent');
        expect(worldMapScene).toContain('this.scene.start(intent.sceneKey, intent.payload)');
    });
});
