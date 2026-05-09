import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('startup scene flow', () => {
    it('boots through the normal preload path before showing MainMenu', () => {
        const bootScene = read('src/game/scenes/Boot.ts');

        expect(bootScene).toContain("this.scene.start('Preloader')");
        expect(bootScene).not.toContain("this.scene.start('StoryScene')");
    });

    it('exposes a clear MainMenu action that starts the example StoryScene', () => {
        const mainMenuScene = read('src/game/scenes/MainMenu.ts');

        expect(mainMenuScene).toContain('开始主线故事');
        expect(mainMenuScene).toContain("this.scene.start('StoryScene')");
        expect(mainMenuScene).not.toContain("this.scene.start('Game')");
    });
});
