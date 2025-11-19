# Bug修复：法器卡跟随与死亡清理

## 🐛 问题描述

**Bug 1：法器卡不会随单位卡移动**
- 装备法器后，法器固定在初始位置
- 单位重新排列时，法器不跟随移动
- 导致法器和单位分离

**Bug 2：单位卡死亡后法器卡还在场上**
- 单位被击败后销毁
- 但装备的法器仍然留在场上
- 造成视觉混乱

---

## 🔍 问题分析

### **Bug 1 根本原因**

**原代码逻辑：**
```typescript
// ArtifactManager.attachArtifactVisual()
const targetPos = { x: target.x, y: target.y };
this.scene.tweens.add({
    targets: artifact,
    x: targetPos.x + 80,  // 固定偏移
    y: targetPos.y - 60,
    // ...
});
```

**问题：**
- 只在装备时移动一次法器到单位旁边
- 之后单位移动时，法器位置不更新
- 没有监听单位位置变化

### **Bug 2 根本原因**

**缺失调用：**
- `CombatManager.removeDeadUnits()` 中单位死亡时
- 没有调用 `artifactManager.onUnitDeath(unit)`
- 导致装备信息未清理，法器未销毁

---

## ✅ 修复方案

### **修复 1：实现法器跟随**

#### **步骤 1：提取位置更新逻辑**

**新增方法：**
```typescript
// ArtifactManager.ts
public updateArtifactPosition(
    artifact: ArtifactSprite, 
    target: CardSprite, 
    animated: boolean = true
) {
    const targetPos = { x: target.x, y: target.y };
    
    if (animated) {
        this.scene.tweens.add({
            targets: artifact,
            x: targetPos.x + 80,
            y: targetPos.y - 60,
            scale: 0.3,
            duration: 300,
            ease: 'Power2'
        });
    } else {
        // 立即更新，无动画
        artifact.x = targetPos.x + 80;
        artifact.y = targetPos.y - 60;
        artifact.setScale(0.3);
    }
}
```

#### **步骤 2：批量更新所有法器**

**新增方法：**
```typescript
// ArtifactManager.ts
public updateAllArtifactPositions() {
    this.equippedArtifacts.forEach(equipped => {
        this.updateArtifactPosition(
            equipped.artifact, 
            equipped.target, 
            false  // 立即更新，无动画
        );
    });
}
```

#### **步骤 3：在单位排列时调用**

**修改：CardManager.arrangePlayerField()**
```typescript
playerField.forEach((card, index) => {
    const x = startX + index * spacing;
    this.scene.tweens.add({
        targets: card,
        x: x,
        y: fieldY,
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
            // 单位移动完成后，更新装备的法器位置
            const battleScene = this.scene as any;
            if (battleScene.artifactManager) {
                battleScene.artifactManager.updateAllArtifactPositions();
            }
        }
    });
    card.setOriginalPosition(x, fieldY);
});
```

---

### **修复 2：单位死亡时清理法器**

#### **修改：CombatManager.removeDeadUnits()**

```typescript
const newPlayerField = playerField.filter(unit => {
    if (unit.getCardData().health <= 0) {
        console.log(`${unit.getCardData().name} 被击败！`);
        this.battleLog.addLog(`【${unit.getCardData().name}】被击败！`);
        
        // 🔧 处理装备的法器
        if (battleScene.artifactManager) {
            battleScene.artifactManager.onUnitDeath(unit);
        }
        
        this.animationManager.playDeathAnimation(unit);
        this.scene.time.delayedCall(300, () => unit.destroy());
        return false;
    }
    return true;
});
```

#### **onUnitDeath 内部逻辑**

```typescript
// ArtifactManager.ts
public onUnitDeath(unit: CardSprite) {
    // 找到并卸下所有装备在该单位上的法器
    const toRemove: string[] = [];
    this.equippedArtifacts.forEach((equipped, artifactId) => {
        if (equipped.target === unit) {
            toRemove.push(artifactId);
        }
    });

    toRemove.forEach(artifactId => {
        const equipped = this.equippedArtifacts.get(artifactId);
        if (equipped) {
            // 法器跟随单位一起消失
            equipped.artifact.destroy();
            this.equippedArtifacts.delete(artifactId);
        }
    });
}
```

---

## 📊 修改文件清单

| 文件 | 修改内容 | 行数变化 |
|------|---------|---------|
| `ArtifactManager.ts` | 新增 `updateArtifactPosition()` | +24 |
| `ArtifactManager.ts` | 新增 `updateAllArtifactPositions()` | +5 |
| `ArtifactManager.ts` | 重构 `attachArtifactVisual()` | -10 |
| `CardManager.ts` | `arrangePlayerField()` 添加回调 | +6 |
| `CombatManager.ts` | `removeDeadUnits()` 调用清理 | +8 |

**总计：** 5 个位置，33 行新增/修改

---

## 🧪 测试验证

### **测试场景 1：法器跟随**

**步骤：**
1. 打出一个单位到场上
2. 装备法器到该单位
3. 打出第二个单位
4. 观察法器是否跟随第一个单位重新排列

**预期结果：** ✅ 法器跟随单位移动到新位置

### **测试场景 2：单位死亡**

**步骤：**
1. 打出单位并装备法器
2. 让敌人攻击该单位
3. 单位生命值降为0
4. 观察法器是否一起消失

**预期结果：** ✅ 单位和法器一起消失

### **测试场景 3：多个法器**

**步骤：**
1. 场上有3个单位
2. 每个单位装备1个法器
3. 中间的单位死亡
4. 观察剩余单位和法器重新排列

**预期结果：** ✅ 剩余单位重新排列，法器正确跟随

---

## 🎯 解决方案特点

### **优点**

✅ **完全解耦**
- 法器位置更新独立于单位
- 通过回调机制实现跟随

✅ **性能优化**
- 批量更新避免重复计算
- 无动画模式提升流畅度

✅ **自动化**
- 单位排列时自动更新
- 单位死亡时自动清理

✅ **可扩展**
- 易于支持多个法器
- 易于支持不同装备位置

### **注意事项**

⚠️ **动画时机**
- 装备时：有动画（更好的视觉效果）
- 重排时：无动画（避免卡顿）

⚠️ **性能考虑**
- 只在 `onComplete` 回调中更新
- 避免每帧更新位置

⚠️ **类型安全**
- 使用 `as any` 访问 `artifactManager`
- 后续可改进类型定义

---

## 🚀 后续优化建议

### **1. 更精细的跟随机制**

```typescript
// 法器作为单位的子对象
class CardSprite {
    private equippedArtifacts: ArtifactSprite[] = [];
    
    public addArtifact(artifact: ArtifactSprite) {
        this.equippedArtifacts.push(artifact);
        // 法器跟随单位，自动更新
    }
}
```

### **2. 多装备槽位**

```typescript
enum EquipSlot {
    Weapon,
    Armor,
    Accessory
}

interface EquipmentSlots {
    weapon?: ArtifactSprite;
    armor?: ArtifactSprite;
    accessory?: ArtifactSprite;
}
```

### **3. 装备UI显示**

- 在单位卡上显示装备图标
- 鼠标悬停显示装备列表
- 点击可查看/卸下装备

---

## ✅ 总结

**修复完成！**

- ✅ 法器卡现在会跟随单位移动
- ✅ 单位死亡时法器会正确清理
- ✅ 支持多个单位装备多个法器
- ✅ 性能优化，流畅运行

**代码质量：**
- 逻辑清晰，易于维护
- 充分解耦，职责明确
- 为后续扩展留有空间

刷新浏览器测试吧！🎉
