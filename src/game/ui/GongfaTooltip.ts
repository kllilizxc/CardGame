import type { Scene } from 'phaser';

/**
 * 功法悬浮提示框
 * 用于在 hover 功法名时显示功法详细描述
 */
export class GongfaTooltip {
    private scene: Scene;
    private container: Phaser.GameObjects.Container | null = null;
    private background: Phaser.GameObjects.Rectangle | null = null;
    private nameText: Phaser.GameObjects.Text | null = null;
    private descriptionText: Phaser.GameObjects.Text | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * 显示功法提示框
     * @param x 提示框 x 坐标
     * @param y 提示框 y 坐标
     * @param gongfaName 功法名称
     * @param gongfaDescription 功法描述
     */
    public show(x: number, y: number, gongfaName: string, gongfaDescription: string): void {
        this.hide();

        const { width, height } = this.scene.scale;
        const maxWidth = width * 0.3;
        const padding = 12;
        const fontSize = Math.floor(height * 0.014);
        const titleFontSize = Math.floor(height * 0.016);

        // 创建容器
        this.container = this.scene.add.container(0, 0);
        this.container.setDepth(10000);

        // 创建功法名文本（用于测量宽度）
        this.nameText = this.scene.add.text(0, 0, gongfaName, {
            fontSize: `${titleFontSize}px`,
            color: '#ffd700',
            fontStyle: 'bold',
            wordWrap: { width: maxWidth - padding * 2 }
        });

        // 创建描述文本
        this.descriptionText = this.scene.add.text(0, 0, gongfaDescription, {
            fontSize: `${fontSize}px`,
            color: '#ecf0f1',
            wordWrap: { width: maxWidth - padding * 2 }
        });

        // 计算实际需要的宽高
        const nameHeight = this.nameText.height;
        const descHeight = this.descriptionText.height;
        const totalHeight = nameHeight + descHeight + padding * 3;
        const totalWidth = Math.max(this.nameText.width, this.descriptionText.width) + padding * 2;

        // 创建背景
        this.background = this.scene.add.rectangle(0, 0, totalWidth, totalHeight, 0x2c3e50, 0.95);
        this.background.setStrokeStyle(2, 0xffd700);
        this.background.setOrigin(0, 0);

        // 定位文本
        this.nameText.setPosition(padding, padding);
        this.descriptionText.setPosition(padding, padding * 2 + nameHeight);

        // 添加到容器
        this.container.add([this.background, this.nameText, this.descriptionText]);

        // 调整位置，确保不超出屏幕
        let finalX = x;
        let finalY = y;

        // 右侧超出检测
        if (finalX + totalWidth > width) {
            finalX = width - totalWidth - 10;
        }
        // 左侧超出检测
        if (finalX < 10) {
            finalX = 10;
        }
        // 下方超出检测
        if (finalY + totalHeight > height) {
            finalY = y - totalHeight - 10;
        }
        // 上方超出检测
        if (finalY < 10) {
            finalY = 10;
        }

        this.container.setPosition(finalX, finalY);
    }

    /**
     * 隐藏功法提示框
     */
    public hide(): void {
        if (this.container) {
            this.container.destroy();
            this.container = null;
        }
        this.background = null;
        this.nameText = null;
        this.descriptionText = null;
    }

    /**
     * 销毁功法提示框
     */
    public destroy(): void {
        this.hide();
    }
}
