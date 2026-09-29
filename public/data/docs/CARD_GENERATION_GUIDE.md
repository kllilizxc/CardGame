# 卡牌生成指南（面向 AI / 策划）

本指南用于约束 AI 生成卡牌数据时的格式与数值逻辑，确保与现有世界观、战斗规则、类型定义保持一致。

相关文件：
- `types/cards.ts`（通过 `types/cards/` 下各子文件导出全部类型定义）
- `config/realm-presets.json`：境界 → `Realm.value` 映射
- `config/combat-baseline.json`：不同境界下普通单位的推荐攻/血区间
- `cards/*.json`：各类卡牌示例

---

## 1. 基础类型与字段约定

### 1.1 卡牌大类（kind）

`CardKind`：
- `"unit"`：战斗单位（灵兽、人族修士、妖族等）
- `"artifact"`：法器装备 / 场上持续道具
- `"talisman"`：一次性或短期符箓
- `"field"`：场地 / 法阵
- `"skill"`：玩家技能（主动技）
- `"pill"`：战斗内一次性丹药

**生成卡牌时，必须先确定 `kind`。**

### 1.2 共有基础字段（BaseCard）

所有卡牌都继承以下字段：
- `id: string`：全局唯一 ID，如 `"CR_001"`、`"AR_001"`，前缀建议按类别区分。
- `name: string`：卡牌名称。
- `kind: CardKind`：卡牌大类。
- `description: string`：对玩家可见的效果描述，建议与 `effects.text` 一致或略微润色。
- `rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"`：稀有度。
- `labels?: string[]`：**关键标签**，用于效果检索和条件判断。
  - 阵营/势力：如 `"sect_qingyun"`。
  - 地域：如 `"青云宗山门附近"`。
  - 身份：如 `"队友"`、`"外门弟子"`。
  - 特征：如 `"灵兽"`、`"飞剑"`、`"聚灵"`。
- `limitPerDeck?: number`：牌组中允许的最大数量（默认 3，未填时可按 3 处理）。

> 生成时请优先使用结构化字段 `labels`，避免再引入自由文本标签系统。

---

## 2. 境界（Realm）与数值基准

### 2.1 境界结构

`Realm`：
- `stage: RealmStage`：大境界
  - `"凡人" | "炼气期" | "筑基期" | "金丹期" | "元婴期" | "化神期" | "合体期" | "大乘期"`
- `phase?: RealmPhase`：小阶段
  - `"初期" | "中期" | "后期"`
- `value: number`：数值化等级，用于比较。具体映射在 `config/realm-presets.json` 中定义。

### 2.2 Realm 预设（config/realm-presets.json）

示例：
```json
{
  "stage": "炼气期",
  "phases": [
    { "phase": "初期", "value": 1 },
    { "phase": "中期", "value": 2 },
    { "phase": "后期", "value": 3 }
  ]
}
```

**生成单位卡时，必须：**
1. 选择合理的 `stage` 与 `phase`（与世界观、故事节点匹配）。
2. 查找对应的 `value` 并写入 `realm.value`。

约束：`realm-presets.json` 中每个 `value` 必须唯一，且 `combat-baseline.json.realms[*].value`
必须能在 realm presets 中找到。当前凡人境只有一个无小阶段预设（`phase: ""`, `value: 0`），
炼气及以上再按小阶段细分。

### 2.3 战斗数值基线（config/combat-baseline.json）

`combat-baseline.json` 为普通单位提供推荐的攻/血区间：

每条记录：
```json
{
  "stage": "炼气期",
  "phase": "初期",
  "value": 1,
  "attackMin": 4,
  "attackMax": 6,
  "healthMin": 20,
  "healthMax": 30
}
```

**生成 unit 卡时的典型步骤：**
1. 确定 `realm.stage` / `realm.phase` / `realm.value`。
2. 在 `combat-baseline.json.realms` 中寻找完全匹配的条目。
3. 在 `[attackMin, attackMax]`、`[healthMin, healthMax]` 区间内随机或按设计取值。
4. 根据 `star`、`rarity`、身份（如 BOSS/精英）进行倍率调整：
   - 普通 1–2 星单位：区间下半部分。
   - 3–4 星单位：区间上半部分或 × `1.2~1.5`。
   - 5 星及以上或精英：区间平均值 × `1.5~2.5`。
   - BOSS：区间平均值 × `3~5`，或直接使用更高境界的区间。

