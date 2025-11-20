import type { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { ArtifactSprite } from '../objects/ArtifactSprite';
import type { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import type { CombatManager } from './CombatManager';
import type { CardManager } from './CardManager';
import type { FieldManager } from './FieldManager';
import type { TurnManager } from './TurnManager';
import type { BattleLog } from '../ui/BattleLog';

/**
 * 战斗事件管理器
 * 集中管理所有战斗相关的事件监听和处理
 */
export class BattleEventManager {
    private scene: Scene;
    private combatManager: CombatManager;
    private cardManager: CardManager;
    private fieldManager: FieldManager;
    private battleLog: BattleLog;

    private playerField: CardSprite[] = [];
    private enemyField: CardSprite[] = [];
    private hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    private fieldZone!: Phaser.GameObjects.Zone;

    // 符箓相关
    private highlightedTarget: CardSprite | null = null;
    private targetHighlight: Phaser.GameObjects.Graphics | null = null;

    constructor(
        scene: Scene,
        combatManager: CombatManager,
        cardManager: CardManager,
        fieldManager: FieldManager,
        battleLog: BattleLog
    ) {
        this.scene = scene;
        this.combatManager = combatManager;
        this.cardManager = cardManager;
        this.fieldManager = fieldManager;
        this.battleLog = battleLog;
    }

    /**
     * 设置场景引用（用于访问动态数据）
     */
    public setReferences(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[],
        fieldZone: Phaser.GameObjects.Zone
    ): void {
        this.playerField = playerField;
        this.enemyField = enemyField;
        this.hand = hand;
        this.fieldZone = fieldZone;
    }

    /**
     * 初始化所有事件监听
     */
    public setupAllEvents(): void {
        this.setupCombatEvents();
        this.setupTalismanEvents();
        this.setupFieldEvents();
        this.setupCleanupEvents();
    }

    /**
     * 设置战斗相关事件
     */
    private setupCombatEvents(): void {
        // 效果应用完成事件
        this.scene.events.on('effectApplied', () => {
            if (this.combatManager.hasDeadUnits(this.playerField, this.enemyField)) {
                this.scene.events.emit('checkDeadUnits');
            }
        });

        // 死亡检查事件
        this.scene.events.on('checkDeadUnits', () => {
            const result = this.combatManager.removeDeadUnits(
                this.playerField,
                this.enemyField,
                () => {
                    this.cardManager.arrangePlayerField(this.playerField);
                    this.cardManager.arrangeEnemyField(this.enemyField);
                }
            );
            
            this.playerField.length = 0;
            this.playerField.push(...result.playerField);
            this.enemyField.length = 0;
            this.enemyField.push(...result.enemyField);
        });
    }

    /**
     * 设置符箓使用事件
     */
    private setupTalismanEvents(): void {
        // 符箓拖拽开始
        this.scene.events.on('talismanDragStart', (talisman: TalismanSprite) => {
            this.highlightedTarget = null;
            if (this.targetHighlight) {
                this.targetHighlight.destroy();
                this.targetHighlight = null;
            }
        });

        // 符箓拖拽中
        this.scene.events.on('talismanDragging', (
            talisman: TalismanSprite,
            pointer: Phaser.Input.Pointer
        ) => {
            const target = this.getEnemyUnitAtPosition(pointer.x, pointer.y);
            
            if (target !== this.highlightedTarget) {
                if (this.targetHighlight) {
                    this.targetHighlight.destroy();
                    this.targetHighlight = null;
                }
                
                this.highlightedTarget = target;
                
                if (target) {
                    const bounds = target.getBounds();
                    this.targetHighlight = this.scene.add.graphics();
                    this.targetHighlight.lineStyle(4, 0x00ff00, 1);
                    this.targetHighlight.strokeRoundedRect(
                        bounds.x,
                        bounds.y,
                        bounds.width,
                        bounds.height,
                        8
                    );
                    this.targetHighlight.setDepth(999);
                }
            }
        });

        // 符箓拖拽结束
        this.scene.events.on('talismanDragEnd', (talisman: TalismanSprite) => {
            if (this.targetHighlight) {
                this.targetHighlight.destroy();
                this.targetHighlight = null;
            }
        });

        // 尝试使用符箓
        this.scene.events.on('tryUseTalisman', (talisman: TalismanSprite) => {
            if (this.highlightedTarget) {
                this.scene.events.emit('useTalisman', talisman, this.highlightedTarget);
            } else {
                talisman.returnToOriginalPosition();
            }
            this.highlightedTarget = null;
        });
    }

    /**
     * 设置场地卡使用事件
     */
    private setupFieldEvents(): void {
        this.scene.events.on('cardDragEnd', (
            card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite
        ) => {
            if (!(card instanceof FieldSprite)) {
                return;
            }

            const pointer = this.scene.input.activePointer;
            const fieldData = card.getCardData();
            const bounds = this.fieldZone.getBounds();

            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                const index = this.hand.indexOf(card);
                if (index > -1) {
                    this.hand.splice(index, 1);
                }

                const fieldPosition = {
                    x: this.fieldZone.x,
                    y: this.fieldZone.y
                };

                this.fieldManager.playField(fieldData, fieldPosition);
                this.cardManager.arrangeHand(this.hand);

                this.scene.time.delayedCall(300, () => {
                    if (card.active) {
                        card.destroy();
                    }
                });
            } else {
                card.returnToOriginalPosition();
            }
        });
    }

    /**
     * 设置清理事件
     */
    private setupCleanupEvents(): void {
        this.scene.events.once('shutdown', () => {
            this.scene.events.removeAllListeners('effectApplied');
            this.scene.events.removeAllListeners('checkDeadUnits');
            this.scene.events.removeAllListeners('talismanDragStart');
            this.scene.events.removeAllListeners('talismanDragging');
            this.scene.events.removeAllListeners('talismanDragEnd');
            this.scene.events.removeAllListeners('tryUseTalisman');
            this.scene.events.removeAllListeners('cardDragEnd');
            this.scene.events.removeAllListeners('showCardPreview');
            this.scene.events.removeAllListeners('hideCardPreview');
            this.scene.events.removeAllListeners('update');
        });
    }

    /**
     * 获取指定位置的敌方单位
     */
    private getEnemyUnitAtPosition(x: number, y: number): CardSprite | null {
        const expandRadius = 50;
        
        for (const enemy of this.enemyField) {
            const bounds = enemy.getBounds();
            const expandedBounds = Phaser.Geom.Rectangle.Clone(bounds);
            Phaser.Geom.Rectangle.Inflate(expandedBounds, expandRadius, expandRadius);
            
            if (Phaser.Geom.Rectangle.Contains(expandedBounds, x, y)) {
                return enemy;
            }
        }
        return null;
    }
}
