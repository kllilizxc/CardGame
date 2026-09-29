import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';
import { createBackdrop, type Backdrop } from '../art/backdrop';
import { C, FONT, T } from '../art/palette';
import { pxBurst } from '../art/fx';
import { isPortraitGameViewport } from '../layout/gameViewport';
import {
    createSceneButton,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from './shared/sceneTheme';

export class MainMenu extends Scene {
    background: Backdrop | null = null;
    logo!: GameObjects.Container;
    title!: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super('MainMenu');
    }

    create() {
        const { width, height } = this.scale;
        if (isPortraitGameViewport(width, height)) {
            this.createPortraitMenu();
            EventBus.emit('current-scene-ready', this);
            return;
        }
        this.cameras.main.setBackgroundColor(C.void);
        this.background = createBackdrop(this, 'mountain', 'night');
        this.events.once('shutdown', () => { this.background?.destroy(); this.background = null; });

        this.logo = this.createFloatingSeal(width / 2, height * 0.2);
        this.title = this.add.text(width / 2, height * 0.4, '青云问道', getSceneTextStyle('sceneTitle', {
            fontSize: '72px',
        })).setOrigin(0.5);

        this.add.text(width / 2, height * 0.48, '山麓初启，收好卡匣，择一条路迈入仙门。', getSceneTextStyle('sceneSubtitle')).setOrigin(0.5);

        const buttonY = height * 0.64;
        createSceneButton(this, {
            x: width / 2,
            y: buttonY,
            width: 440,
            height: 96,
            label: '进入大地图',
            onClick: () => this.startWorldMapScene(),
        });
        this.add.text(width / 2, buttonY + 78, '前往青云山麓，选择城镇、山门或秘境入口', {
            fontFamily: FONT, fontSize: '12px', color: T.dim,
        }).setOrigin(0.5);
        this.add.text(width / 2, buttonY + 106, '山门第一程 · 当前开放：青云镇、青云宗山门、集市茶棚，以及两处试炼入口。', {
            fontFamily: FONT, fontSize: '12px', color: T.dim,
        }).setOrigin(0.5);

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

    private createPortraitMenu(): void {
        const { width } = this.scale;
        this.cameras.main.setBackgroundColor(C.void);
        this.background = createBackdrop(this, 'mountain', 'night');
        this.events.once('shutdown', () => { this.background?.destroy(); this.background = null; });
        this.logo = this.createFloatingSeal(width / 2, 132);
        this.title = this.add.text(width / 2, 274, '青云问道', getSceneTextStyle('sceneTitle', {
            fontSize: '52px',
        })).setOrigin(0.5);
        this.add.text(width / 2, 334, '山麓初启，择一条路迈入仙门。', getSceneTextStyle('sceneSubtitle', {
            fontSize: '20px', align: 'center', wordWrap: { width: width - 64 },
        })).setOrigin(0.5);

        const panelWidth = width - 40;
        const panelTop = 380;
        createScenePanel(this, { x: width / 2, y: 622, width: panelWidth, height: 484 });
        this.add.text(width / 2, panelTop + 50, '山门第一程', getSceneTextStyle('panelTitle', {
            fontSize: '31px',
        })).setOrigin(0.5);
        this.add.text(width / 2, panelTop + 117,
            '城镇、宗门山门与试炼入口都已在青云山麓铺开。先入大地图，再决定去何处落脚、听闻或闯关。',
            getSceneTextStyle('body', { fontSize: '21px', align: 'center',
                wordWrap: { width: panelWidth - 62 } }),
        ).setOrigin(0.5, 0);
        createStatusLine(this, { x: width / 2, y: 665, width: panelWidth - 42,
            text: '当前开放：青云镇、青云宗山门、集市茶棚及试炼入口。', align: 'center' });
        createSceneButton(this, { x: width / 2, y: 792, width: panelWidth - 56, height: 86,
            label: '进入大地图', description: '选择城镇、山门或秘境入口',
            onClick: () => this.startWorldMapScene() });
    }

    changeScene() {
        this.startWorldMapScene();
    }

    private startWorldMapScene() {
        if (this.logoTween) {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('WorldMapScene');
    }

    private createFloatingSeal(x: number, y: number): GameObjects.Container {
        const seal = this.add.container(x, y);
        if (this.textures.exists('wenxin:casket')) {
            seal.add(this.add.image(0, -12, 'wenxin:casket').setDisplaySize(220, 220));
            this.logoTween = this.tweens.add({ targets: seal, y: y - 8, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            return seal;
        }
        const outerGlow = this.add.circle(0, 0, 90, sceneTheme.colors.jade, 0.16);
        const outerRing = this.add.circle(0, 0, 64, sceneTheme.colors.ink, 0.88);
        outerRing.setStrokeStyle(4, sceneTheme.colors.gold, 0.72);
        const innerRing = this.add.circle(0, 0, 46, sceneTheme.colors.panelInner, 0.96);
        innerRing.setStrokeStyle(2, sceneTheme.colors.jadeBright, 0.4);
        const sigil = this.add.text(0, -2, '云', {
            fontFamily: sceneTheme.fonts.display,
            fontSize: '46px',
            color: '#f3ead3',
            stroke: '#140f0a',
            strokeThickness: 4,
        }).setOrigin(0.5);
        const caption = this.add.text(0, 72, '问道山麓', {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: '#d9c6a2',
            letterSpacing: 1.4,
        }).setOrigin(0.5);

        seal.add([outerGlow, outerRing, innerRing, sigil, caption]);

        return seal;
    }

    moveLogo(vueCallback: ({ x, y }: { x: number, y: number }) => void) {
        if (this.logoTween) {
            if (this.logoTween.isPlaying()) {
                this.logoTween.pause();
            } else {
                this.logoTween.play();
            }
        } else {
            this.logoTween = this.tweens.add({
                targets: this.logo,
                x: { value: this.scale.width * 0.68, duration: 3000, ease: 'Sine.easeInOut' },
                y: { value: this.scale.height * 0.17, duration: 1600, ease: 'Sine.easeOut' },
                yoyo: true,
                repeat: -1,
                onUpdate: () => {
                    if (vueCallback) {
                        vueCallback({
                            x: Math.floor(this.logo.x),
                            y: Math.floor(this.logo.y),
                        });
                    }
                },
            });
        }
    }
}
