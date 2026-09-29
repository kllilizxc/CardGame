import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { BattleScene } from './scenes/battle/BattleScene';
import { ExpeditionScene } from './scenes/expedition/ExpeditionScene';
import { HubScene } from './scenes/hub/HubScene';
import { StoryScene } from './scenes/story/StoryScene';
import { WorldMapScene } from './scenes/worldmap/WorldMapScene';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { PaletteFX, applyPaletteFX } from './art/PaletteFX';
import { installPixelText } from './art/textPatch';
import { installPixelRects } from './art/rectPatch';
import { pxIrisIn } from './art/fx';

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1920,
    height: 1080,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
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
    installPixelRects();
    const game = new Game({ ...config, parent });
    if (import.meta.env.DEV) {
        (window as unknown as { __game: Phaser.Game }).__game = game;
    }

    // Every scene gets the palette shader on its camera and a pixel-dissolve entrance.
    game.events.once(Phaser.Core.Events.READY, () => {
        game.scene.scenes.forEach((scene) => {
            scene.events.on(Phaser.Scenes.Events.CREATE, () => {
                applyPaletteFX(scene);
                if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') pxIrisIn(scene);
            });
        });
    });

    return game;

}

export default StartGame;
