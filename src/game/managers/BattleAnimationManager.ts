import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';

export class BattleAnimationManager {
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    // 单位攻击单位动画
    public addAttackAnimation(
        attacker: CardSprite,
        target: CardSprite,
        damage: number,
        delay: number,
        onDamage: (target: CardSprite, damage: number) => void
    ): void {
        const originalX = attacker.x;
        const originalY = attacker.y;
        const targetX = target.x;
        const targetY = target.y;

        // 计算攻击方向
        const dirX = targetX - originalX;
        const dirY = targetY - originalY;
        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        const normalizedX = dirX / distance;
        const normalizedY = dirY / distance;

        // 后退距离
        const retreatDist = 30;
        const rushDist = distance * 0.7; // 冲刺到目标70%的距离

        this.scene.time.delayedCall(delay, () => {
            // 获取卡牌基础缩放
            const baseScale = attacker.scale;

            // 第1步：后退蓄力
            this.scene.tweens.add({
                targets: attacker,
                x: originalX - normalizedX * retreatDist,
                y: originalY - normalizedY * retreatDist,
                scale: baseScale * 1.15,
                duration: 150,
                ease: 'Back.easeIn',
                onComplete: () => {
                    // 第2步：冲向目标
                    this.scene.tweens.add({
                        targets: attacker,
                        x: originalX + normalizedX * rushDist,
                        y: originalY + normalizedY * rushDist,
                        scale: baseScale * 1.2,
                        duration: 200,
                        ease: 'Power2',
                        onComplete: () => {
                            // 造成伤害
                            onDamage(target, damage);
                            
                            // 目标受击动画
                            this.playHitAnimation(target);

                            // 第3步：返回原位
                            this.scene.tweens.add({
                                targets: attacker,
                                x: originalX,
                                y: originalY,
                                scale: baseScale,
                                duration: 250,
                                ease: 'Back.easeOut'
                            });
                        }
                    });
                }
            });
        });
    }

    // 单位攻击玩家动画
    public addAttackPlayerAnimation(
        attacker: CardSprite,
        damage: number,
        delay: number,
        onDamage: (damage: number) => void
    ): void {
        const originalX = attacker.x;
        const originalY = attacker.y;
        const { width, height } = this.scene.scale;
        
        // 目标位置（屏幕下方中央）
        const targetX = width / 2;
        const targetY = height * 0.95;

        // 计算方向
        const dirX = targetX - originalX;
        const dirY = targetY - originalY;
        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        const normalizedX = dirX / distance;
        const normalizedY = dirY / distance;

        const retreatDist = 30;
        const rushDist = distance * 0.5;

        this.scene.time.delayedCall(delay, () => {
            const baseScale = attacker.scale;

            // 后退蓄力
            this.scene.tweens.add({
                targets: attacker,
                x: originalX - normalizedX * retreatDist,
                y: originalY - normalizedY * retreatDist,
                scale: baseScale * 1.15,
                duration: 150,
                ease: 'Back.easeIn',
                onComplete: () => {
                    // 冲向玩家
                    this.scene.tweens.add({
                        targets: attacker,
                        x: originalX + normalizedX * rushDist,
                        y: originalY + normalizedY * rushDist,
                        scale: baseScale * 1.2,
                        duration: 200,
                        ease: 'Power2',
                        onComplete: () => {
                            // 造成伤害并播放受击效果
                            onDamage(damage);
                            this.playPlayerHitEffect(damage);

                            // 返回原位
                            this.scene.tweens.add({
                                targets: attacker,
                                x: originalX,
                                y: originalY,
                                scale: baseScale,
                                duration: 250,
                                ease: 'Back.easeOut'
                            });
                        }
                    });
                }
            });
        });
    }

    // 受击动画
    public playHitAnimation(target: CardSprite): void {
        const originalX = target.x;
        
        this.scene.tweens.add({
            targets: target,
            x: originalX + 10,
            duration: 50,
            yoyo: true,
            repeat: 2,
            ease: 'Power2'
        });
    }

    // 死亡动画
    public playDeathAnimation(target: CardSprite): void {
        const baseScale = target.scale;
        this.scene.tweens.add({
            targets: target,
            alpha: 0,
            scale: baseScale * 0.8,
            angle: 15,
            duration: 300,
            ease: 'Power2.easeIn'
        });
    }

    // 玩家受击效果
    public playPlayerHitEffect(damage: number): void {
        const { width, height } = this.scene.scale;

        // 屏幕震动
        this.scene.cameras.main.shake(300, 0.02);

        // 红色闪光效果
        const flash = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xff0000, 0.3);
        flash.setDepth(2400);
        
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 300,
            onComplete: () => flash.destroy()
        });

        // 伤害数字
        const damageText = this.scene.add.text(width / 2, height * 0.5, `-${damage}`, {
            fontSize: Math.floor(height * 0.06) + 'px',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);
        damageText.setDepth(2401);

        this.scene.tweens.add({
            targets: damageText,
            y: height * 0.4,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => damageText.destroy()
        });
    }
}
