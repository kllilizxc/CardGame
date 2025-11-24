import type { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { BattleContext } from '../context/BattleContext';

/**
 * Tick 回调函数类型
 */
type TickCallback = () => void;

/**
 * 战斗 Tick 管理器
 * 在关键时间点统一检查和处理游戏状态变化
 * 使用 battleContext 访问所有战斗管理器
 */
export class BattleTickManager {
    private scene: Scene;
    private battleContext: BattleContext;
    
    // 回调队列
    private tickCallbacks: TickCallback[] = [];
    
    // 场地引用
    private getPlayerField: () => CardSprite[];
    private getEnemyField: () => CardSprite[];
    private setPlayerField: (field: CardSprite[]) => void;
    private setEnemyField: (field: CardSprite[]) => void;

    constructor(
        scene: Scene,
        battleContext: BattleContext,
        fieldAccessors: {
            getPlayerField: () => CardSprite[];
            getEnemyField: () => CardSprite[];
            setPlayerField: (field: CardSprite[]) => void;
            setEnemyField: (field: CardSprite[]) => void;
        }
    ) {
        this.scene = scene;
        this.battleContext = battleContext;
        
        this.getPlayerField = fieldAccessors.getPlayerField;
        this.getEnemyField = fieldAccessors.getEnemyField;
        this.setPlayerField = fieldAccessors.setPlayerField;
        this.setEnemyField = fieldAccessors.setEnemyField;
    }

    /**
     * 注册一个 tick 回调
     */
    public registerCallback(callback: TickCallback): void {
        this.tickCallbacks.push(callback);
    }

    /**
     * 移除一个 tick 回调
     */
    public unregisterCallback(callback: TickCallback): void {
        const index = this.tickCallbacks.indexOf(callback);
        if (index > -1) {
            this.tickCallbacks.splice(index, 1);
        }
    }

    /**
     * 执行 tick - 在关键时间点调用
     * 应该在动画完成、效果执行完毕等异步操作的回调中调用
     * 
     * Tick 执行顺序：
     * 1. 移除死亡单位
     * 2. 检查战斗胜负
     * 3. 执行所有注册的回调
     */
    public tick(): void {
        const playerField = this.getPlayerField();
        const enemyField = this.getEnemyField();
        
        // 1. 检查并移除死亡单位
        const hasDeadUnits = this.battleContext.combatManager.hasDeadUnits(playerField, enemyField);
        
        if (hasDeadUnits) {
            console.log('[BattleTickManager] 检测到死亡单位，准备移除...');
            
            const result = this.battleContext.combatManager.removeDeadUnits(
                playerField,
                enemyField,
                (newPlayerField: CardSprite[], newEnemyField: CardSprite[]) => {
                    this.setPlayerField(newPlayerField);
                    this.setEnemyField(newEnemyField);
                    this.battleContext.cardManager.arrangePlayerField(newPlayerField);
                    this.battleContext.cardManager.arrangeEnemyField(newEnemyField);
                }
            );
            
            this.setPlayerField(result.playerField);
            this.setEnemyField(result.enemyField);
        }
        
        // 2. 检查战斗状态（包括胜负条件）
        const battleScene = this.scene as any;
        if (battleScene.playerHealth !== undefined) {
            const currentPlayerField = this.getPlayerField();
            const currentEnemyField = this.getEnemyField();
            
            this.battleContext.battleStateChecker.checkBattleState(
                currentPlayerField,
                currentEnemyField,
                battleScene.playerHealth,
                () => {}, // onUnitRemoved 已经在上面处理
                (victory: boolean) => {
                    // 战斗结束回调
                    if (battleScene.handleBattleEnd) {
                        battleScene.handleBattleEnd(victory);
                    }
                }
            );
        }
        
        // 3. 执行所有注册的回调
        this.tickCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Tick callback error:', error);
            }
        });
    }

}
