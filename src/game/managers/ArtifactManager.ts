import type { Scene } from 'phaser';
import type { BattleLog } from '../ui/BattleLog';
import type { CardSprite } from '../objects/CardSprite';
import type { ArtifactSprite } from '../objects/ArtifactSprite';
import type { ArtifactCard } from '../../../data/types/cards/artifact';

interface EquippedArtifact {
    artifact: ArtifactSprite;
    target: CardSprite;
    appliedBonus: {
        attack: number;
        health: number;
    };
}

export class ArtifactManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private equippedArtifacts: Map<string, EquippedArtifact> = new Map(); // artifactId -> equipped info

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 装备法器到单位
     */
    public equipArtifact(artifact: ArtifactSprite, target: CardSprite): boolean {
        const artifactData = artifact.getCardData();
        const targetData = target.getCardData();

        // 检查目标类型
        if (artifactData.equipTarget !== 'unit') {
            console.warn('该法器不能装备到单位上');
            return false;
        }

        // 检查是否已经装备了同一个法器
        const artifactId = `${artifactData.id}_${artifact.getData('instanceId') || Date.now()}`;
        if (this.equippedArtifacts.has(artifactId)) {
            console.warn('该法器已经被装备');
            return false;
        }

        // 检查该单位是否已经装备了其他法器（一个单位只能装备一个法器）
        const existingArtifacts = this.getEquippedArtifacts(target);
        if (existingArtifacts.length > 0) {
            // 卸下旧法器并让它进入弃牌堆
            const oldArtifact = existingArtifacts[0];
            const oldArtifactId = this.getArtifactId(oldArtifact);
            
            if (oldArtifactId) {
                const equipped = this.equippedArtifacts.get(oldArtifactId);
                if (equipped) {
                    const oldArtifactData = oldArtifact.getCardData();
                    
                    // 移除加成
                    if (equipped.appliedBonus.attack > 0) {
                        targetData.attack -= equipped.appliedBonus.attack;
                    }
                    if (equipped.appliedBonus.health > 0) {
                        targetData.health -= equipped.appliedBonus.health;
                    }
                    
                    // 移除记录
                    this.equippedArtifacts.delete(oldArtifactId);
                    
                    // 日志
                    this.battleLog.addLog(`【${targetData.name}】替换法器，卸下了【${oldArtifactData.name}】`);
                    
                    // 将旧法器加入弃牌堆并播放动画
                    const battleScene = this.scene as any;
                    if (battleScene.addToDiscardPile) {
                        battleScene.addToDiscardPile(oldArtifactData);
                    }
                    if (battleScene.playCardToDiscardPileAnimation) {
                        battleScene.playCardToDiscardPileAnimation(oldArtifact);
                    } else {
                        oldArtifact.destroy();
                    }
                }
            }
        }

        // 应用加成
        const appliedBonus = {
            attack: artifactData.attackBonus || 0,
            health: artifactData.healthBonus || 0
        };

        if (appliedBonus.attack > 0) {
            targetData.attack += appliedBonus.attack;
        }
        if (appliedBonus.health > 0) {
            targetData.health += appliedBonus.health;
        }

        // 更新卡牌显示
        target.updateStats();

        // 记录装备信息
        this.equippedArtifacts.set(artifactId, {
            artifact,
            target,
            appliedBonus
        });

        // 视觉效果：将法器附着在单位上
        this.attachArtifactVisual(artifact, target);

        // 日志
        this.battleLog.addLog(`【${targetData.name}】装备了【${artifactData.name}】`, [target]);

        return true;
    }

    /**
     * 卸下法器
     */
    public unequipArtifact(artifactId: string): boolean {
        const equipped = this.equippedArtifacts.get(artifactId);
        if (!equipped) {
            return false;
        }

        const { artifact, target, appliedBonus } = equipped;
        const targetData = target.getCardData();
        const artifactData = artifact.getCardData();

        // 移除加成
        if (appliedBonus.attack > 0) {
            targetData.attack -= appliedBonus.attack;
        }
        if (appliedBonus.health > 0) {
            targetData.health -= appliedBonus.health;
        }

        // 更新卡牌显示
        target.updateStats();

        // 移除视觉附着
        artifact.destroy();

        // 移除记录
        this.equippedArtifacts.delete(artifactId);

        // 日志
        this.battleLog.addLog(`【${targetData.name}】卸下了【${artifactData.name}】`);

        return true;
    }

    /**
     * 获取法器的ID（用于在Map中查找）
     */
    private getArtifactId(artifact: ArtifactSprite): string | null {
        // 遍历 equippedArtifacts 找到对应的 artifactId
        for (const [id, equipped] of this.equippedArtifacts.entries()) {
            if (equipped.artifact === artifact) {
                return id;
            }
        }
        return null;
    }

    /**
     * 单位死亡后清理装备记录
     */
    public cleanupUnitArtifacts(unit: CardSprite) {
        const toRemove: string[] = [];
        this.equippedArtifacts.forEach((equipped, artifactId) => {
            if (equipped.target === unit) {
                toRemove.push(artifactId);
            }
        });

        toRemove.forEach(id => {
            this.equippedArtifacts.delete(id);
        });
    }

    /**
     * 检查法器耐久度
     */
    public checkDurability(artifactId: string): boolean {
        const equipped = this.equippedArtifacts.get(artifactId);
        if (!equipped) {
            return false;
        }

        const { artifact } = equipped;
        const isValid = artifact.reduceDurability();
        
        if (!isValid) {
            // 耐久度耗尽，卸下法器
            this.battleLog.addLog(`【${artifact.getCardData().name}】耐久度耗尽，已损坏`);
            this.unequipArtifact(artifactId);
            return false;
        }

        return true;
    }

    /**
     * 攻击时触发法器效果
     */
    public onUnitAttack(unit: CardSprite) {
        // 找到装备在该单位上的所有法器
        this.equippedArtifacts.forEach((equipped, artifactId) => {
            if (equipped.target === unit) {
                const { artifact } = equipped;
                const artifactData = artifact.getCardData();

                // 触发 onAttack 效果
                if (artifactData.effects) {
                    artifactData.effects.forEach(effect => {
                        if (effect.timing === 'onAttack') {
                            // TODO: 实现效果系统
                            console.log(`触发法器效果: ${effect.text}`);
                        }
                    });
                }

                // 检查耐久度
                if (artifactData.durability) {
                    this.checkDurability(artifactId);
                }
            }
        });
    }

    /**
     * 受伤时触发法器效果
     */
    public onUnitDamaged(unit: CardSprite) {
        this.equippedArtifacts.forEach((equipped, artifactId) => {
            if (equipped.target === unit) {
                const { artifact } = equipped;
                const artifactData = artifact.getCardData();

                // 触发 onDamaged 效果
                if (artifactData.effects) {
                    artifactData.effects.forEach(effect => {
                        if (effect.timing === 'onDamaged') {
                            // TODO: 实现效果系统
                            console.log(`触发法器效果: ${effect.text}`);
                        }
                    });
                }
            }
        });
    }

    /**
     * 获取单位装备的法器列表
     */
    public getEquippedArtifacts(unit: CardSprite): ArtifactSprite[] {
        const artifacts: ArtifactSprite[] = [];
        this.equippedArtifacts.forEach(equipped => {
            if (equipped.target === unit) {
                artifacts.push(equipped.artifact);
            }
        });
        return artifacts;
    }

    /**
     * 视觉附着效果（使用父子结构实现实时跟随）
     */
    private attachArtifactVisual(artifact: ArtifactSprite, target: CardSprite) {
        // 禁用拖拽
        artifact.disableDragging();
        
        // 记录法器当前在世界坐标系中的位置
        const worldX = artifact.x;
        const worldY = artifact.y;
        
        // 将法器添加为单位的子对象，这样移动时会自动跟随
        target.add(artifact);
        
        // 将世界坐标转换为相对于父对象的局部坐标
        // 法器现在是单位的子对象，所以坐标是相对于单位的
        const localX = worldX - target.x;
        const localY = worldY - target.y;
        
        // 先设置为当前位置（避免跳变）
        artifact.setPosition(localX, localY);
        
        // 目标相对位置（右上方偏移）
        const targetX = 80;
        const targetY = -60;
        
        // 使用动画从当前位置移动到目标位置并缩放
        this.scene.tweens.add({
            targets: artifact,
            x: targetX,
            y: targetY,
            scale: 0.3,
            duration: 300,
            ease: 'Power2'
        });
    }

    /**
     * 清理所有装备
     */
    public cleanup() {
        this.equippedArtifacts.forEach(equipped => {
            equipped.artifact.destroy();
        });
        this.equippedArtifacts.clear();
    }
}
