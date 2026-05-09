import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        const { width, height } = this.scale;

        this.background = this.add.image(width / 2, height / 2, 'background');
        this.background.setDisplaySize(width, height);

        this.logo = this.add.image(width / 2, height * 0.28, 'logo').setDepth(100);

        this.title = this.add.text(width / 2, height * 0.44, '主菜单', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        this.add.text(width / 2, height * 0.5, '选择一个入口开始游玩', {
            fontFamily: 'Arial',
            fontSize: 22,
            color: '#dbeafe',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        this.createMenuButton({
            x: width / 2,
            y: height * 0.6,
            width: 360,
            height: 72,
            label: '进入大地图',
            description: '选择青云镇、青云宗山门、集市茶棚或青云外山试炼',
            onClick: () => this.startWorldMapScene()
        });

        EventBus.emit('current-scene-ready', this);
    }
    
    changeScene ()
    {
        this.startWorldMapScene();
    }

    private startWorldMapScene ()
    {
        if (this.logoTween)
        {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('WorldMapScene');
    }

    private createMenuButton (config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        description: string;
        onClick: () => void;
    })
    {
        const button = this.add.rectangle(config.x, config.y, config.width, config.height, 0x1d4ed8, 0.92);
        button.setStrokeStyle(3, 0xffffff, 0.86);
        button.setInteractive({ useHandCursor: true });
        button.setDepth(100);
        button.on('pointerover', () => button.setFillStyle(0x2563eb, 1));
        button.on('pointerout', () => button.setFillStyle(0x1d4ed8, 0.92));
        button.on('pointerdown', config.onClick);

        this.add.text(config.x, config.y - 12, config.label, {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#f8fafc',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(101);

        this.add.text(config.x, config.y + 18, config.description, {
            fontFamily: 'Arial',
            fontSize: 16,
            color: '#bfdbfe'
        }).setOrigin(0.5).setDepth(101);
    }

    moveLogo (vueCallback: ({ x, y }: { x: number, y: number }) => void)
    {
        if (this.logoTween)
        {
            if (this.logoTween.isPlaying())
            {
                this.logoTween.pause();
            }
            else
            {
                this.logoTween.play();
            }
        } 
        else
        {
            this.logoTween = this.tweens.add({
                targets: this.logo,
                x: { value: 750, duration: 3000, ease: 'Back.easeInOut' },
                y: { value: 80, duration: 1500, ease: 'Sine.easeOut' },
                yoyo: true,
                repeat: -1,
                onUpdate: () => {
                    if (vueCallback)
                    {
                        vueCallback({
                            x: Math.floor(this.logo.x),
                            y: Math.floor(this.logo.y)
                        });
                    }
                }
            });
        }
    }
}
