import { GameObjects, Scene } from 'phaser';
import type { SkillState } from '../../managers/battle/SkillManager';
import { getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import { battleColorToHex, battleTheme, blendBattleColor } from './battleTheme';
import { watchCardFace } from '../../objects/cardFaceAppearance';
import { isPortraitGameViewport } from '../../layout/gameViewport';

/**
 * 技能UI组件
 * 显示玩家的技能列表和状态
 */
export class SkillUI extends GameObjects.Container {
    private skillButtons: GameObjects.Container[] = [];
    private releaseFaces: Array<() => void> = [];
    private skills: SkillState[] = [];
    private onSkillClick: ((skillIndex: number) => void) | null = null;
    private readonly updateHandler = () => this.updateSkills();

    constructor(
        scene: Scene,
        x: number,
        y: number,
        onSkillClick?: (skillIndex: number) => void
    ) {
        super(scene, x, y);
        this.onSkillClick = onSkillClick || null;

        scene.add.existing(this);
        this.setDepth(140);

        // 监听技能更新事件
        scene.events.on('skillsUpdated', this.updateHandler);
        scene.events.on('skillUsed', this.updateHandler);
    }

    /**
     * 创建技能UI
     */
    public createSkills(skills: SkillState[]): void {
        this.skills = skills;

        // 清空现有UI
        this.clearSkills();

        const skillWidth = 170;
        const spacing = 16;
        const startX = -(skills.length * (skillWidth + spacing)) / 2 + skillWidth / 2;

        skills.forEach((skillState, index) => {
            const skillX = startX + index * (skillWidth + spacing);
            const skillContainer = this.createSkill(skillX, 0, skillState, index);
            this.skillButtons.push(skillContainer);
            this.add(skillContainer);
        });
    }

    /**
     * 创建单个技能按钮
     */
    private createSkill(
        x: number,
        y: number,
        skillState: SkillState,
        index: number
    ): GameObjects.Container {
        const container = this.scene.add.container(x, y);
        const skill = skillState.skill;
        const width = 170;
        const height = 104;

        // 技能背景
        const canUse = this.canUseSkill(skillState);
        const accent = canUse ? sceneTheme.colors.jadeBright : sceneTheme.colors.parchmentSoft;
        const baseFill = canUse
            ? blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.26)
            : blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.slate, 0.24);
        const hoverFill = canUse
            ? blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jadeBright, 0.34)
            : baseFill;

        const shadow = this.scene.add.rectangle(4, 6, width, height, sceneTheme.colors.shadow, 0.22);
        container.add(shadow);

        const bg = this.scene.add.rectangle(0, 0, width, height, baseFill, 0.96);
        bg.setStrokeStyle(2, accent, canUse ? 0.68 : 0.3);
        container.add(bg);

        const banner = this.scene.add.rectangle(
            0,
            -height / 2 + 16,
            width - 18,
            24,
            blendBattleColor(sceneTheme.colors.banner, accent, canUse ? 0.18 : 0.08),
            0.82,
        );
        banner.setStrokeStyle(1, accent, canUse ? 0.28 : 0.14);
        container.add(banner);

        // 技能名称
        const name = this.scene.add.text(0, -16, skill.name, getSceneTextStyle('panelEyebrow', {
            fontSize: '20px',
            color: battleTheme.colors.textPrimary,
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: width - 28 },
        })).setOrigin(0.5);
        container.add(name);

        // 冷却状态
        const cooldownText = this.getCooldownText(skillState);
        const statusText = this.scene.add.text(0, 20, cooldownText, getSceneTextStyle('support', {
            fontSize: '18px',
            color: canUse ? battleTheme.colors.textPositive : battleTheme.colors.textMuted,
            align: 'center',
            wordWrap: { width: width - 30 },
        })).setOrigin(0.5);
        container.add(statusText);

        const stateLine = this.scene.add.text(
            0,
            isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height) ? 42 : 50,
            canUse ? '可催动' : '暂不可用',
            getSceneTextStyle('panelEyebrow', {
                fontSize: '18px',
                color: battleColorToHex(canUse ? sceneTheme.colors.goldSoft : sceneTheme.colors.parchmentSoft),
            }),
        ).setOrigin(0.5);
        container.add(stateLine);

        // 设置交互
        if (canUse) {
            bg.setInteractive({ useHandCursor: true });

            bg.on('pointerover', () => {
                bg.setFillStyle(hoverFill, 1);
                bg.setStrokeStyle(3, sceneTheme.colors.goldSoft, 0.9);
                container.setScale(1.05);
            });

            bg.on('pointerout', () => {
                bg.setFillStyle(baseFill, 0.96);
                bg.setStrokeStyle(2, accent, 0.68);
                container.setScale(1.0);
            });

            bg.on('pointerdown', () => {
                if (this.onSkillClick) {
                    this.onSkillClick(index);
                }
            });
        }

        let face: GameObjects.Image | undefined;
        this.releaseFaces.push(watchCardFace(this.scene, skill, key => {
            face?.destroy();
            face = key ? this.scene.add.image(-55, -1, key).setDisplaySize(42, 61) : undefined;
            if (face) container.addAt(face, 3);
            name.setX(face ? 25 : 0).setWordWrapWidth(face ? 92 : width - 28);
            statusText.setX(face ? 25 : 0).setWordWrapWidth(face ? 92 : width - 30);
        }));

        return container;
    }

    /**
     * 判断技能是否可用
     */
    private canUseSkill(skillState: SkillState): boolean {
        const skill = skillState.skill;

        if (skill.cooldownType === 'perBattle') {
            return !skillState.usedThisBattle;
        } else if (skill.cooldownType === 'perTurn') {
            const maxUses = skill.cooldownValue || 1;
            return skillState.usedThisTurn < maxUses;
        }

        return skillState.canUse;
    }

    /**
     * 获取冷却状态文本
     */
    private getCooldownText(skillState: SkillState): string {
        const skill = skillState.skill;

        if (skill.cooldownType === 'perBattle') {
            return skillState.usedThisBattle ? '已使用' : '可用';
        } else if (skill.cooldownType === 'perTurn') {
            const maxUses = skill.cooldownValue || 1;
            const remaining = maxUses - skillState.usedThisTurn;
            return `本回合: ${remaining}/${maxUses}`;
        }

        return '可用';
    }

    /**
     * 更新技能显示
     */
    public updateSkills(skills?: SkillState[]): void {
        if (skills) {
            this.skills = skills;
        }

        // 重新创建所有技能按钮
        this.createSkills(this.skills);
    }

    /**
     * 清空技能UI
     */
    private clearSkills(): void {
        this.releaseFaces.forEach(release => release());
        this.releaseFaces = [];
        this.skillButtons.forEach(container => container.destroy());
        this.skillButtons = [];
    }

    /**
     * 销毁时清理
     */
    public destroy(fromScene?: boolean): void {
        this.scene.events.off('skillsUpdated', this.updateHandler);
        this.scene.events.off('skillUsed', this.updateHandler);
        this.clearSkills();
        super.destroy(fromScene);
    }
}
