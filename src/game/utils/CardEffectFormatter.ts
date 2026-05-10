import type { CardEffect } from '@data/types/cards/effects';

/**
 * 卡牌效果描述格式化工具
 * 统一处理不同卡牌类型的效果描述生成逻辑
 */
export class CardEffectFormatter {
    /**
     * 格式化效果数组为显示文本
     * @param effects 效果数组
     * @param options 格式化选项
     * @returns 格式化后的效果描述
     */
    static formatEffects(
        effects: CardEffect[] | undefined,
        options?: {
            maxLength?: number;  // 最大长度，超出会截断
            separator?: string;  // 多个效果的分隔符
            showTiming?: boolean; // 是否显示触发时机
        }
    ): string {
        const {
            maxLength = 200,
            separator = '\n',
            showTiming = false
        } = options || {};

        if (!effects || effects.length === 0) {
            return '无效果';
        }

        const effectTexts: string[] = [];

        effects.forEach(effect => {
            // 优先使用预定义的文本描述
            if (effect.text) {
                let text = effect.text;
                
                // 可选：添加触发时机
                if (showTiming && effect.timing) {
                    const timingMap: Record<string, string> = {
                        'turnStart': '回合开始',
                        'turnEnd': '回合结束',
                        'onKill': '击杀时',
                        'onDeath': '死亡时',
                        'permanent': '永久'
                    };
                    const timingText = timingMap[effect.timing] || effect.timing;
                    text = `【${timingText}】${text}`;
                }
                
                effectTexts.push(text);
                return;
            }

            // 如果没有预定义文本，尝试从 actions 解析
            if (effect.actions && effect.actions.length > 0) {
                const action = effect.actions[0]; // 简化处理：只取第一个动作
                const actionText = this.formatAction(action);
                if (actionText) {
                    effectTexts.push(actionText);
                }
            }
        });

        let result = effectTexts.join(separator);

        // 截断过长的文本
        if (result.length > maxLength) {
            result = result.substring(0, maxLength - 3) + '...';
        }

        return result || '无效果';
    }

    /**
     * 格式化单个动作为文本
     */
    private static formatAction(action: any): string {
        switch (action.type) {
            case 'modifyHealth':
                if (action.value !== undefined) {
                    const damage = Math.abs(action.value);
                    return action.value < 0 
                        ? `造成${damage}点伤害` 
                        : `恢复${damage}点生命`;
                }
                break;

            case 'modifyAttack':
                if (action.value !== undefined) {
                    return `攻击力${action.value > 0 ? '+' : ''}${action.value}`;
                }
                break;

            case 'modifyMaxHealth':
                if (action.value !== undefined) {
                    return `最大生命${action.value > 0 ? '+' : ''}${action.value}`;
                }
                break;

            case 'applyStatus':
                if (action.statusId) {
                    return `施加状态：${action.statusId}`;
                }
                return '施加状态';

            case 'removeStatus':
                if (action.statusId) {
                    return `移除状态：${action.statusId}`;
                }
                return '移除状态';

            case 'drawCard':
                const count = action.count || 1;
                return `抽${count}张卡`;

            case 'dealDamage':
                if (action.amount !== undefined) {
                    return `造成${action.amount}点伤害`;
                }
                break;

            case 'heal':
                if (action.amount !== undefined) {
                    return `恢复${action.amount}点生命`;
                }
                break;

            default:
                return '特殊效果';
        }

        return '';
    }

    /**
     * 简短格式化（用于卡牌上的简要显示）
     */
    static formatShort(effects: CardEffect[] | undefined): string {
        return this.formatEffects(effects, {
            maxLength: 60,
            separator: ' / ',
            showTiming: false
        });
    }

    /**
     * 详细格式化（用于预览或详情显示）
     */
    static formatDetailed(effects: CardEffect[] | undefined): string {
        return this.formatEffects(effects, {
            maxLength: 300,
            separator: '\n',
            showTiming: true
        });
    }
}
