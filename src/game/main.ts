import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { BattleScene } from './scenes/battle/BattleScene';
import { ExpeditionScene } from './scenes/expedition/ExpeditionScene';
import { HubScene } from './scenes/hub/HubScene';
import { StoryScene } from './scenes/story/StoryScene';
import { WorldMapScene } from './scenes/worldmap/WorldMapScene';
import Phaser, { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { pixelViewportForBrowser } from './layout/gameViewport';
import { PaletteFX, applyPaletteFX } from './art/PaletteFX';
import { installPixelText } from './art/textPatch';
import { inkIn, installSceneTransitions, setBeforeSceneStart } from './art/transition';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1920,
    height: 1080,
    parent: 'game-container',
    backgroundColor: '#0a0a12',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1920,
        height: 1080
    },
    render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true
    },
    pipeline: { PaletteFX } as unknown as Phaser.Types.Core.PipelineConfig,
    scene: [
        Boot,
        Preloader,
        MainMenu,
        WorldMapScene,
        HubScene,
        StoryScene,
        ExpeditionScene,
        BattleScene,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {
    installPixelText();
    installSceneTransitions();

    const viewport = pixelViewportForBrowser(window.innerWidth, window.innerHeight);
    const game = new Game({ ...config, parent, width: viewport.width, height: viewport.height,
        scale: { ...config.scale, width: viewport.width, height: viewport.height } });

    // The canvas width follows the window aspect. A resize is applied at the next scene change
    // (every scene lays itself out from scale.width), so a fight is never re-laid out mid-turn.
    let pending: { width: number; height: number } | null = null;
    window.addEventListener('resize', () => {
        const next = pixelViewportForBrowser(window.innerWidth, window.innerHeight);
        pending = next.width !== game.scale.gameSize.width ? next : null;
    });
    setBeforeSceneStart(() => {
        if (!pending) return;
        game.scale.setGameSize(pending.width, pending.height);
        pending = null;
    });

    if (import.meta.env.DEV) {
        (window as unknown as { __game: Phaser.Game }).__game = game;
    }

    game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.scenes.forEach((scene) => {
            scene.events.on(Phaser.Scenes.Events.CREATE, () => {
                applyPaletteFX(scene);
                if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') inkIn(scene);
            });
        });
    });

    return game;

}

export default StartGame;
