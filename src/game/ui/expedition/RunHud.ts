import { GameObjects, Scene } from 'phaser';

import { createRunSummary } from '../../scenes/expedition/entryFlowModel';
import type { RunSnapshot } from '../../types/expedition';

export class RunHud extends GameObjects.Container {
    private currentNodeValue!: GameObjects.Text;
    private carriedDeckValue!: GameObjects.Text;
    private carriedItemsValue!: GameObjects.Text;
    private spiritStonesValue!: GameObjects.Text;

    constructor(scene: Scene) {
        super(scene, 0, 0);

        this.createHud();
        scene.add.existing(this);
    }

    private createHud(): void {
        const { width } = this.scene.scale;
        const background = this.scene.add.rectangle(width / 2, 56, width - 96, 84, 0x020617, 0.9);
        background.setStrokeStyle(2, 0x38bdf8, 0.85);

        this.currentNodeValue = this.createValueText(150, '当前节点: -');
        this.carriedDeckValue = this.createValueText(560, 'carriedDeck: 0');
        this.carriedItemsValue = this.createValueText(920, 'carriedItems: 0');
        this.spiritStonesValue = this.createValueText(1280, 'spiritStones: 0');

        this.add([
            background,
            this.currentNodeValue,
            this.carriedDeckValue,
            this.carriedItemsValue,
            this.spiritStonesValue,
        ]);

        this.setDepth(900);
    }

    private createValueText(x: number, initialText: string): GameObjects.Text {
        return this.scene.add.text(x, 56, initialText, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#e2e8f0',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
    }

    public updateFromRun(run: RunSnapshot, currentNodeLabel?: string): void {
        const summary = createRunSummary(run, { currentNodeLabel });

        this.updateRunStats(
            summary.currentNodeLabel,
            summary.carriedDeckCount,
            summary.carriedItemCount,
            summary.spiritStones,
        );
    }

    public updateRunStats(
        currentNodeLabel: string,
        carriedDeckCount: number,
        carriedItemCount: number,
        spiritStones: number,
    ): void {
        this.currentNodeValue.setText(`当前节点: ${currentNodeLabel}`);
        this.carriedDeckValue.setText(`carriedDeck: ${carriedDeckCount}`);
        this.carriedItemsValue.setText(`carriedItems: ${carriedItemCount}`);
        this.spiritStonesValue.setText(`spiritStones: ${spiritStones}`);
    }
}
