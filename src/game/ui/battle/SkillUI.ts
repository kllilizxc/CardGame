import { GameObjects, Scene } from 'phaser';
import type { SkillState } from '../../managers/battle/SkillManager';

/**
 * 技能UI组件
 * 显示玩家的技能列表和状态
 */
export class SkillUI extends GameObjects.Container {
    private skillButtons: GameObjects.Container[] = [];
    private skills: SkillState[] = [];
    private onSkillClick: ((skillIndex: number) => void) | null = null;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        onSkillClick?: (skillIndex: number) => void
    ) {
        super(scene, x, y);
        this.onSkillClick = onSkillClick || null;

        scene.add.existing(this);
        this.setDepth(100);

        // 监听技能更新事件
        scene.events.on('skillsUpdated', () => this.updateSkills(), this);
        scene.events.on('skillUsed', () => this.updateSkills(), this);
    }

    /**
     * 创建技能UI
     */
    public createSkills(skills: SkillState[]): void {
        this.skills = skills;

        // 清空现有UI
        this.clearSkills();

        const skillWidth = 120;
        const spacing = 10;
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

        // 技能背景
        const canUse = this.canUseSkill(skillState);
        const bgColor = canUse ? 0x3498db : 0x555555;
        const bg = this.scene.add.rectangle(0, 0, 120, 80, bgColor, 0.9);
        bg.setStrokeStyle(3, canUse ? 0x2ecc71 : 0x7f8c8d);
        container.add(bg);

        // 技能名称
        const name = this.scene.add.text(0, -20, skill.name, {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 110 }
        }).setOrigin(0.5);
        container.add(name);

        // 冷却状态
        const cooldownText = this.getCooldownText(skillState);
        const statusText = this.scene.add.text(0, 10, cooldownText, {
            fontSize: '12px',
            color: canUse ? '#2ecc71' : '#e74c3c',
            align: 'center'
        }).setOrigin(0.5);
        container.add(statusText);

        // 设置交互
        if (canUse) {
            bg.setInteractive({ useHandCursor: true });

            bg.on('pointerover', () => {
                bg.setStrokeStyle(4, 0xf39c12);
                container.setScale(1.05);
            });

            bg.on('pointerout', () => {
                bg.setStrokeStyle(3, 0x2ecc71);
                container.setScale(1.0);
            });

            bg.on('pointerdown', () => {
                if (this.onSkillClick) {
                    this.onSkillClick(index);
                }
            });
        }

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
        this.skillButtons.forEach(container => container.destroy());
        this.skillButtons = [];
    }

    /**
     * 销毁时清理
     */
    public destroy(fromScene?: boolean): void {
        this.scene.events.off('skillsUpdated', this.updateSkills, this);
        this.scene.events.off('skillUsed', this.updateSkills, this);
        super.destroy(fromScene);
    }
}
