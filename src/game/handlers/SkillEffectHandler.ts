import { GameActionHandler, type GameActionContext } from './GameActionHandler';
import type { SkillCard } from '@data/types/cards/skill';

// 重用 GameActionContext 作为技能效果上下文
export type SkillEffectContext = GameActionContext;

/**
 * 技能效果处理器
 * 负责处理各种技能效果的实际逻辑，依赖 GameActionHandler 处理通用动作
 */
export class SkillEffectHandler {
    private gameActionHandler: GameActionHandler;

    constructor(context: SkillEffectContext) {
        this.gameActionHandler = new GameActionHandler(context);
    }

    /**
     * 应用技能效果
     * @param skill 技能卡数据
     * @param onCancel 技能被取消时的回调（用于可取消的技能）
     */
    public applySkillEffect(skill: SkillCard, onCancel?: () => void): void {
        if (!skill.effects || skill.effects.length === 0) {
            return;
        }

        skill.effects.forEach((effect: any) => {
            if (!effect.actions) return;

            effect.actions.forEach((action: any) => {
                this.handleAction(action, onCancel);
            });
        });
    }

    /**
     * 处理单个技能动作
     */
    private handleAction(action: any, onCancel?: () => void): void {
        switch (action.type) {
            case 'searchDeck':
                this.handleSearchDeck(action, onCancel);
                break;

            case 'drawCards':
                this.handleDrawCards(action);
                break;

            default:
                console.log(`未知的技能效果类型: ${action.type}`);
        }
    }

    /**
     * 处理从卡组检索卡牌
     */
    private handleSearchDeck(action: any, onCancel?: () => void): void {
        const count = action.value || 1;
        this.gameActionHandler.searchDeck(count, undefined, onCancel);
    }

    /**
     * 处理抽卡效果
     */
    private handleDrawCards(action: any): void {
        const count = action.value || 1;
        this.gameActionHandler.drawCards(count);
    }

    /**
     * 更新上下文（用于运行时更新deck、hand等引用）
     */
    public updateContext(updates: Partial<SkillEffectContext>): void {
        this.gameActionHandler.updateContext(updates);
    }

    /**
     * 获取游戏动作处理器（供外部直接使用通用动作）
     */
    public getGameActionHandler(): GameActionHandler {
        return this.gameActionHandler;
    }
}
