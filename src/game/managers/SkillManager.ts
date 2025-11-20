import { Scene } from 'phaser';
import type { SkillCard } from '../../../public/data/types/cards/skill';
import type { BattleLog } from '../ui/BattleLog';

/**
 * 技能状态
 */
export interface SkillState {
    skill: SkillCard;
    usedThisBattle: boolean;      // 本场是否已使用（perBattle）
    usedThisTurn: number;          // 本回合已使用次数（perTurn）
    canUse: boolean;               // 当前是否可用
}

/**
 * 技能管理器
 * 管理玩家技能的状态、冷却和使用
 */
export class SkillManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private skills: SkillState[] = [];

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 初始化玩家技能
     */
    public initializeSkills(skillData: SkillCard[]): void {
        this.skills = skillData.map(skill => ({
            skill,
            usedThisBattle: false,
            usedThisTurn: 0,
            canUse: true
        }));

        this.battleLog.addLog(`装备技能：${skillData.map(s => `【${s.name}】`).join('、')}`);
    }

    /**
     * 获取所有技能状态
     */
    public getSkills(): SkillState[] {
        return this.skills;
    }

    /**
     * 检查技能是否可用
     */
    public canUseSkill(skillIndex: number): boolean {
        if (skillIndex < 0 || skillIndex >= this.skills.length) {
            return false;
        }

        const state = this.skills[skillIndex];
        const skill = state.skill;

        // 检查冷却类型
        if (skill.cooldownType === 'perBattle') {
            return !state.usedThisBattle;
        } else if (skill.cooldownType === 'perTurn') {
            const maxUses = skill.cooldownValue || 1;
            return state.usedThisTurn < maxUses;
        }

        return state.canUse;
    }

    /**
     * 使用技能
     */
    public useSkill(skillIndex: number, onComplete?: (skill: SkillCard) => void): boolean {
        if (!this.canUseSkill(skillIndex)) {
            this.battleLog.addLog('技能冷却中！');
            return false;
        }

        const state = this.skills[skillIndex];
        const skill = state.skill;

        this.battleLog.addLog(`使用技能【${skill.name}】`);

        // 更新使用状态
        if (skill.cooldownType === 'perBattle') {
            state.usedThisBattle = true;
        } else if (skill.cooldownType === 'perTurn') {
            state.usedThisTurn++;
        }

        // 播放技能特效
        this.playSkillEffect(skill, () => {
            // 触发技能效果回调
            if (onComplete) {
                onComplete(skill);
            }

            // 更新UI
            this.scene.events.emit('skillUsed', skillIndex);
        });

        return true;
    }

    /**
     * 播放技能使用特效
     */
    private playSkillEffect(_skill: SkillCard, onComplete: () => void): void {
        // 直接执行回调，不显示屏幕中央的特效
        if (onComplete) {
            onComplete();
        }
    }

    /**
     * 回合开始时重置回合冷却
     */
    public onTurnStart(): void {
        this.skills.forEach(state => {
            state.usedThisTurn = 0;
        });

        this.scene.events.emit('skillsUpdated');
    }

    /**
     * 重置所有技能（新战斗开始时）
     */
    public resetAllSkills(): void {
        this.skills.forEach(state => {
            state.usedThisBattle = false;
            state.usedThisTurn = 0;
            state.canUse = true;
        });

        this.scene.events.emit('skillsUpdated');
    }
}
