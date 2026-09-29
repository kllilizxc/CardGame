/** Browser-only manual smoke fixture. Not imported by the shipped game. */
import type { Game, Scene } from 'phaser';
import { ensureWenxinArt } from '../../src/game/art/wenxin/WenxinArt';
import { WenxinBattleStage } from '../../src/game/art/wenxin/WenxinBattleStage';
import { CardSprite } from '../../src/game/objects/CardSprite';
import { BattleAnimationManager } from '../../src/game/managers/battle/BattleAnimationManager';
import unitData from '../../public/data/cards/units.json';
import type { UnitCard } from '../../public/data/types/cards/unit';

export interface SmokeScene extends Scene {
    stage: WenxinBattleStage;
    me: CardSprite[];
    foe: CardSprite[];
    animations: BattleAnimationManager;
    impacts: string[];
}
export function mountWenxinSmoke(game: Game): Promise<SmokeScene> {
    return new Promise(resolve => {
        game.scene.add('WenxinSmoke', {
            async create(this: SmokeScene) {
                await ensureWenxinArt(this);
                this.stage = new WenxinBattleStage(this);
                const make = (id: string) => new CardSprite(this, 0, 0, structuredClone(unitData.units.find(card => card.id === id)) as UnitCard);
                this.me = ['CR_001', 'CR_003', 'CR_009'].map(make);
                this.foe = ['SX_JXTM_001', 'CR_007', 'CR_005'].map(make);
                this.stage.arrange(this.me, 'me'); this.stage.arrange(this.foe, 'foe');
                this.animations = new BattleAnimationManager(this); this.impacts = [];
                this.add.text(960, 48, '六类角色 · 实机演出验收', { fontSize: '26px', color: '#eee4d3', stroke: '#20282e', strokeThickness: 5 }).setOrigin(.5).setDepth(200);
                resolve(this);
            },
        }, true);
    });
}
