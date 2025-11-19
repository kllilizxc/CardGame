import { Scene } from 'phaser';

export class TurnManager {
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    // 显示回合切换动画
    public showTurnAnimation(text: string, color: number, onComplete: () => void): void {
        const { width, height } = this.scene.scale;
        const fontSize = Math.floor(height * 0.08) + 'px';

        // 创建遮罩
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
        overlay.setDepth(2500);
        overlay.setAlpha(0);

        // 创建文字
        const turnText = this.scene.add.text(width / 2, height / 2, text, {
            fontSize: fontSize,
            color: '#' + color.toString(16).padStart(6, '0'),
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5);
        turnText.setDepth(2501);
        turnText.setScale(0);

        // 动画序列
        this.scene.tweens.add({
            targets: overlay,
            alpha: 1,
            duration: 200,
            ease: 'Power2'
        });

        this.scene.tweens.add({
            targets: turnText,
            scale: 1.2,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                // 停留一会儿
                this.scene.time.delayedCall(600, () => {
                    // 淡出
                    this.scene.tweens.add({
                        targets: [overlay, turnText],
                        alpha: 0,
                        duration: 300,
                        ease: 'Power2',
                        onComplete: () => {
                            overlay.destroy();
                            turnText.destroy();
                            onComplete();
                        }
                    });
                });
            }
        });
    }

    // 显示胜利画面
    public showVictory(onRestart: () => void): void {
        const { width, height } = this.scene.scale;
        
        // 半透明遮罩
        this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(1999);
        
        this.scene.add.text(width / 2, height / 2, '胜利！', {
            fontSize: '64px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(2000);

        this.scene.add.text(width / 2, height / 2 + 80, '点击任意位置重新开始', {
            fontSize: '20px',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(2000);

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
}
