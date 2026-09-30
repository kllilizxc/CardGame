import { GameObjects, type Scene } from 'phaser';
import type { PillSlot } from '../../../managers/battle/PillManager';
import type { SkillState } from '../../../managers/battle/SkillManager';
import { INK, PX } from '../../../art/palette';
import { addIcon, type PixIcon } from '../../../art/icons';
import { PTooltip, numberFont, panel } from '../../../art/kit';

const TILE = PX * 30;
const GAP = PX * 5;

type TileStyle = 'jade' | 'ghost' | 'gold';
const READY: TileStyle = 'jade';
const SPENT: TileStyle = 'ghost';

abstract class Rail extends GameObjects.Container {
    protected tiles: GameObjects.Container[] = [];
    protected tip: PTooltip;
    constructor(scene: Scene, x: number, y: number, depth: number) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(depth);
        this.tip = new PTooltip(scene, PX * 110, depth + 50);
    }
    protected clearTiles() {
        this.tiles.forEach(t => t.destroy());
        this.tiles = [];
    }
    /** A square icon tile. `badge` is a small bitmap number/label in the corner. */
    protected tile(index: number, count: number, style: TileStyle, icon: PixIcon | null, name: string, badge: string, enabled: boolean, onClick: () => void, onHover?: (on: boolean) => void, detail = '') {
        const scene = this.scene;
        const y = Math.round(((index - (count - 1) / 2) * (TILE + GAP)) / PX) * PX;
        const c = scene.add.container(0, y);
        const bg = panel(scene, 0, 0, TILE, TILE, style);
        const hot = panel(scene, 0, 0, TILE, TILE, 'gold').setVisible(false);
        c.add([bg, hot]);
        if (icon) c.add(addIcon(scene, 0, -PX, icon, 2).setAlpha(enabled ? 1 : 0.35));
        if (badge) c.add(scene.add.bitmapText(TILE / 2 - PX * 3, TILE / 2 - PX * 3, numberFont(scene, enabled ? INK.paper : INK.ash), badge).setOrigin(1, 1).setScale(PX));
        c.setSize(TILE, TILE);
        c.setInteractive({ useHandCursor: enabled });
        const right = this.x > scene.scale.width / 2;
        c.on('pointerover', () => {
            hot.setVisible(true);
            onHover?.(true);
            if (!onHover && name) this.tip.show(right ? this.x - TILE / 2 - PX * 116 : this.x + TILE / 2 + PX * 6, this.y + y - TILE / 2, name, detail);
            if (enabled) c.x = right ? -PX * 3 : PX * 3;
        });
        c.on('pointerout', () => { hot.setVisible(false); onHover?.(false); this.tip.hide(); c.x = 0; });
        c.on('pointerdown', () => { if (enabled) { c.setScale(0.92); scene.time.delayedCall(80, () => c.setScale(1)); onClick(); } });
        this.add(c);
        this.tiles.push(c);
        return c;
    }
    destroy(fromScene?: boolean) {
        this.tip?.destroy();
        super.destroy(fromScene);
    }
}

/** Pill quick-slots: a vertical rail on the left edge (drop-in for PillSlotUI). */
export class PillRail extends Rail {
    constructor(scene: Scene, x: number, y: number, private readonly onSlotClick?: (index: number) => void, depth = 200) {
        super(scene, x, y, depth);
        scene.events.on('pillSlotsUpdated', this.updateSlots, this);
    }
    createSlots(slots: PillSlot[]) {
        this.clearTiles();
        slots.forEach((slot, i) => {
            const empty = slot.isEmpty || !slot.pill;
            this.tile(i, slots.length, empty ? SPENT : READY, empty ? null : 'pill', empty ? '' : slot.pill!.name, '', !empty,
                () => this.onSlotClick?.(i),
                on => {
                    if (empty || !slot.pill) return;
                    if (on) this.scene.events.emit('showPillTooltip', slot.pill, this.x + (this.x > this.scene.scale.width / 2 ? -PX * 60 : PX * 60), this.y + (i - (slots.length - 1) / 2) * (TILE + GAP));
                    else this.scene.events.emit('hidePillTooltip');
                });
        });
    }
    updateSlots(slots: PillSlot[]) { this.createSlots(slots); }
    destroy(fromScene?: boolean) {
        this.scene.events.off('pillSlotsUpdated', this.updateSlots, this);
        super.destroy(fromScene);
    }
}

/** Skill buttons: the right-edge rail (drop-in for SkillUI). */
export class SkillRail extends Rail {
    private skills: SkillState[] = [];
    private readonly refresh = () => this.createSkills(this.skills);
    constructor(scene: Scene, x: number, y: number, private readonly onSkillClick?: (index: number) => void, depth = 200) {
        super(scene, x, y, depth);
        scene.events.on('skillsUpdated', this.refresh);
        scene.events.on('skillUsed', this.refresh);
    }
    private canUse(s: SkillState) {
        const k = s.skill;
        if (k.cooldownType === 'perBattle') return !s.usedThisBattle;
        if (k.cooldownType === 'perTurn') return s.usedThisTurn < (k.cooldownValue || 1);
        return s.canUse;
    }
    private status(s: SkillState) {
        const k = s.skill;
        if (k.cooldownType === 'perBattle') return s.usedThisBattle ? '0' : '1';
        if (k.cooldownType === 'perTurn') return `${(k.cooldownValue || 1) - s.usedThisTurn}`;
        return '';
    }
    createSkills(skills: SkillState[]) {
        this.skills = skills;
        this.clearTiles();
        skills.forEach((s, i) => {
            const ok = this.canUse(s);
            this.tile(i, skills.length, ok ? 'gold' : SPENT, 'qi', s.skill.name, this.status(s), ok, () => this.onSkillClick?.(i), undefined,
                `${(s.skill as { description?: string }).description ?? ''}${s.skill.cooldownType === 'perBattle' ? '\n每场一次' : s.skill.cooldownType === 'perTurn' ? `\n每回合 ${s.skill.cooldownValue || 1} 次` : ''}`);
        });
    }
    updateSkills(skills?: SkillState[]) { if (skills) this.skills = skills; this.createSkills(this.skills); }
    destroy(fromScene?: boolean) {
        this.scene.events.off('skillsUpdated', this.refresh);
        this.scene.events.off('skillUsed', this.refresh);
        super.destroy(fromScene);
    }
}
