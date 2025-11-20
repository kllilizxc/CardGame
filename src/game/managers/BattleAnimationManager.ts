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

    public playSummonAnimation(card: CardSprite, star: number): void {
        if (!card.active || star < 5) {
            return;
        }

        const scene = this.scene;
        const intensity = star >= 8 ? 2 : 1;
        const baseScale = (card as any).getCardBaseScale ? (card as any).getCardBaseScale() : card.scale;
        const originalDepth = card.depth ?? 0;
        const originalPos = (card as any).getOriginalPosition ? (card as any).getOriginalPosition() : null;
        const finalX = originalPos ? originalPos.x : card.x;
        const finalY = originalPos ? originalPos.y : card.y;
        const dropHeight = 250 * intensity;

        let glow: Phaser.GameObjects.Graphics | null = null;
        const particles: Phaser.GameObjects.Graphics[] = [];

        const cleanup = () => {
            if (!card.active) {
                return;
            }
            card.setAngle(0);
            card.setPosition(finalX, finalY);
            card.setScale(baseScale);
            card.setAlpha(1);
            card.setDepth(originalDepth);
            if (card.input) {
                (card.input as any).draggable = false;
            }
            if (glow) {
                glow.destroy();
                glow = null;
            }
            particles.splice(0).forEach(p => p.destroy());
        };

        try {
            scene.tweens.killTweensOf(card);

            card.setPosition(finalX, finalY - dropHeight);
            card.setAlpha(0);
            card.setScale(baseScale * 0.8);
            card.setDepth(5000);

            glow = scene.add.graphics();
            glow.fillStyle(star >= 8 ? 0xffd700 : 0x9b59b6, 0.6);
            glow.fillCircle(0, 0, 150 * intensity);
            glow.setPosition(finalX, finalY);
            glow.setAlpha(0);
            glow.setDepth(4998);

            for (let i = 0; i < 20 * intensity; i++) {
                const particle = scene.add.graphics();
                const color = star >= 8 ? 0xffd700 : 0x9b59b6;
                particle.fillStyle(color, 1);
                particle.fillCircle(0, 0, 3);
                particle.setPosition(finalX, finalY);
                particle.setDepth(4999);
                particles.push(particle);
            }

            this.shakeCamera(intensity);

            scene.tweens.add({
                targets: glow,
                alpha: 0.8,
                scale: 1.5,
                duration: 300 * intensity,
                ease: 'Cubic.easeOut'
            });

            particles.forEach((particle, index) => {
                const angle = (Math.PI * 2 * index) / particles.length;
                const distance = 100 * intensity;
                scene.tweens.add({
                    targets: particle,
                    x: finalX + Math.cos(angle) * distance,
                    y: finalY + Math.sin(angle) * distance,
                    alpha: 0,
                    duration: 600 * intensity,
                    ease: 'Cubic.easeOut',
                    onComplete: () => particle.destroy()
                });
            });

            scene.tweens.add({
                targets: card,
                x: finalX,
                y: finalY,
                alpha: 1,
                scale: baseScale,
                duration: 400 * intensity,
                ease: 'Back.easeOut',
                onComplete: () => {
                    scene.tweens.add({
                        targets: card,
                        angle: -5 * intensity,
                        duration: 50,
                        yoyo: true,
                        repeat: 3 * intensity,
                        ease: 'Sine.easeInOut',
                        onComplete: cleanup
                    });
                },
                onStop: cleanup
            });
        } catch (error) {
            console.error('Summon animation error', error);
            cleanup();
        }
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
        
        // 震动效果
        this.scene.tweens.add({
            targets: target,
            x: originalX + 5,
            duration: 50,
            yoyo: true,
            repeat: 2,
            ease: 'Power2',
            onComplete: () => {
                target.x = originalX;
            }
        });
        
        // 红色闪烁效果
        this.scene.tweens.add({
            targets: target,
            alpha: 0.6,
            duration: 100,
            yoyo: true,
            repeat: 1
        });
        
        // 创建红色闪光特效
        const hitFlash = this.scene.add.circle(target.x, target.y, 50, 0xff0000, 0.5);
        hitFlash.setDepth(target.depth + 1);
        this.scene.tweens.add({
            targets: hitFlash,
            alpha: 0,
            scale: 1.5,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                hitFlash.destroy();
            }
        });
    }

    // 治疗动画
    public playHealAnimation(target: CardSprite): void {
        // 绿色闪烁效果
        this.scene.tweens.add({
            targets: target,
            alpha: { from: 1, to: 0.7 },
            duration: 100,
            yoyo: true,
            repeat: 2
        });
        
        // 创建绿色治疗光圈特效
        const healGlow = this.scene.add.circle(target.x, target.y, 40, 0x2ecc71, 0.6);
        healGlow.setDepth(target.depth + 1);
        this.scene.tweens.add({
            targets: healGlow,
            alpha: 0,
            scale: 1.8,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                healGlow.destroy();
            }
        });
        
        // 治疗粒子效果（向上飘散）
        for (let i = 0; i < 3; i++) {
            this.scene.time.delayedCall(i * 100, () => {
                const particle = this.scene.add.circle(
                    target.x + (Math.random() - 0.5) * 60,
                    target.y + 30,
                    3,
                    0x2ecc71,
                    0.8
                );
                particle.setDepth(target.depth + 2);
                this.scene.tweens.add({
                    targets: particle,
                    y: particle.y - 50,
                    alpha: 0,
                    duration: 600,
                    ease: 'Power1',
                    onComplete: () => {
                        particle.destroy();
                    }
                });
            });
        }
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

    private shakeCamera(intensity: number = 1): void {
        this.scene.cameras.main.shake(400 * intensity, 0.01 * intensity, true);
    }
}
