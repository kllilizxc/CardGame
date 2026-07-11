import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';
import {
    createSceneBackdrop,
    createSceneButton,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from './shared/sceneTheme';

export class MainMenu extends Scene {
    background!: GameObjects.Rectangle;
    logo!: GameObjects.Container;
    title!: GameObjects.Text;
    logoTween: Phaser.Tweens.Tween | null = null;

    constructor() {
        super('MainMenu');
    }

    create() {
        const { width, height } = this.scale;
        const backdropObjects = createSceneBackdrop(this);
        this.background = backdropObjects[0] as GameObjects.Rectangle;

        this.logo = this.createFloatingSeal(width / 2, height * 0.23);
        this.title = this.add.text(width / 2, height * 0.34, '青云问道', getSceneTextStyle('sceneTitle', {
            fontSize: '60px',
        })).setOrigin(0.5);

        this.add.text(width / 2, height * 0.395, '山麓初启，收好卡匣，择一条路迈入仙门。', getSceneTextStyle('sceneSubtitle')).setOrigin(0.5);

        const panelWidth = 760;
        const panelHeight = 350;
        const panelX = width / 2;
        const panelY = height * 0.64;
        const panelTop = panelY - panelHeight / 2;

        createScenePanel(this, {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
        });

        this.add.text(panelX, panelTop + 54, '山门第一程', getSceneTextStyle('panelTitle')).setOrigin(0.5);
        this.add.text(
            panelX,
            panelTop + 116,
            '城镇、宗门山门与试炼入口都已在青云山麓铺开。先入大地图，再决定去何处落脚、听闻或闯关。',
            getSceneTextStyle('body', {
                align: 'center',
                wordWrap: { width: panelWidth - 140 },
            }),
        ).setOrigin(0.5, 0);

        createStatusLine(this, {
            x: panelX,
            y: panelTop + 220,
            width: panelWidth - 140,
            text: '当前开放：青云镇、青云宗山门、集市茶棚，以及两处试炼入口。',
            align: 'center',
        });

        createSceneButton(this, {
            x: panelX,
            y: panelTop + 292,
            width: 430,
            height: 88,
            label: '进入大地图',
            description: '前往青云山麓，选择城镇、山门或秘境入口',
            onClick: () => this.startWorldMapScene(),
        });

        EventBus.emit('current-scene-ready', this);
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
