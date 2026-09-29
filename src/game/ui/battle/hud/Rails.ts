import { GameObjects, type Scene } from 'phaser';
import type { PillSlot } from '../../../managers/battle/PillManager';
import type { SkillState } from '../../../managers/battle/SkillManager';
import { C, FONT, hex } from '../../../art/palette';
import { iconTexture, type IconName } from '../../../art/sprites';
import { drawPixelFrame, type PanelStyle } from '../../../art/ui';

const TILE = 88;
const GAP = 14;

const READY: PanelStyle = { fill: C.pine, edge: C.void, border: C.jade, hi: C.lime, lo: C.ink, stud: C.gold };
const SPENT: PanelStyle = { fill: C.ink, edge: C.void, border: C.dusk, hi: C.dusk, lo: C.void, stud: null };

abstract class Rail extends GameObjects.Container {
    protected tiles: GameObjects.Container[] = [];
    constructor(scene: Scene, x: number, y: number, depth: number) {
        super(scene, x, y);
        scene.add.existing(this);
        this.setDepth(depth);
    }
    protected clearTiles() {
        this.tiles.forEach(t => t.destroy());
        this.tiles = [];
    }
    protected tile(index: number, count: number, style: PanelStyle, icon: IconName | null, label: string, sub: string, enabled: boolean, onClick: () => void, onHover?: (on: boolean) => void) {
        const scene = this.scene;
        const y = (index - (count - 1) / 2) * (TILE + GAP);
        const c = scene.add.container(0, y);
        const g = scene.add.graphics().setPosition(-TILE / 2, -TILE / 2);
        const draw = (hot: boolean) => {
            g.clear();
            drawPixelFrame(g, TILE, TILE, hot && enabled ? { ...style, border: C.gold, hi: C.glow } : style);
        };
        draw(false);
        c.add(g);
        if (icon) c.add(scene.add.image(0, -16, iconTexture(scene, icon)).setScale(3).setAlpha(enabled ? 1 : 0.4));
        c.add(scene.add.text(0, icon ? 17 : -6, label, { fontFamily: FONT, fontSize: '12px', color: hex(enabled ? C.paper : C.mist), align: 'center', wordWrap: { width: TILE - 12 } }).setOrigin(0.5));
        if (sub) c.add(scene.add.text(0, TILE / 2 - 10, sub, { fontFamily: FONT, fontSize: '12px', color: hex(enabled ? C.celadon : C.haze) }).setOrigin(0.5));
        c.setSize(TILE, TILE);
        c.setInteractive({ useHandCursor: enabled });
        c.on('pointerover', () => { draw(true); onHover?.(true); if (enabled) scene.tweens.add({ targets: c, x: c.x + (this.x > scene.scale.width / 2 ? -8 : 8), duration: 90 }); });
        c.on('pointerout', () => { draw(false); onHover?.(false); scene.tweens.add({ targets: c, x: 0, duration: 90 }); });
        c.on('pointerdown', () => { if (enabled) onClick(); });
        this.add(c);
        this.tiles.push(c);
        return c;
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
            this.tile(i, slots.length, empty ? SPENT : READY, empty ? null : 'pill', empty ? '空囊' : slot.pill!.name.slice(0, 5), '', !empty,
                () => this.onSlotClick?.(i),
                on => {
                    if (empty || !slot.pill) return;
                    if (on) this.scene.events.emit('showPillTooltip', slot.pill, this.x + (this.x > this.scene.scale.width / 2 ? -150 : 150), this.y + (i - (slots.length - 1) / 2) * (TILE + GAP));
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
        if (k.cooldownType === 'perBattle') return s.usedThisBattle ? '已用' : '可用';
        if (k.cooldownType === 'perTurn') return `${(k.cooldownValue || 1) - s.usedThisTurn}/${k.cooldownValue || 1}`;
        return '可用';
    }
    createSkills(skills: SkillState[]) {
        this.skills = skills;
        this.clearTiles();
        skills.forEach((s, i) => {
            const ok = this.canUse(s);
            this.tile(i, skills.length, ok ? READY : SPENT, 'bolt', s.skill.name.slice(0, 5), this.status(s), ok, () => this.onSkillClick?.(i));
        });
    }
    updateSkills(skills?: SkillState[]) { if (skills) this.skills = skills; this.createSkills(this.skills); }
    destroy(fromScene?: boolean) {
        this.scene.events.off('skillsUpdated', this.refresh);
        this.scene.events.off('skillUsed', this.refresh);
        super.destroy(fromScene);
    }
}
