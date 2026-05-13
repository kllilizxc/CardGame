import type { TutorialStepDefinition, TutorialPlayerAction } from '../../ui/battle/TutorialOverlayController';

/**
 * 第二阶段教程步骤——五道之识（卡牌类型与法器符箓）
 *
 * 对应剧情图节点 tut_002_battle，遭遇战 tutorial-stage2.json
 * 敌人：山贼(CR_010) + 雷鸣幼鹰(CR_003)
 * 复用卡组：deck.starter
 *
 * 设计分辨率 1920×1080，坐标基于 createDefaultLayout(1920, 1080)
 */

// ---- 基于设计分辨率 1920×1080 的 UI 区域坐标 ----

const HAND_ZONE = { x: 960, y: 972, width: 1152, height: 173 };

const PLAYER_FIELD_ZONE = { x: 960, y: 702, width: 1152, height: 324 };

const ENEMY_FIELD_ZONE = { x: 960, y: 270, width: 1152, height: 324 };

/**
 * 判断是否为打出御兽卡（unit）的操作。
 * 当前的 card_played 通知在 playCardToField 时触发，只对 unit 卡有效。
 */
function isUnitPlayed(action: TutorialPlayerAction): boolean {
    return action === 'card_played';
}

function isArtifactEquipped(action: TutorialPlayerAction): boolean {
    return action === 'equip_artifact';
}

function isTalismanUsed(action: TutorialPlayerAction): boolean {
    return action === 'use_skill';
}

function isTurnEnded(action: TutorialPlayerAction): boolean {
    return action === 'end_turn';
}

// ---- 步骤定义 ----

const STEP_IDENTIFY_UNIT: TutorialStepDefinition = {
    id: 'stage2_identify_unit',
    highlightZones: [HAND_ZONE],
    guideText: '这些发光的灵兽图案便是「御兽卡」——御兽匣的核心力量。\n将任意御兽卡拖入下方我方场地，召唤灵兽为你而战！',
    textPosition: 'bottom',
    showArrow: false,
    completionCheck: isUnitPlayed,
};

const STEP_EQUIP_ARTIFACT: TutorialStepDefinition = {
    id: 'stage2_equip_artifact',
    highlightZones: [HAND_ZONE, PLAYER_FIELD_ZONE],
    guideText: '手牌中的兵器图案是「法宝卡」——将其拖拽到你场上的灵兽身上，\n即可装备法宝，大幅提升该单位的攻击与防御！',
    textPosition: 'top',
    showArrow: true,
    arrowFromX: 960,
    arrowFromY: 86,
    arrowToX: 960,
    arrowToY: 702,
    completionCheck: isArtifactEquipped,
};

const STEP_USE_TALISMAN: TutorialStepDefinition = {
    id: 'stage2_use_talisman',
    highlightZones: [HAND_ZONE, ENEMY_FIELD_ZONE],
    guideText: '「符箓卡」可在战斗中瞬间释放——直接对敌方单位造成伤害或施加状态。\n如果手中有符箓卡，将它拖向敌方单位试试！（若无符箓卡，结束当前回合即可继续）',
    textPosition: 'top',
    showArrow: true,
    arrowFromX: 960,
    arrowFromY: 86,
    arrowToX: 960,
    arrowToY: 270,
    completionCheck: (action: TutorialPlayerAction) => isTalismanUsed(action) || isTurnEnded(action),
};

const STEP_CARD_TYPES_OVERVIEW: TutorialStepDefinition = {
    id: 'stage2_card_types_overview',
    highlightZones: [],
    guideText: '此外，「丹药卡」可瞬间恢复生命、「功法卡」则为灵兽赋予特殊的被动效果。\n这两类卡牌将在后续试炼中陆续登场。\n\n现在，运用你手头的卡牌，击败山贼与灵禽吧！',
    textPosition: 'center',
    showArrow: false,
    completionCheck: isTurnEnded,
};

const STAGE2_STEPS: TutorialStepDefinition[] = [
    STEP_IDENTIFY_UNIT,
    STEP_EQUIP_ARTIFACT,
    STEP_USE_TALISMAN,
    STEP_CARD_TYPES_OVERVIEW,
];

export function getStage2TutorialSteps(): TutorialStepDefinition[] {
    return STAGE2_STEPS;
}
