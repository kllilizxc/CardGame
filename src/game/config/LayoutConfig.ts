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
        // 卡牌预览面板 - 左上角
        cardPreview: {
            x: width * 0.14,
            y: height * 0.5,
            width: width * 0.24,
            height: height * 0.56
        },
        
        // 战斗日志 - 右侧
        battleLog: {
            x: width - width * 0.09,
            y: height * 0.45,
            width: width * 0.18,
            height: height * 0.45
        },
        
        // 手牌区域 - 底部中央
        handZone: {
            x: width * 0.5,
            y: height * 0.865,
            width: width * 0.6,
            height: height * 0.16
        },
        
        // 玩家场地区域 - 中下部
        playerFieldZone: {
            x: width * 0.76,
            y: height * 0.50,
            width: width * 0.43,
            height: height * 0.44
        },
        
        // 敌方场地区域 - 中上部
        enemyFieldZone: {
            x: width * 0.24,
            y: height * 0.50,
            width: width * 0.43,
            height: height * 0.44
        },
        
        // 场地卡区域 - 中央
        fieldCardZone: {
            x: width * 0.055,
            y: height * 0.72,
            width: width * 0.075,
            height: height * 0.12
        },
        
        // 卡组按钮 - 左下角
        deckButton: {
            x: width * 0.08,
            y: height - height * 0.08,
            width: 148,
            height: 108
        },
        
        // 弃牌堆按钮 - 右下角
        discardPileButton: {
            x: width - width * 0.08,
            y: height - height * 0.08,
            width: 148,
            height: 108
        },
        
        // 丹药槽位 - 左下角，卡组按钮上方
        pillSlots: {
            x: width * 0.105,
            y: height - height * 0.18
        },
        
        // 技能UI
        skillUI: {
            x: width * 0.5,
            y: height * 0.72
        },
        
        // 深度配置（从低到高）
        depth: {
            fieldZoneVisuals: 0,      // 场地区域边框和标签
            handCards: 10,             // 手牌
            fieldCards: 50,            // 场上卡牌
            uiButtons: 100,            // UI 按钮
            uiText: 200,               // 统计信息文本
            cardToDiscardAnimation: 2000,  // 卡牌飞向弃牌堆动画
            cardPreview: 6100,         // 卡牌预览
            pillTooltip: 7000          // 丹药提示框
        }
    };
}
