# 卡匣问心 · 整套素材重绘 v7

以用户认可的 `assets/disciple-reference-v2.png` 为主风格，统一人物、灵兽、敌人、卡图、场景与道具。低饱和灰绿、米白、炭黑和旧金色，大块硬边像素；人物生成目标为约 6–6.5 头身。弟子沿用已确认的比例修正版。

## 打开

- 项目预览：`http://localhost:8080/wenxin-v5/index.html`。
- 弟子卡直达：`http://localhost:8080/wenxin-v5/index.html?card=disc`。
- 单文件：`v7-卡匣问心-整套重绘.html`。16 张 PNG 和素材适配器均内嵌，直接打开即可运行。字体沿用原型的外链，离线时使用系统字体。
- 可用 `bun run dev-nolog` 启动项目预览。

## 素材清单

新增 15 张图，加上已认可的弟子图，共 16 个实际加载文件。全部通过内置 `image_gen` 生成；本轮每张图直接使用弟子比例修正版作为风格参考，完整提示词保存在 `series-prompts.json`。弟子图的原始生成与比例修正提示词见 `single-card-prompt.json`。

| 文件（位于 assets/） | 使用位置 |
| --- | --- |
| disciple-reference-v2.png | 真传弟子：原认可造型；单位、卡图与远景人群 |
| series-girl.png | 少女全身与四种表情图集 |
| series-elder.png | 执事表情图集、峰主单位、卡图与召唤特写 |
| series-fox.png | 灵狐、问心狐影与对应卡图 |
| series-eagle.png | 幼鹰单位与卡图 |
| series-ghost.png | 问心残影与隐藏卡图 |
| series-talisman.png | 雷击符卡图与飞行符纸 |
| series-sword.png | 青云剑卡图与剑雨中的飞剑 |
| series-story.png | 山门与问心阶背景 |
| series-floor.png | 原透视战场的地面贴图 |
| series-sky.png | 战场山景与云海 |
| series-gallery.png | 卡面鉴赏与开匣场景 |
| series-bell.png | 问心钟 |
| series-island.png | 浮空岛 |
| series-cloud.png | 移动云雾与战场边缘云海 |
| series-casket.png | 卡匣箱体与独立活动匣盖 |

旧试稿和 v5/v6 单文件保留作对照，不在本版运行时加载。

## 动画接入

`materials-series.js` 将图片绑定到 v4 原有画布尺寸、脚底锚点与姿态参数。卡框、卡背保留原轮廓并统一色板；游戏数据与卡牌数值未改动。

立绘始终使用同一张身体底图，只在面部区域切换表情和口型，不再把整张身体换成图集另一格。呼吸形变修正了小于半像素、取整后完全静止的问题；站立单位脚底保持原锚点，灵禽与残影延续悬浮。

原 HTML 的剧情分支、按钮、自动轮播、战斗透视、相机跟随、召唤特写、攻击编排、飞行轨迹、命中停顿、粒子碎裂、卡牌倾斜和翻面继续由 v4 驱动。替换开匣与剑符贴图时，保留其原开合角度、路径和时间线。

## 验证

`source-check.json` 记录原文件 SHA-256、所有明确的素材入口替换和六段受保护的引擎代码。逆向还原替换后，与用户提供的 v4 HTML 逐字一致。以下段落单独验证逐字不变：战斗序列、战斗与镜头更新、投影与槽位、卡牌布局和翻面、剧情控制、开匣时序。

`series-verification.json` 与 `series-playthrough.json` 保存实际浏览器检查记录：

- 六种战斗单位各七个采样时刻均有不同画面；灵狐、弟子、峰主的脚底位置稳定。
- 表情与口型切换仅改变脸部像素，身体像素不变；眨眼与说话可见。
- 六张公开卡图和两张隐藏敌人卡图均可读取像素，供原版召唤聚合与碎裂使用。
- 从问心钟鸣、开匣到完整演武返回待命，脚本错误记录为空。
- 单文件内嵌 16 张图片，两个脚本语法校验通过。

实际游戏画布截图位于 `previews/series-*.png`。

## 重新生成

```sh
bun tools/wenxin-materials/create-preview.ts '/mnt/e/Downloads/Claude-export-本地整理备份/整理后/交互作品/卡匣问心/v4-卡匣问心.html'
bun tools/wenxin-materials/pack-preview.ts
```

本目录是独立 HTML 素材验证版，未改动项目的 Phaser 主运行入口。