---

## 3. 结构化效果系统（effects）

卡牌效果分为两条并行域（仅类型收敛，运行时未改）：
- **legacy 域（兼容保留）**：当前现网卡牌仍使用 `timing / target / conditions / actions`。
- **schema 域（迁移目标）**：新增并行 `schema` 字段表达，统一 `event / conditions / actions`。

收敛策略：
- `兼容保留`：继续以 legacy 语义驱动运行，确保现有战斗行为不变。
- `domain union 拆分`：`CardEffect = LegacyCardEffect | SchemaCardEffect`，禁止混用字段。
- `adapter 迁移路径`：`adaptLegacyCardEffectToSchema` 输出 `CardEffectMigrationReport`，用于离线迁移评估（含阻断项 warning）。

### 3.1 触发时机（EffectTiming）

- `"onSummon"`：进入场上时
- `"onDeath"`：离场/被破坏时
- `"onAttack"`：攻击时（具体前后可在 text 中描述）
- `"turnStart"`：我方回合开始时
- `"turnEnd"`：我方回合结束时
- `"reaction"`：玩家主动使用或特殊响应触发

### 3.2 目标（EffectTarget）

```ts
export interface EffectTarget {
  scope: EffectTargetScope;
  requiredLabelsAllOf?: string[];
  requiredLabelsAnyOf?: string[];
}
```

`EffectTargetScope`：
- `"self"`：效果来源自身（通常是该单位/该装备的持有者）
- `"ownerPlayer"`：持有该卡的玩家
- `"allyUnits"`：己方全部单位
- `"enemyUnits"`：敌方全部单位
- `"singleAlly"`：指定一名己方单位
- `"singleEnemy"`：指定一名敌方单位
- `"allUnits"`：场上全部单位
- `"none"`：无直接目标，如纯抽牌、修改全局状态

**AI 生成时：**
- 用 `requiredLabelsAllOf`/`AnyOf` 来筛选目标，例如：
  - 只作用于灵兽：`{ "scope": "allyUnits", "requiredLabelsAllOf": ["灵兽"] }`

### 3.3 条件（EffectCondition）

```ts
export interface EffectCondition {
  type: EffectConditionType;
  labels?: string[];
  value?: number;
  scriptId?: string;
}
```

`EffectConditionType`：
- `"hasLabel"`：来源或目标拥有某 label
- `"realmDiffAtLeast"`：双方境界差至少 N
- `"unitCountAtLeast"`：场上单位数量至少 N（结合 `labels` 使用）
- `"hasCardInHand"`：手牌中存在某类卡
- `"custom"`：复杂条件，由脚本实现

示例：
```json
{
  "type": "unitCountAtLeast",
  "labels": ["灵兽"],
  "value": 2
}
```
表示：我方场上带有 `"灵兽"` 标签的单位数量 ≥ 2。

### 3.4 动作（EffectAction）

```ts
export interface EffectAction {
  type: EffectActionType;
  value?: number;
  statusId?: string;
  scriptId?: string;
}
```

`EffectActionType`：
- `"modifyAttack"`：修改攻击力（当前回合或持续，具体看效果上下文）
- `"modifyHealth"`：改变生命值（可当作伤害或治疗）
- `"drawCards"`：抽牌
- `"healPlayer"`：回复玩家生命
- `"damagePlayer"`：对玩家造成伤害
- `"applyStatus"`：施加状态；`statusId` 必须来自 `public/data/config/status-definitions.json` 的 `statuses[].id`（例如护甲使用 `armor`，易伤使用 `vulnerable`，不要使用旧称 `shield`）
- `"destroyUnit"`：摧毁单位
- `"custom"`：脚本处理的特殊动作

示例：
```json
{
  "type": "modifyAttack",
  "value": 1
}
```

### 3.5 整体效果结构（CardEffect）

legacy 完整结构：

```json
{
  "timing": "turnStart",
  "target": {
    "scope": "allyUnits",
    "requiredLabelsAllOf": ["灵兽"]
  },
  "conditions": [
    {
      "type": "unitCountAtLeast",
      "labels": ["灵兽"],
      "value": 1
    }
  ],
  "actions": [
    {
      "type": "modifyAttack",
      "value": 1
    }
  ],
  "text": "我方回合开始时：若你场上存在至少1张灵兽卡，则本回合内所有己方灵兽攻击力+1。",
  "scriptId": "effect.CR_002.turnStart.buffBeasts"
}
```

