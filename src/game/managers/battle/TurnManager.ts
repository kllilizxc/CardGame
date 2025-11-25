import type { Scene } from 'phaser';
import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';

/**
 * 回合管理器上下文（用于回合执行时的运行时数据）
 */
export interface TurnManagerContext {
    playerField: CardSprite[];
    enemyField: CardSprite[];
    isPlayerTurn: boolean;
    isProcessingTurn: boolean;
    playerHealth: number;
    onPlayerDamaged: (damage: number) => void;
    onRemoveUnit: (unit: CardSprite, isPlayer: boolean) => void;
    onArrangeField: () => void;
    onApplyPlayerTurnEndEffects: () => void;
    onSetIsPlayerTurn: (value: boolean) => void;
    onSetTurnNumber: (value: number) => void;
    onSetIsProcessingTurn: (value: boolean) => void;
    onDisablePlayerInteraction: () => void;
}

/**
 * 回合管理器
 * 保留 scene 用于 UI 动画，使用 battleContext 访问战斗逻辑
 */
export class TurnManager {
    private scene: Scene;
    private battleContext: BattleContext;

    constructor(scene: Scene, battleContext: BattleContext) {
        this.scene = scene;
        this.battleContext = battleContext;
    }

    // 显示回合切换动画
    public showTurnAnimation(text: string, color: number, onComplete: () => void): void {
        this.battleContext.effectManager.showTurnAnimation(text, color, onComplete);
    }

    // 显示胜利画面
    public showVictory(onRestart: () => void): void {
        const { width, height } = this.scene.scale;
        const overlayDepth = 10000;

        // 纯黑底遮罩，盖住所有 UI
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 1);
        overlay.setDepth(overlayDepth).setInteractive();

        this.scene.add.text(width / 2, height / 2, '胜利！', {
            fontSize: '64px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(overlayDepth + 1);

        this.scene.add.text(width / 2, height / 2 + 80, '点击任意位置重新开始', {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(overlayDepth + 1);

        this.scene.input.once('pointerdown', onRestart);
    }

    // 显示失败画面
    public showDefeat(onRestart: () => void): void {
        const { width, height } = this.scene.scale;

        // 半透明遮罩
        this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(1999);

        this.scene.add.text(width / 2, height / 2, '失败！', {
            fontSize: '64px',
            color: '#e74c3c',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(2000);

        this.scene.add.text(width / 2, height / 2 + 80, '点击任意位置重新开始', {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(2000);

        this.scene.input.once('pointerdown', onRestart);
    }

    /**
     * 结束回合
     */
    public endTurn(context: TurnManagerContext): void {
        console.log('TurnManager.endTurn 被调用', {
            isPlayerTurn: context.isPlayerTurn,
            isProcessingTurn: context.isProcessingTurn
        });

        if (!context.isPlayerTurn || context.isProcessingTurn) {
            console.log('endTurn 被拦截：', {
                reason: !context.isPlayerTurn ? '不是玩家回合' : '正在处理回合'
            });
            return;
        }

        // 设置处理标志，防止重复点击
        context.onSetIsProcessingTurn(true);
        console.log('设置 isProcessingTurn = true');

        // 1. 触发回合结束状态
        this.battleContext.battleLog.addLog('═══ 回合结束阶段 ═══');
        this.battleContext.battleStatusController.triggerTurnEndStatuses(
            context.playerField,
            context.enemyField
        );

        // 2. 等待状态动画完成后进入战斗阶段
        this.battleContext.battleLog.addLog('═══ 战斗阶段 ═══');
        context.onApplyPlayerTurnEndEffects();
        this.executePlayerTurn(context);
    }

    /**
     * 执行玩家攻击阶段
     */
    public executePlayerTurn(context: TurnManagerContext): void {
        context.combatManager.resolveCombat(
            context.isPlayerTurn,
            context.playerField,
            context.enemyField,
            context.onPlayerDamaged,
            () => {
                // 切换到敌人回合
                context.onSetIsPlayerTurn(false);

                // 等待死亡动画完成后切换到敌人回合
                this.scene.time.delayedCall(600, () => {
                this.showTurnAnimation('敌人回合', 0xe74c3c, () => {
                    this.startEnemyTurn(context);
                    });
                });
            }
        );
    }

    /**
     * 开始敌人回合
     */
    public startEnemyTurn(context: TurnManagerContext): void {
        // 禁用玩家交互
        context.onDisablePlayerInteraction();

        // 1. 触发回合开始状态
        this.battleContext.battleLog.addLog('═══ 敌人回合开始 ═══');
        this.battleContext.battleStatusController.triggerTurnStartStatuses(
            context.playerField,
            context.enemyField
        );

        // 2. 等待状态动画完成后进入战斗
        this.scene.time.delayedCall(800, () => {
            this.executeEnemyTurn(context);
        });
    }

    /**
     * 执行敌人攻击阶段
     */
    public executeEnemyTurn(context: TurnManagerContext): void {
        context.combatManager.resolveCombat(
            false, // 敌人回合，isPlayerTurn 应该是 false
            context.playerField,
            context.enemyField,
            context.onPlayerDamaged,
            () => {
                // 切换到玩家回合并增加回合数
                context.onSetIsPlayerTurn(true);
                context.onSetTurnNumber(context.turnNumber + 1);

                // 等待死亡动画完成后，先触发敌人回合结束状态
                this.scene.time.delayedCall(600, () => {
                    this.battleContext.battleLog.addLog('═══ 敌人回合结束 ═══');
                    this.battleContext.battleStatusController.triggerTurnEndStatuses(
                        context.playerField,
                        context.enemyField
                    );

                    // 等待状态动画完成后切换到玩家回合
                    this.scene.time.delayedCall(800, () => {
                        this.showTurnAnimation(`回合 ${context.turnNumber + 1}`, 0x2ecc71, () => {
                            this.startPlayerTurn(context);
                        });
                    });
                });
            }
        );
    }

    /**
     * 开始玩家回合
     */
    public startPlayerTurn(context: TurnManagerContext): void {
        // 重置回合处理标志，允许玩家再次结束回合
        context.onSetIsProcessingTurn(false);

        // 启用玩家交互
        context.onEnablePlayerInteraction();

        // 1. 触发回合开始状态
        this.battleContext.battleLog.addLog(`═══ 回合 ${context.turnNumber} 开始 ═══`);
        this.battleContext.battleStatusController.triggerTurnStartStatuses(
            context.playerField,
            context.enemyField
        );

        // 2. 抽卡（立即执行，不再等待）
        context.onDrawCard();
    }
}
