import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { MainMenu } from './scenes/MainMenu';
import { BattleScene } from './scenes/battle/BattleScene';
import { ExpeditionScene } from './scenes/expedition/ExpeditionScene';
import { HubScene } from './scenes/hub/HubScene';
import { StoryScene } from './scenes/story/StoryScene';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';

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
        antialias: true,
        pixelArt: false,
        roundPixels: false
    },
    scene: [
        Boot,
        Preloader,
        HubScene,
        StoryScene,
        ExpeditionScene,
        BattleScene,
        MainMenu,
        MainGame,
        GameOver
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
