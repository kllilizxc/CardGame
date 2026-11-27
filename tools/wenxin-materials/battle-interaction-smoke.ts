/** Browser-only deterministic battle fixture. Import from Vite; never used by the shipped game. */
import type { Scene } from 'phaser';
import { CardSprite } from '../../src/game/objects/CardSprite';
import { ArtifactSprite } from '../../src/game/objects/ArtifactSprite';
import type { BaseCardSprite } from '../../src/game/objects/BaseCardSprite';
import type { CardManager } from '../../src/game/managers/battle/CardManager';
import type { ArtifactManager } from '../../src/game/managers/battle/ArtifactManager';
import type { BattleState } from '../../src/game/state/BattleState';
import unitData from '../../public/data/cards/units.json';
import artifacts from '../../public/data/cards/artifacts.json';
import type { UnitCard } from '../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../public/data/types/cards/artifact';

type SmokeBattle = Scene & {
    battleState: BattleState;
    hand: BaseCardSprite[];
    playerField: CardSprite[];
    enemyField: CardSprite[];
    cardManager: CardManager;
    artifactManager: ArtifactManager;
};

export function prepareBattleInteractionSmoke(scene: Scene, options: { unitIds?: string[]; enemyIds?: string[] } = {}) {
    const s = scene as SmokeBattle;
    s.artifactManager.cleanup();
    [...s.hand, ...s.playerField, ...s.enemyField].forEach(card => { card.stopMotion(); card.destroy(); });
    s.hand.splice(0); s.playerField.splice(0); s.enemyField.splice(0);
    s.battleState.deck.splice(0); s.battleState.discardPile.splice(0);
    s.battleState.isPlayerTurn = true;
    s.battleState.isProcessingTurn = false;
    s.battleState.playerHealth = 100;
    const makeUnit = (id: string) => new CardSprite(s, 0, 0, structuredClone(unitData.units.find(card => card.id === id)) as UnitCard);
    const foes = (options.enemyIds ?? ['CR_007']).map(id => {
        const unit = makeUnit(id);
        unit.getCardData().health = 200;
        unit.getCardData().attack = 0;
        return unit;
    });
    s.enemyField.push(...foes);
    s.cardManager.arrangeEnemyField(s.enemyField);
    const ids = options.unitIds ?? ['CR_001', 'CR_002', 'CR_010', 'CR_009', 'CR_HIGH_001'];
    const cards = ids.map(makeUnit);
    const equips = [0, 1].map(() => new ArtifactSprite(s, 0, 0, structuredClone(artifacts.artifacts.find(card => card.id === 'AR_001')) as ArtifactCard));
    s.hand.push(...cards, ...equips);
    s.cardManager.arrangeHand(s.hand as Parameters<CardManager['arrangeHand']>[0]);
    return { cards, equips, foe: foes[0], foes };
}
