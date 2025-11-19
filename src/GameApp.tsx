import { useRef, useLayoutEffect } from 'react';
import StartGame from './game/main';
import './GameApp.css';

function GameApp() {
    const gameRef = useRef<Phaser.Game | null>(null);

    useLayoutEffect(() => {
        if (gameRef.current === null) {
            gameRef.current = StartGame("game-container");
        }

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    return (
        <div id="game-app">
            <div id="game-container"></div>
        </div>
    );
}

export default GameApp;