schema 完整结构（迁移目标）：

```json
{
  "schema": {
    "event": {
      "type": "TurnStart",
      "side": "Any"
    },
    "conditions": [
      {
        "type": "UnitOnField",
        "requiredLabelsAnyOf": ["灵兽"]
      }
    ],
    "actions": [
      {
        "type": "ModifyStats",
        "attackDelta": 1
      }
    ]
  },
  "text": "我方回合开始时：若你场上存在至少1张灵兽卡，则本回合内所有己方灵兽攻击力+1。",
  "scriptId": "effect.CR_002.turnStart.buffBeasts"
}
```

**AI 在生成时：**
- 应当优先生成 `timing`、`target`、`conditions`、`actions` 的结构化内容。
- 然后再基于结构生成简洁、符合语气的中文 `text` 描述。
- `scriptId` 可按规则命名，如：`"effect.<CardID>.<timing>.<shortName>"`。

---

## 4. 各类卡牌的专有字段

### 4.1 UnitCard（单位卡）

关键字段：
- `star: number`：星级（1–12），影响强度与召唤条件。
- `race: UnitRace`：种族，如 `"兽族"`、`"人族"`。
- `linggen?: LinggenElement[]`：灵根属性，用于部分效果前置条件。
- `factionId?: string`：所属势力 ID。
- `realm?: Realm`：境界。
- `attack: number` / `health: number`：战斗数值，对齐 `combat-baseline.json`。
- `effects?: CardEffect[]`：结构化效果。

### 4.2 ArtifactCard（法器卡）

- `equipTarget: "unit" | "player"`
- `durability?: number`
- `attackBonus?: number`
- `healthBonus?: number`
- `effects?: CardEffect[]`

### 4.3 TalismanCard（符箓）

- `isInstant: boolean`
- `duration?: number`
- `target: TalismanTarget`（`"unit" | "player" | "allUnits" | "all"`）
- `effects: CardEffect[]`

### 4.4 FieldCard（法阵/场地）

- `symmetric: boolean`：是否对双方对称生效。
- `effects: CardEffect[]`

### 4.5 SkillCard（玩家技能）

- `cooldownType: "perBattle" | "perTurn" | "custom"`
- `cooldownValue?: number`
- `effects: CardEffect[]`

### 4.6 PillCard（丹药）

- `grade: 1 | 2 | ... | 9`
- `isInstant: boolean`
- `duration?: number`
- `target: TalismanTarget`
- `effects: CardEffect[]`

---

## 5. 生成新卡牌的推荐步骤（AI 流程）

1. **确定卡牌定位与稀有度**
   - 种类：unit / artifact / talisman / field / skill / pill。
   - 使用场景：前期练手 / 中期核心 / 特殊功能。
   - 稀有度 & 星级（如适用）。

2. **确定世界观信息**
   - 势力、地域、身份等 → 写入 `labels`。
   - 单位卡：确定 `race`、`linggen`、`factionId`、`realm`。

3. **根据境界设定数值**（unit 为主）
   - 从 `realm-presets` 查到对应 `value`。
   - 从 `combat-baseline` 查到 attack/health 区间。
   - 按稀有度/星级选取合适的攻/血值。

4. **设计效果（effects）**
   - 选择 `timing`：onSummon / turnStart / reaction 等。
   - 设计 `target`：self / allyUnits / singleEnemy，并用 `requiredLabels*` 限制范围。
   - 加入必要 `conditions`：如需要特定标签、单位数量、境界差。
   - 组合 `actions`：改变攻防、抽牌、治疗、状态、摧毁单位等。

5. **生成规则文本与脚本 ID**
   - 基于结构化 `target + conditions + actions` 自动生成简洁中文描述到 `text`。
   - 为该效果指定 `scriptId`，与实际执行逻辑脚本对应。

6. **一致性检查**
   - 攻/血是否落在合理范围（或其倍数）。
   - `labels` 是否覆盖需要被效果检索的关键属性。
   - `effects.text` 与结构化定义是否一致。
   - `id` 是否唯一且前缀与类别吻合。

---

本指南会随着规则演化继续补充，例如：
- 状态词汇以 `status-definitions.json` 为唯一 registry，新增状态需先添加规范 `id` 再让卡牌 `applyStatus.statusId` 引用。
- 自动描述生成的模板规范。
- 特定标签（labels）的标准列表，用于避免同义词分裂。
