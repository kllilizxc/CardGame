import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';
import { createBackdrop, Backdrop } from '../art/backdrop';
import { C, FONT, T } from '../art/palette';
import { pixelButton, pixelPanel, PANEL_BLOOD, PANEL_INK } from '../art/ui';
import { pxBurst } from '../art/fx';

export class MainMenu extends Scene
{
    background: Backdrop | null = null;
    logo: GameObjects.Container;
    title: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(C.void);

        this.background = createBackdrop(this, 'mountain', 'night');
        this.events.once('shutdown', () => { this.background?.destroy(); this.background = null; });

        // ---- title: extruded pixel calligraphy with a cinnabar seal ----
        this.logo = this.add.container(width / 2, height * 0.27).setDepth(100);
        const layers = 8;
        for (let i = layers; i >= 1; i--) {
            this.logo.add(this.add.text(i * 2, i * 2, '青云', {
                fontFamily: FONT, fontSize: '180px', color: i > 5 ? '#0b0714' : '#7a1d2e',
            }).setOrigin(0.5));
        }
        const face = this.add.text(0, 0, '青云', {
            fontFamily: FONT, fontSize: '180px', color: T.gold, stroke: T.void, strokeThickness: 8,
        }).setOrigin(0.5);
        this.logo.add(face);
        const shine = this.add.text(-4, -6, '青云', {
            fontFamily: FONT, fontSize: '180px', color: T.glow,
        }).setOrigin(0.5).setAlpha(0.0);
        this.logo.add(shine);
        this.tweens.add({ targets: this.logo, y: this.logo.y - 12, duration: 1800, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [4] });
        this.tweens.add({ targets: shine, alpha: 0.9, duration: 90, yoyo: true, hold: 1, repeat: -1, repeatDelay: 2600 });

        this.title = this.add.text(width / 2, height * 0.27 + 150, 'INK  &  EMBER', {
            fontFamily: FONT, fontSize: '24px', color: T.petal, stroke: T.void, strokeThickness: 6,
        }).setOrigin(0.5).setDepth(100);
        this.title.setLetterSpacing(8);

        // seal stamp
        const seal = this.add.container(width / 2 + 330, height * 0.27 - 80).setDepth(101).setAngle(-8);
        seal.add(this.add.rectangle(0, 0, 76, 76, C.cinnabar).setStrokeStyle(4, C.blood));
        seal.add(this.add.text(0, 0, '卡\n牌', { fontFamily: FONT, fontSize: '24px', color: '#f4ecd8', align: 'center', lineSpacing: -2 }).setOrigin(0.5));

        // ---- menu ----
        pixelPanel(this, width / 2, height * 0.66, 620, 260, { ...PANEL_INK, alpha: 0.86 }).setDepth(99);
        this.add.text(width / 2, height * 0.66 - 96, '选择一个入口开始游玩', {
            fontFamily: FONT, fontSize: '24px', color: T.dim, stroke: T.void, strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100);

        this.createMenuButton({
            x: width / 2,
            y: height * 0.66 + 10,
            width: 520,
            height: 108,
            label: '进入大地图',
            description: '选择青云镇、青云宗山门、集市茶棚或青云外山试炼',
            onClick: () => this.startWorldMapScene()
        });

        this.add.text(width / 2, height - 36, '点击 · 拖拽卡牌 · 悬停查看详情', {
            fontFamily: FONT, fontSize: '12px', color: T.dim,
        }).setOrigin(0.5).setDepth(100);

        // ambient sparks around the title
        this.time.addEvent({
            delay: 700, loop: true,
            callback: () => pxBurst(this, width / 2 + (Math.random() - 0.5) * 520, height * 0.27 + 40, {
                colors: [C.gold, C.glow, C.ember], count: 3, speed: 60, size: 6, gravity: -40, life: 900, depth: 102,
            }),
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
        return pixelButton(this, {
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            label: config.label,
            sub: config.description,
            labelSize: 36,
            style: PANEL_BLOOD,
            depth: 100,
            onClick: config.onClick,
        });
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
