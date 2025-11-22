/**
 * 战斗场景布局配置
 * 统一管理所有 UI 面板和游戏区域的位置、尺寸
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
}

/**
 * 创建默认布局配置
 */
export function createDefaultLayout(width: number, height: number): BattleLayoutConfig {
    return {
        // 卡牌预览面板 - 左上角
        cardPreview: {
            x: width * 0.09,
            y: height * 0.5,
            width: width * 0.15,
            height: height * 0.5
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
            y: height * 0.9,
            width: width * 0.6,
            height: height * 0.16
        },
        
        // 玩家场地区域 - 中下部
        playerFieldZone: {
            x: width * 0.5,
            y: height * 0.65,
            width: width * 0.6,
            height: height * 0.3
        },
        
        // 敌方场地区域 - 中上部
        enemyFieldZone: {
            x: width * 0.5,
            y: height * 0.25,
            width: width * 0.6,
            height: height * 0.3
        },
        
        // 场地卡区域 - 中央
        fieldCardZone: {
            x: width * 0.25,
            y: height * 0.45,
            width: width * 0.1,
            height: height * 0.2
        },
        
        // 卡组按钮 - 左下角
        deckButton: {
            x: width * 0.08,
            y: height - height * 0.08,
            width: 120,
            height: 100
        },
        
        // 弃牌堆按钮 - 右下角
        discardPileButton: {
            x: width - width * 0.08,
            y: height - height * 0.08,
            width: 120,
            height: 100
        },
        
        // 丹药槽位 - 左下角，卡组按钮上方
        pillSlots: {
            x: width * 0.08,
            y: height - height * 0.18
        },
        
        // 技能UI
        skillUI: {
            x: width * 0.75,
            y: height * 0.45
        }
    };
}
