import { isPortraitGameViewport } from '../layout/gameViewport';

/**
 * 战斗场景布局配置
 * 统一管理所有 UI 面板和游戏区域的位置、尺寸、深度
 */

export interface PanelConfig {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ZoneConfig {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BattleLayoutConfig {
    // 卡牌预览面板
    cardPreview: PanelConfig;
    
    // 战斗日志
    battleLog: PanelConfig;
    
    // 手牌区域
    handZone: ZoneConfig;
    
    // 玩家场地区域
    playerFieldZone: ZoneConfig;
    
    // 敌方场地区域
    enemyFieldZone: ZoneConfig;
    
    // 场地卡区域
    fieldCardZone: ZoneConfig;
    
    // 卡组按钮
    deckButton: { x: number; y: number; width: number; height: number };

    // 弃牌堆按钮
    discardPileButton: { x: number; y: number; width: number; height: number };

    // 右侧操作按钮
    drawButton: { x: number; y: number; width: number; height: number };
    endTurnButton: { x: number; y: number; width: number; height: number };
    speedButton: { x: number; y: number; width: number; height: number };
    
    // 丹药槽位UI
    pillSlots: { x: number; y: number };
    
    // 技能UI
    skillUI: { x: number; y: number };
    
    // 深度配置
    depth: {
        // 场地区域视觉元素（边框、标签）
        fieldZoneVisuals: number;
        // 手牌
        handCards: number;
        // 场上卡牌
        fieldCards: number;
        // UI 按钮和面板
        uiButtons: number;
        // 统计信息和文本
        uiText: number;
        // 卡牌预览
        cardPreview: number;
        // 丹药提示框
        pillTooltip: number;
        // 卡牌飞向弃牌堆动画
        cardToDiscardAnimation: number;
    };
}

/**
 * 创建默认布局配置
 */
export function createDefaultLayout(width: number, height: number): BattleLayoutConfig {
    if (isPortraitGameViewport(width, height)) {
        return {
            cardPreview: { x: width / 2, y: height / 2, width: 420, height: 640 },
            battleLog: { x: width / 2, y: height / 2, width: 420, height: 650 },
            handZone: { x: width / 2, y: 932, width: width - 28, height: 130 },
            playerFieldZone: { x: width / 2, y: 555, width: width - 28, height: 160 },
            enemyFieldZone: { x: width / 2, y: 367, width: width - 28, height: 180 },
            fieldCardZone: { x: width / 2, y: 638, width: 112, height: 42 },
            deckButton: { x: 76, y: 246, width: 112, height: 54 },
            discardPileButton: { x: width - 76, y: 246, width: 112, height: 54 },
            pillSlots: { x: width / 2, y: 818 },
            skillUI: { x: width / 2, y: 713 },
            depth: {
                fieldZoneVisuals: 0,
                handCards: 10,
                fieldCards: 50,
                uiButtons: 100,
                uiText: 200,
                cardToDiscardAnimation: 2000,
                cardPreview: 6100,
                pillTooltip: 7000,
            },
        };
    }
    return {
        // Hover card: appears beside whatever is hovered; this is only its fallback anchor.
        cardPreview: { x: width * 0.5, y: height * 0.42, width: 400, height: 560 },

        // Battle log: a drawer that slides in from the right edge, closed by default.
        battleLog: { x: width - 230, y: height * 0.46, width: 420, height: 640 },

        // Hand fan: bottom centre.
        handZone: { x: width * 0.5, y: height - 150, width: Math.min(1240, width - 640), height: 260 },

        // Drop zones sit on the diorama itself (allies right, foes left).
        playerFieldZone: { x: width * 0.725, y: height * 0.47, width: width * 0.51, height: height * 0.62 },
        enemyFieldZone: { x: width * 0.27, y: height * 0.47, width: width * 0.5, height: height * 0.62 },

        // 天时 (field card) slot: small emblem under the turn ribbon.
        fieldCardZone: { x: width * 0.5, y: 150, width: 210, height: 120 },

        // Piles flank the hand.
        deckButton: { x: 96, y: height - 120, width: 132, height: 210 },
        discardPileButton: { x: width - 96, y: height - 120, width: 132, height: 210 },

        // Right-hand action stack.
        drawButton: { x: width - 290, y: height - 54, width: 144, height: 60 },
        endTurnButton: { x: width - 290, y: height - 140, width: 174, height: 90 },
        speedButton: { x: width - 148, y: 44, width: 72, height: 72 },

        // Pills: left rail. Skills: right rail.
        pillSlots: { x: 78, y: height * 0.34 },
        skillUI: { x: width - 78, y: height * 0.34 },

        // Depths, low to high.
        depth: {
            fieldZoneVisuals: 0,
            handCards: 300,
            fieldCards: 50,
            uiButtons: 200,
            uiText: 260,
            cardToDiscardAnimation: 2000,
            cardPreview: 6000,
            pillTooltip: 7000
        }
    };
}
