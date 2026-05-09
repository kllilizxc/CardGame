import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('startup scene flow', () => {
    it('boots through the normal preload path before showing MainMenu', () => {
        const bootScene = read('src/game/scenes/Boot.ts');

        expect(bootScene).toContain("this.scene.start('Preloader')");
        expect(bootScene).not.toContain("this.scene.start('StoryScene')");
    });

    it('registers WorldMapScene before Hub and Expedition scenes so the map shell can launch content', () => {
        const mainConfig = read('src/game/main.ts');

        expect(mainConfig).toContain("import { WorldMapScene } from './scenes/worldmap/WorldMapScene'");
        expect(mainConfig).toContain("import { HubScene } from './scenes/hub/HubScene'");
        expect(mainConfig).toContain("import { ExpeditionScene } from './scenes/expedition/ExpeditionScene'");
        expect(mainConfig).toContain('WorldMapScene,\n        HubScene,');
        expect(mainConfig).toContain('StoryScene,\n        ExpeditionScene,');
    });

    it('exposes a clear MainMenu action that starts the data-driven WorldMapScene', () => {
        const mainMenuScene = read('src/game/scenes/MainMenu.ts');

        expect(mainMenuScene).toContain('进入大地图');
        expect(mainMenuScene).toContain("this.scene.start('WorldMapScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('HubScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('StoryScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('Game')");
    });

    it('routes world map selections to the existing HubScene and ExpeditionScene without changing their loops', () => {
        const worldMapScene = read('src/game/scenes/worldmap/WorldMapScene.ts');
        const worldMapModel = read('src/game/scenes/worldmap/worldMap.ts');

        expect(worldMapScene).toContain("this.load.json(WORLD_MAP_CACHE_KEY, 'data/world/world-map.json')");
        expect(worldMapScene).toContain('createWorldMapDestinationIntent');
        expect(worldMapScene).toContain('createWorldMapInitialSurfacePosition');
        expect(worldMapScene).toContain('createDestinationMarker');
        expect(worldMapScene).toContain('handleMapPointerMove');
        expect(worldMapScene).toContain('this.scene.start(intent.sceneKey, intent.payload)');
        expect(worldMapScene).not.toContain('createDestinationButton');
        expect(worldMapModel).toContain("sceneKey: 'HubScene'");
        expect(worldMapModel).toContain("sceneKey: 'ExpeditionScene'");
        expect(worldMapModel).toContain('presentation');
        expect(worldMapModel).toContain('hubFile');
        expect(worldMapModel).toContain('mapFile');
    });

    it('exposes minimal return actions from Hub and Expedition back to the WorldMapScene while preserving resume stores', () => {
        const hubScene = read('src/game/scenes/hub/HubScene.ts');
        const expeditionScene = read('src/game/scenes/expedition/ExpeditionScene.ts');
        const worldMapScene = read('src/game/scenes/worldmap/WorldMapScene.ts');

        expect(hubScene).toContain('normalizeHubSceneLaunchData');
        expect(hubScene).toContain('this.launchData.hubFile');
        expect(hubScene).toContain('返回大地图');
        expect(hubScene).toContain('createWorldMapReturnIntent');
        expect(hubScene).toContain('this.scene.start(intent.sceneKey, intent.payload)');

        expect(expeditionScene).toContain('normalizeExpeditionSceneLaunchData');
        expect(expeditionScene).toContain('this.launchData.mapFile');
        expect(expeditionScene).toContain('返回大地图');
        expect(expeditionScene).toContain('createWorldMapReturnIntent');
        expect(expeditionScene).toContain('this.scene.start(intent.sceneKey, intent.payload)');
        expect(expeditionScene).not.toContain('clearActiveRun');

        expect(worldMapScene).toContain('init(data?: WorldMapReturnPayload)');
        expect(worldMapScene).toContain('returnStatusText');
    });
});
