import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('startup scene flow', () => {
    it('boots through the normal preload path before showing MainMenu', () => {
        const bootScene = read('src/game/scenes/Boot.ts');

        expect(bootScene).toContain("this.scene.start('Preloader')");
        expect(bootScene).not.toContain("this.scene.start('StoryScene')");
    });

    it('registers WorldMapScene before Hub and Expedition scenes so route data can launch them', () => {
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
});
