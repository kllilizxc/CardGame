# 卡片列表视图系统

## 📋 功能概述

实现了通用的卡片列表视图组件，用于展示卡组、弃牌堆等卡片集合。

---

## ✨ 特性

### **1. 通用组件 - CardListView**

**位置：** `src/game/ui/CardListView.ts`

**功能：**
- ✅ 展示任意卡片列表（单位卡、法器卡等）
- ✅ 网格布局，自动计算行列
- ✅ 支持鼠标滚轮滚动
- ✅ 支持触摸拖动滚动
- ✅ 卡片 hover 预览（复用现有预览系统）
- ✅ 点击遮罩或关闭按钮退出
- ✅ ESC 键快捷关闭
- ✅ 自动遮罩裁剪（卡片不会溢出面板）

**使用方法：**
```typescript
new CardListView(scene, '标题', cardArray);
```

---

### **2. 卡组按钮**

**位置：** 左下角

**外观：**
- 蓝色边框
- 堆叠的卡片图标
- 显示当前卡组数量
- Hover 高亮效果

**功能：**
- 点击打开卡组视图
- 展示所有剩余卡牌
- 不可拖拽（只读）

---

### **3. 弃牌堆按钮**

**位置：** 右下角

**外观：**
- 灰色边框
- 散乱的卡片图标
- 显示当前弃牌堆数量
- Hover 高亮效果

**功能：**
- 点击打开弃牌堆视图
- 展示所有已使用/弃置的卡牌
- 不可拖拽（只读）

---

## 🎮 交互说明

### **打开列表**
- 点击卡组按钮 → 查看剩余卡牌
- 点击弃牌堆按钮 → 查看已使用卡牌

### **浏览卡片**
- **鼠标滚轮** - 上下滚动
- **触摸拖动** - 在面板上拖动滚动
- **Hover 卡片** - 左侧显示详细预览

### **关闭列表**
- 点击**关闭按钮**（右上角红色按钮）
- 点击**面板外黑色区域**
- 按 **ESC 键**

---

## 🔧 技术实现

### **1. 响应式布局**

```typescript
// 根据屏幕宽度自动计算列数
const cardWidth = 180 * 0.5;
const spacing = 20;
const cols = Math.floor(containerWidth / (cardWidth + spacing));
```

### **2. 滚动系统**

**鼠标滚轮：**
```typescript
this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
    this.scroll(deltaY * 0.5);
});
```

**触摸拖动：**
```typescript
// pointerdown → pointermove → pointerup
const deltaY = this.lastPointerY - pointer.y;
this.scroll(deltaY);
```

**边界限制：**
```typescript
this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
```

### **3. 遮罩裁剪**

```typescript
const maskShape = this.scene.add.graphics();
maskShape.fillRect(x, y, width, height);
const mask = maskShape.createGeometryMask();
this.scrollContainer.setMask(mask);
```

### **4. 自动清理**

```typescript
private close() {
    // 移除所有事件监听
    this.scene.input.keyboard?.off('keydown-ESC');
    this.scene.input.off('wheel');
    
    // 销毁卡片精灵
    this.cardSprites.forEach(sprite => sprite.destroy());
    
    // 销毁自身
    this.destroy();
}
```

---

## 📊 卡片网格算法

```typescript
cards.forEach((cardData, index) => {
    const col = index % cols;           // 当前列
    const row = Math.floor(index / cols); // 当前行
    
    const x = col * (cardWidth + spacing) - offset;
    const y = row * (cardHeight + spacing);
    
    // 创建卡片精灵...
});
```

**示例：** 容器宽度 760px，卡片宽度 90px，间距 20px
- 列数 = floor(760 / 110) = 6
- 每行显示 6 张卡
- 自动换行

---

## 🎨 视觉设计

### **颜色方案**

| 元素 | 颜色 | 说明 |
|------|------|------|
| 遮罩背景 | `0x000000` (70%) | 半透明黑色 |
| 主面板 | `0x2c3e50` | 深蓝灰色 |
| 标题 | `#f39c12` | 金色 |
| 关闭按钮 | `0xe74c3c` | 红色 |
| 卡组按钮 | `0x3498db` | 蓝色 |
| 弃牌堆按钮 | `0x95a5a6` | 灰色 |

### **尺寸规格**

| 项目 | 尺寸 |
|------|------|
| 面板宽度 | min(800px, 90%屏幕宽度) |
| 面板高度 | min(600px, 85%屏幕高度) |
| 卡片缩放 | 0.5 |
| 卡片间距 | 20px |
| 按钮大小 | 120x100px |

---

## 🔄 复用性

**CardListView 可用于：**
- ✅ 卡组查看
- ✅ 弃牌堆查看
- ✅ 手牌历史
- ✅ 战斗记录（查看使用过的卡牌）
- ✅ 奖励选择（显示可选卡牌）
- ✅ 商店购买（展示商品卡牌）
- ✅ 收藏图鉴（所有拥有的卡牌）

**示例：**
```typescript
// 查看卡组
new CardListView(this, '卡组', this.deck);

// 查看弃牌堆
new CardListView(this, '弃牌堆', this.discardPile);

// 奖励选择
const rewards = [card1, card2, card3];
new CardListView(this, '选择奖励', rewards);

// 图鉴
new CardListView(this, '卡牌图鉴', allCards);
```

---

## 🚀 未来扩展

### **1. 卡片选择模式**
```typescript
constructor(
    scene: Scene, 
    title: string, 
    cards: Card[], 
    options?: {
        selectable?: boolean;
        maxSelections?: number;
        onSelect?: (selected: Card[]) => void;
    }
)
```

### **2. 筛选和排序**
```typescript
// 按类型筛选
filterByType(type: CardKind)

// 按稀有度排序
sortByRarity()

// 按费用排序
sortByCost()
```

### **3. 搜索功能**
```typescript
// 添加搜索框
addSearchBox(onSearch: (query: string) => void)
```

### **4. 分组显示**
```typescript
// 按类型分组
groupByType()

// 按稀有度分组
groupByRarity()
```

---

## ✅ 测试清单

- [ ] 卡组为空时正确显示
- [ ] 卡片数量很多时滚动流畅
- [ ] 不同屏幕尺寸下布局正确
- [ ] 触摸设备上拖动滚动正常
- [ ] 卡片 hover 预览不被遮挡
- [ ] 关闭后所有资源正确清理
- [ ] 多次打开关闭无内存泄漏
- [ ] ESC 键关闭功能正常
- [ ] 同时打开多个视图的处理

---

## 📝 使用注意事项

1. **性能考虑**
   - 卡片数量超过 100 张时考虑虚拟滚动
   - 避免在卡片精灵上添加复杂的实时动画

2. **交互冲突**
   - CardListView 会捕获所有输入事件
   - 打开时其他交互会被遮罩阻挡

3. **内存管理**
   - 关闭时自动清理所有卡片精灵
   - 不要保存 CardListView 的引用

---

## 🎉 总结

实现了一个**功能完整、可复用**的卡片列表视图系统：

✅ **通用性强** - 支持任意卡片类型  
✅ **交互友好** - 多种关闭方式、流畅滚动  
✅ **视觉美观** - 现代化UI设计  
✅ **性能优化** - 自动清理、遮罩裁剪  
✅ **易于扩展** - 为未来功能预留接口  

现在玩家可以随时查看卡组和弃牌堆，了解战斗状况！🎮
