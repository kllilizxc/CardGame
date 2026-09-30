import type { Scene } from 'phaser';
import type { PillCard } from '../../../../public/data/types/cards/pill';
import { INK, PX } from '../../art/palette';
import { PTooltip } from '../../art/kit';

type BattleSceneWithLayout = Scene & { layout?: { depth?: { pillTooltip?: number } } };

const TARGET_LABEL: Record<string, string> = { player: '自身', unit: '单体', allUnits: '全体友方', all: '全场' };

/** Pill details on hover: name, grade, effect and target in one pixel scroll. */
export class PillTooltipUI {
    private tip?: PTooltip;

    constructor(private readonly scene: Scene) {}

    public show(pill: PillCard, x: number, y: number): void {
        const depth = (this.scene as BattleSceneWithLayout).layout?.depth?.pillTooltip ?? 7000;
        this.tip ??= new PTooltip(this.scene, PX * 120, depth);
        const lines = [`品级：${pill.grade}`, pill.description, pill.target ? `目标：${TARGET_LABEL[pill.target] ?? pill.target}` : ''].filter(Boolean);
        const w = PX * 120;
        this.tip.show(x > this.scene.scale.width / 2 ? x - w : x, y - PX * 20, pill.name, lines.join('\n'));
        void INK;
    }

    public hide(): void {
        this.tip?.hide();
    }

    public destroy(): void {
        this.tip?.destroy();
        this.tip = undefined;
    }
}
