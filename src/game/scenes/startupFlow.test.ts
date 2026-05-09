import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('startup scene flow', () => {
    it('boots through the normal preload path before showing MainMenu', () => {
        const bootScene = read('src/game/scenes/Boot.ts');

        expect(bootScene).toContain("this.scene.start('Preloader')");
        expect(bootScene).not.toContain("this.scene.start('StoryScene')");
    });

    it('registers HubScene before story and battle scenes so the town shell can launch content', () => {
        const mainConfig = read('src/game/main.ts');

        expect(mainConfig).toContain("import { HubScene } from './scenes/hub/HubScene'");
        expect(mainConfig).toContain('HubScene,\n        StoryScene,');
    });

    it('exposes a clear MainMenu action that starts the data-driven HubScene', () => {
        const mainMenuScene = read('src/game/scenes/MainMenu.ts');

        expect(mainMenuScene).toContain('进入青云镇');
        expect(mainMenuScene).toContain("this.scene.start('HubScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('StoryScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('Game')");
    });
});
