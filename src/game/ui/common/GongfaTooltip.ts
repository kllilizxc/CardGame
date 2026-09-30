import type { Scene } from 'phaser';
import { PX } from '../../art/palette';
import { PTooltip } from '../../art/kit';

/** Technique (功法) details on hover, as a pixel scroll. */
export class GongfaTooltip {
    private tip?: PTooltip;

    constructor(private readonly scene: Scene) {}

    public show(x: number, y: number, gongfaName: string, gongfaDescription: string): void {
        this.tip ??= new PTooltip(this.scene, PX * 130, 10000);
        this.tip.show(x, y - PX * 10, gongfaName, gongfaDescription);
    }

    public hide(): void {
        this.tip?.hide();
    }

    public destroy(): void {
        this.tip?.destroy();
        this.tip = undefined;
    }
}
