import Phaser from 'phaser';
import type { UnitCard } from '../../public/data/types/cards/unit';
import { BaseCardSprite } from '../../src/game/objects/BaseCardSprite';
import { getRealmConfig, getUnitStar } from '../../src/game/utils/RealmHelper';
import { sceneTheme } from '../../src/game/scenes/shared/sceneTheme';

export interface CardFaceDraft {
    name: string;
    attack: number;
    health: number;
    rules: string;
    flavor: string;
    zoom: number;
    focus: number;
}

const FONT = '"KaiTi", "STKaiti", "Noto Serif SC", serif';
const UI_FONT = sceneTheme.fonts.ui;
const measure = document.createElement('canvas').getContext('2d')!;

function wrapped(text: string, size: number, width: number): string[] {
    measure.font = `${size}px ${FONT}`;
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const character of paragraph) {
            if (line && measure.measureText(line + character).width > width) {
                const keepPair = /[，。！？、；：）》」』】]/u.test(character) || /[（《「『【]$/u.test(line);
                const carry = keepPair ? line.slice(-1) : '';
                lines.push(keepPair ? line.slice(0, -1) : line);
                line = carry + character;
            } else line += character;
        }
        lines.push(line);
    }
    return lines;
}

/** Experimental face using the game's real card container, identity and realm helpers. */
export class IllustratedUnitCard extends BaseCardSprite {
    readonly diagnostics: string[] = [];
    private readonly cardData: UnitCard;

    constructor(scene: Phaser.Scene, x: number, y: number, source: UnitCard, draft: CardFaceDraft, scale = 3) {
        super(scene, x, y, scale);
        this.cardData = { ...source, name: draft.name, attack: draft.attack, health: draft.health };
        this.drawFace(draft);
        this.setupInteractivity();
        this.disableDragging();
        this.setPreviewMetadata({ contextId: 'card-prototype', sourceLabel: '卡面试作' });
    }

    getCardData(): UnitCard { return this.cardData; }
    protected getDefaultStrokeColor(): number { return sceneTheme.colors.gold; }
    protected updateDisplayMode(): void { /* One full-face proof; production display modes remain unchanged. */ }

    private text(x: number, y: number, value: string, size: number, color: string, options: Phaser.Types.GameObjects.Text.TextStyle = {}, originX = .5, originY = .5) {
        const text = this.scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, resolution: 4, padding: { x: 1, y: 1 }, ...options });
        text.setOrigin(originX, originY);
        this.add(text);
        return text;
    }

    private drawFace(draft: CardFaceDraft): void {
        const g = this.scene.add.graphics();
        this.add(g);
        g.fillStyle(0x152c27).fillRoundedRect(-90, -130, 180, 260, 7);
        g.lineStyle(1.5, 0xc3a977).strokeRoundedRect(-88, -128, 176, 256, 6);
        g.lineStyle(.4, 0x638b77).strokeRoundedRect(-85, -125, 170, 250, 4);
        g.fillStyle(0xeee6ce).fillRect(-82, 49, 164, 63);

        const raw = this.scene.textures.get('spirit-fox').getSourceImage() as HTMLImageElement;
        const artWidth = 656;
        const artHeight = 600;
        const texture = this.scene.textures.get('proof-art') as Phaser.Textures.CanvasTexture;
        const ratio = Math.max(artWidth / raw.width, artHeight / raw.height) * draft.zoom;
        const cropWidth = artWidth / ratio;
        const cropHeight = artHeight / ratio;
        texture.context.clearRect(0, 0, artWidth, artHeight);
        texture.context.imageSmoothingEnabled = false;
        texture.context.drawImage(raw, (raw.width - cropWidth) / 2, (raw.height - cropHeight) * draft.focus, cropWidth, cropHeight, 0, 0, artWidth, artHeight);
        texture.refresh();
        const art = this.scene.add.image(-82, -98, 'proof-art').setOrigin(0).setDisplaySize(164, 150);
        this.add(art);

        const frame = this.scene.add.graphics();
        this.add(frame);
        frame.lineStyle(.8, 0xc5ad7b).strokeRect(-82.5, -98.5, 165, 151);
        frame.fillStyle(0x193c30).fillRect(-82, -98, 164, 1.5);
        frame.fillStyle(0x193c30).fillRect(-82, 49, 164, 12);
        frame.lineStyle(.45, 0xbaaa75).lineBetween(-82, 61, 82, 61);
        for (const direction of [-1, 1]) {
            for (const vertical of [-1, 1]) {
                const cx = direction * 82;
                const cy = vertical === -1 ? -121 : 121;
                frame.lineStyle(.75, 0xd0b884).beginPath();
                frame.moveTo(cx - direction * 8, cy);
                frame.lineTo(cx, cy);
                frame.lineTo(cx, cy - vertical * 8);
                frame.strokePath();
            }
        }
        frame.lineStyle(.35, 0x7f704e, .4).lineBetween(-70, 97, 70, 97);

        this.background = this.scene.add.rectangle(0, 0, 178, 258, 0, 0);
        this.add(this.background);
        this.nameText = this.text(0, -113, draft.name, 15.5, '#eee3bd', { fontStyle: 'bold', letterSpacing: 1 });
        if (this.nameText.width > 149) this.diagnostics.push('名称超出标题区，请缩短名称');
        const realm = getRealmConfig(this.cardData.realmId);
        const stars = '★'.repeat(getUnitStar(this.cardData));
        this.text(-74, 55, `${this.cardData.linggen?.join('·') || '无'}灵 · ${this.cardData.race}`, 7.2, '#e0dcc1', {}, 0);
        this.text(74, 55, `${realm?.stage ?? ''}${realm?.phase ?? ''} ${stars}`, 6.4, '#d8cba5', {}, 1);

        const lines = wrapped(draft.rules, 8.2, 143);
        if (lines.length > 3) this.diagnostics.push(`效果文案需要 ${lines.length} 行，当前模板最多 3 行`);
        this.text(-72, 67, lines.slice(0, 3).join('\n'), 8.2, '#2f3829', { lineSpacing: 1.7 }, 0, 0);
        const flavor = wrapped(draft.flavor, 6.1, 143);
        if (flavor.length > 1) this.diagnostics.push('风味短句超出一行');
        this.text(0, 103, flavor[0], 6.1, '#6a7059');

        this.stat(-57, draft.attack, '攻击', 0x553426, '#f3cd9b');
        this.stat(57, draft.health, '生命', 0x254936, '#d7e6b4');
        this.text(0, 116, '普通 · 青云宗', 6.5, '#b9c3a3');
        this.text(0, 123, this.cardData.id, 4.8, '#839b84', { fontFamily: UI_FONT, letterSpacing: .65 });
    }

    private stat(x: number, value: number, label: string, fill: number, color: string): void {
        const graphics = this.scene.add.graphics();
        graphics.fillStyle(fill).fillRoundedRect(x - 20, 109, 40, 15, 3);
        graphics.lineStyle(.6, 0xc2ad7c).strokeRoundedRect(x - 20, 109, 40, 15, 3);
        this.add(graphics);
        this.text(x - 9, 116.5, label, 5.8, '#d6d0b6');
        this.text(x + 9, 116.4, String(value), 12, color, { fontFamily: 'Georgia, serif', fontStyle: 'bold' });
    }
}
