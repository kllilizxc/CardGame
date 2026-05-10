import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import {
  EffectActionType,
  EffectConditionType,
  EffectEventSide,
  EffectEventType,
  type Gongfa,
} from '@data/types/gongfa';
import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';
import { UnitEffectManager, type GongfaRuntimeContext } from './UnitEffectManager';

function createCardSprite(cardData: UnitCard): CardSprite {
  return {
    getCardData: () => cardData,
  } as unknown as CardSprite;
}

function createHarness(artifactGradeId: string) {
  const unitCard = {
    id: 'unit.test_qi_swordsman',
    name: '炼气剑修',
    kind: 'unit',
    realmId: 'realm_qi_1',
    gongfaIds: ['gongfa.test_artifact_armor'],
    attack: 4,
    health: 20,
  } as UnitCard;
  const unitSprite = createCardSprite(unitCard);
  const addLogMessages: string[] = [];
  const gongfaLogNames: string[] = [];
  const statusApplications: Array<{ unitId: string; statusId: string; value: number; target: CardSprite }> = [];
  const battleContext = {
    battleLog: {
      addLog: (message: string) => addLogMessages.push(message),
      addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
    },
  } as unknown as BattleContext;
  const context = {
    playerField: [unitSprite],
    discardPile: [],
    hand: [],
    cardScale: 1,
    artifactUsage: {},
    battleStatusController: {
      applyStatusToUnit: (unitId: string, statusId: string, value: number, target: CardSprite) => {
        statusApplications.push({ unitId, statusId, value, target });
      },
    },
  } as GongfaRuntimeContext;
  const artifact = {
    id: `artifact.${artifactGradeId}`,
    name: '测试法器',
    kind: 'artifact',
    gradeId: artifactGradeId,
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
  } as ArtifactCard;
  const gongfaList: Gongfa[] = [
    {
      id: 'gongfa.test_artifact_armor',
      name: '借器护身',
      description: '根据装备法器星级获得护甲。',
      schema: {
        event: { type: EffectEventType.OnEquipArtifact, side: EffectEventSide.Ally },
        conditions: [
          {
            type: EffectConditionType.ArtifactEquipped,
            weaponType: '剑',
            maxStar: 'card.star + 1',
          },
        ],
        actions: [
          {
            type: EffectActionType.GainArmor,
            target: 'self',
            value: 'artifact.star * 2',
          },
        ],
      },
    },
  ];
  const manager = new UnitEffectManager(battleContext, gongfaList);

  return { manager, unitSprite, context, artifact, addLogMessages, gongfaLogNames, statusApplications };
}

describe('UnitEffectManager artifact grade lookup consumer contract', () => {
  it('uses artifact grade stars for equip conditions and artifact.star expressions without changing behavior', () => {
    const harness = createHarness('grade_earth_lower');

    harness.manager.applyOnEquipArtifactEffects(harness.unitSprite, harness.artifact, harness.context);

    expect(harness.statusApplications).toEqual([
      {
        unitId: 'unit.test_qi_swordsman',
        statusId: 'armor',
        value: 4,
        target: harness.unitSprite,
      },
    ]);
    expect(harness.addLogMessages).toEqual(['【炼气剑修】获得 4 点护甲']);
    expect(harness.gongfaLogNames).toEqual(['借器护身']);
  });

  it('keeps maxStar artifact equip conditions blocking higher-grade artifacts', () => {
    const harness = createHarness('grade_heaven_lower');

    harness.manager.applyOnEquipArtifactEffects(harness.unitSprite, harness.artifact, harness.context);

    expect(harness.statusApplications).toEqual([]);
    expect(harness.addLogMessages).toEqual([]);
    expect(harness.gongfaLogNames).toEqual([]);
  });
});
