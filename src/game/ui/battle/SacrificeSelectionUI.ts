import { GameObjects, Scene } from 'phaser';
import { CardSprite } from '../../objects/CardSprite';
import { getUnitStar } from '../../utils/RealmHelper';
import { createSceneButton, createScenePanel, getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import { battleTheme, createBattleOverlay } from './battleTheme';

/** A modal row of live candidate cards; selection never depends on overlapping fighters. */
export class SacrificeSelectionUI extends GameObjects.Container {
    private instructionText: GameObjects.Text;
    private confirmBackground: GameObjects.Rectangle;
    private candidates: GameObjects.Container;
    private selected: CardSprite[] = [];
    private requiredCount = 0;
    private onConfirm?: (selected: CardSprite[]) => void;
    private onCancel?: () => void;
    private marks = new Map<CardSprite, { border: GameObjects.Rectangle; label: GameObjects.Text }>();

    constructor(scene: Scene) {
        super(scene, 0, 0);
        const { width, height } = scene.scale;
        const overlay = createBattleOverlay(scene, 0.88).setInteractive();
        overlay.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation());
        this.add(overlay);
        this.add(createScenePanel(scene, { x: width / 2, y: height * 0.5, width: Math.min(960, width - 24), height: height * 0.76 }));
        this.add(scene.add.text(width / 2, height * 0.18, '献祭召唤', getSceneTextStyle('panelTitle', { fontSize: '32px' })).setOrigin(0.5));
        // The global pixel-font patch snaps every font size to 36px; scale text to fit narrow panels.
        const instructionScale = width < 700 ? 2 / 3 : 1;
        this.instructionText = scene.add.text(width / 2, height * 0.28, '', getSceneTextStyle('support', {
            fontSize: '36px', align: 'center', wordWrap: { width: Math.min(860, width - 50) / instructionScale },
        })).setOrigin(0.5).setScale(instructionScale);
        this.add(this.instructionText);
        this.candidates = scene.add.container(0, 0);
        this.add(this.candidates);
        const buttonWidth = Math.min(240, (width - 64) / 2);
        const confirm = createSceneButton(scene, { x: width / 2 - buttonWidth / 2 - 12, y: height * 0.8,
            width: buttonWidth, height: 66, label: '确认献祭', variant: 'primary', onClick: () => this.confirm() });
        const cancel = createSceneButton(scene, { x: width / 2 + buttonWidth / 2 + 12, y: height * 0.8,
            width: buttonWidth, height: 66, label: '取消', variant: 'secondary', onClick: () => this.cancel() });
        this.confirmBackground = confirm.background;
        this.add([...confirm.objects, ...cancel.objects]);
        this.setDepth(8000).setVisible(false);
        scene.add.existing(this);
        scene.events.once('shutdown', () => this.hide());
    }

    public show(units: CardSprite[], requiredCount: number, onConfirm: (selected: CardSprite[]) => void, onCancel: () => void, requirement = ''): void {
        this.hide();
        this.requiredCount = requiredCount;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        const { width, height } = this.scene.scale;
        const spacing = Math.min(260, (width - 40) / Math.max(1, units.length));
        const scale = Math.min(0.95, (spacing - 22) / 180);
        units.forEach((unit, index) => {
            const x = width / 2 + (index - (units.length - 1) / 2) * spacing;
            const y = height * 0.51;
            const data = unit.getCardData();
            const preview = new CardSprite(this.scene, x, y, structuredClone(data), scale);
            preview.disableDragging();
            preview.disableInteractive();
            this.candidates.add(preview);
            const border = this.scene.add.rectangle(x, y, 180 * scale + 12, 260 * scale + 12, sceneTheme.colors.gold, 0)
                .setStrokeStyle(3, sceneTheme.colors.goldSoft, 0.45).setInteractive({ useHandCursor: true });
            const label = this.scene.add.text(x, y + 145 * scale + 20, `${data.name}\n${getUnitStar(data)}星  ${data.attack}攻  ${data.health}命`, getSceneTextStyle('support', {
                fontSize: '36px', align: 'center', wordWrap: { width: (spacing - 12) * 1.5 },
            })).setOrigin(0.5, 0).setScale(2 / 3);
            this.candidates.add([border, label]);
            this.marks.set(unit, { border, label });
            border.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
                event.stopPropagation();
                const index = this.selected.indexOf(unit);
                if (index >= 0) this.selected.splice(index, 1);
                else {
                    if (this.selected.length === this.requiredCount) this.selected.shift();
                    this.selected.push(unit);
                }
                this.refresh(requirement);
            });
        });
        this.setVisible(true);
        this.refresh(requirement);
    }

    private refresh(requirement: string): void {
        this.instructionText.setText(`${requirement || `请选择${this.requiredCount}只单位`}\n已选 ${this.selected.length}/${this.requiredCount} · 点击卡片选择或取消`);
        for (const [unit, { border, label }] of this.marks) {
            const selected = this.selected.includes(unit);
            border.setStrokeStyle(selected ? 5 : 3, selected ? battleTheme.colors.dangerSoft : sceneTheme.colors.goldSoft, selected ? 1 : 0.45);
            label.setColor(selected ? battleTheme.colors.textDanger : battleTheme.colors.textBody);
        }
        const enabled = this.selected.length === this.requiredCount;
        this.confirmBackground.setAlpha(enabled ? 1 : 0.45);
        if (this.confirmBackground.input) this.confirmBackground.input.enabled = enabled;
    }

    private confirm(): void {
        if (this.selected.length !== this.requiredCount) return;
        const callback = this.onConfirm, selected = [...this.selected];
        this.hide();
        callback?.(selected);
    }

    public cancel(): void {
        const callback = this.onCancel;
        this.hide();
        callback?.();
    }

    public hide(): void {
        this.setVisible(false);
        this.candidates.removeAll(true);
        this.marks.clear();
        this.selected = [];
        this.onConfirm = undefined;
        this.onCancel = undefined;
    }

    public destroy(fromScene?: boolean): void {
        this.hide();
        super.destroy(fromScene);
    }
}
