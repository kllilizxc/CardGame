import type { Scene } from 'phaser';
import type { BattleContext } from '../../context/BattleContext';
import { FieldSprite } from '../../objects/FieldSprite';
import type { FieldCard } from '@data/types/cards/field';
import type { CardEffect, LegacyCardEffect, LegacyEffectAction } from '@data/types/cards/effects';
import type { CardSprite } from '../../objects/CardSprite';
import type { EffectResolver, EffectExecutionContext } from './EffectResolver';

/**
 * 场地卡管理器
 * 负责管理场地卡的放置、替换和效果触发
 */
export class FieldManager {
    private scene: Scene;
    private battleContext: BattleContext;
    private effectResolver: EffectResolver;
    private currentField: FieldSprite | null = null;

    constructor(scene: Scene, battleContext: BattleContext, effectResolver: EffectResolver) {
        this.scene = scene;
        this.battleContext = battleContext;
        this.effectResolver = effectResolver;
    }

    /**
     * 放置场地卡
     * @param fieldCard 场地卡数据
     * @param position 显示位置 {x, y}
     */
    public playField(fieldCard: FieldCard, position: { x: number; y: number }): void {
        // 如果已经有场地，先移除旧场地
        const oldField = this.currentField;
        if (this.currentField) {
            const oldFieldName = this.currentField.getCardData().name;
            this.removeCurrentField();
            this.battleContext.battleLog.addLog(`【${oldFieldName}】被【${fieldCard.name}】替换！`, oldField ? [oldField] : []);
        }

        // 创建新的场地精灵
        const cardScale = 0.6; // 场地卡显示较小
        this.currentField = new FieldSprite(
            this.scene,
            position.x,
            position.y,
            fieldCard,
            cardScale
        );

        // 记录日志（包含场地精灵引用）
        if (!oldField) {
            this.battleContext.battleLog.addLog(`【${fieldCard.name}】已生效！`, [this.currentField]);
        } else {
            // 更新之前的日志，添加新场地引用
            this.battleContext.battleLog.addLog(`【${fieldCard.name}】已生效！`, [this.currentField]);
        }

        // 添加到场景
        this.scene.add.existing(this.currentField);
        this.currentField.setDepth(50); // 场地卡在较低层级

        // 场地卡不可拖拽
        this.currentField.disableDragging();

        // 触发场地生效时的永续效果
        this.applyFieldPermanentEffects();

        // 通知场景场地已更改
        this.scene.events.emit('fieldChanged', fieldCard);
    }

    /**
     * 移除当前场地
     */
    public removeCurrentField(): void {
        if (this.currentField) {
            // 移除永续效果（需要在实际效果系统中实现）
            this.removeFieldPermanentEffects();

            // 销毁精灵
            this.currentField.destroy();
            this.currentField = null;

            // 通知场景场地已移除
            this.scene.events.emit('fieldRemoved');
        }
    }

    /**
     * 获取当前场地
     */
    public getCurrentField(): FieldSprite | null {
        return this.currentField;
    }

    /**
     * 获取当前场地数据
     */
    public getCurrentFieldData(): FieldCard | null {
        return this.currentField ? this.currentField.getCardData() : null;
    }

    /**
     * 构建场地效果执行上下文
     */
    private buildFieldContext(): EffectExecutionContext | null {
        if (!this.currentField) return null;

        const battleScene = this.scene as any;
        const playerField: CardSprite[] = battleScene.playerField || [];
        const enemyField: CardSprite[] = battleScene.enemyField || [];
        const fieldData = this.currentField.getCardData();

        return {
            playerField,
            enemyField,
            sourceCard: this.currentField,
            sourceName: fieldData.name,
        };
    }

    /**
     * 应用场地的永续效果
     */
    private applyFieldPermanentEffects(): void {
        if (!this.currentField) return;

        const ctx = this.buildFieldContext();
        if (!ctx) return;

        const fieldData = this.currentField.getCardData();
        const permanentEffects = (fieldData.effects?.filter(
            (e: CardEffect) => e.timing === 'permanent',
        ) || []) as LegacyCardEffect[];

        if (permanentEffects.length > 0) {
            this.battleContext.battleLog.addLog(
                `应用场地【${fieldData.name}】的永续效果`,
            );
            this.effectResolver.applyFieldPermanentEffects(permanentEffects, ctx);
        }
    }

    /**
     * 移除场地的永续效果
     */
    private removeFieldPermanentEffects(): void {
        if (!this.currentField) return;

        const ctx = this.buildFieldContext();
        if (!ctx) return;

        const fieldData = this.currentField.getCardData();
        this.battleContext.battleLog.addLog(`移除场地【${fieldData.name}】的效果`);
        this.effectResolver.removeFieldPermanentEffects(ctx);
    }

    /**
     * 在回合开始时触发场地效果
     * @param isPlayerTurn 是否玩家回合
     * @param playerUnits 玩家单位
     * @param enemyUnits 敌人单位
     */
    public onTurnStart(
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        const turnStartEffects = fieldData.effects?.filter((e: CardEffect) => e.timing === 'turnStart') || [];

        turnStartEffects.forEach((effect: CardEffect) => {
            this.applyFieldEffect(effect, isPlayerTurn, playerUnits, enemyUnits);
        });
    }

    /**
     * 在回合结束时触发场地效果
     * @param isPlayerTurn 是否玩家回合
     * @param playerUnits 玩家单位
     * @param enemyUnits 敌人单位
     */
    public onTurnEnd(
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        const turnEndEffects = fieldData.effects?.filter((e: CardEffect) => e.timing === 'turnEnd') || [];

        turnEndEffects.forEach((effect: CardEffect) => {
            this.applyFieldEffect(effect, isPlayerTurn, playerUnits, enemyUnits);
        });
    }

    /**
     * 应用场地效果（turnStart / turnEnd）
     */
    private applyFieldEffect(
        effect: CardEffect,
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        const fieldData = this.currentField!.getCardData();
        const isSymmetric = fieldData.symmetric;
        const scope = effect.target?.scope;

        let targetUnits: CardSprite[] = [];

        // 根据作用范围选择目标
        if (scope === 'allUnits') {
            targetUnits = [...playerUnits, ...enemyUnits];
        } else if (scope === 'allyUnits' || scope === 'allAllies') {
            targetUnits = isPlayerTurn ? playerUnits : enemyUnits;
        } else if (scope === 'enemyUnits' || scope === 'allEnemies') {
            targetUnits = isPlayerTurn ? enemyUnits : playerUnits;
        }

        // 对称场地效果对双方都生效
        if (isSymmetric && (
            scope === 'allyUnits'
            || scope === 'allAllies'
            || scope === 'enemyUnits'
            || scope === 'allEnemies'
        )) {
            targetUnits = [...playerUnits, ...enemyUnits];
        }

        if (targetUnits.length === 0) return;

        const ctx: EffectExecutionContext = {
            playerField: playerUnits,
            enemyField: enemyUnits,
            sourceCard: this.currentField!,
            sourceName: fieldData.name,
        };

        // 委托给 EffectResolver 执行每个动作
        effect.actions?.forEach((action: LegacyEffectAction) => {
            this.effectResolver.executeAction(action, targetUnits, ctx);
        });
    }
}
