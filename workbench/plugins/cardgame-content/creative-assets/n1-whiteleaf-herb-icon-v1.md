# 白叶草道具图标 · 候选 v1

状态：已加入正式 CardGame 工作区的 demo 内容，待用户试玩确认。用途是雾林冒险白叶草道具的通用背包图标，通过道具目录 `iconAsset` 引用。

| 项目 | 值 |
| --- | --- |
| 原图 | `n1-whiteleaf-herb-icon-v1.png` |
| SHA-256 | `76d6862efeea50e67a03a42248f4935b6ea5f92d4b98ef8422468d8240e6cc8f` |
| 尺寸与格式 | 1254 × 1254 RGBA PNG，透明背景 |
| 候选目标 | `public/assets/items/herbs/white-leaf-v1.png` |
| 主风格参考 | `game-asset-production/references/wenxin.md` v1；`disciple-reference-v2.png`，SHA-256 `df9aa0963b43ff13089bfc29201664f19f5503e0a7cad4d54aba9dc3e0f0f526` |
| 植物参考 | `n1-whiteleaf-clearing-pixel-v1.png`，SHA-256 `7242018de5366e23ccf18d6cfb8c3fb2dbbc3d703b93c5e6ef010fd15d11e061` |
| 制作 | Codex 内置 imagegen；以两张本地参考图生成，不是人工裁剪或旧图复用 |
| 运行约定 | 48–56 px 背包显示，保持正方形比例；不含 UI 框、文字或状态层；图片按内容哈希和候选路径登记 |

原图自检：白色宽叶、灰绿叶脉和深色茎在缩小后仍形成独立轮廓；没有场景、文字或边框。在可丢弃 CardGame 副本中将本图作为一件通用消耗品的 `iconAsset`，用 browser-harness 从地图进入试炼背包：1422×904 桌面第三行、390×844 手机第二页都能看到白叶草，名称、数量、说明、丢弃按钮无重叠。截图见 `docs/verification/assets/item-icon-desktop.png` 与 `item-icon-mobile-390.png`。

之后还在隔离 Worka 的原知识库动作中建成确切剧情候选 `story-f82cd774f5423003912c8caf48e157fcdc5d`（提交 `a43ef11062ed1c39e4651b9f62e81f18ea0f2f81`）。原试玩便笺的六项检查全通过；browser-harness 实点剧情获得白叶草 ×2，再进试炼背包，桌面和 390px 手机均显示该图、数量及原有丢弃操作。证据见 `docs/verification/assets/item-icon-exact-candidate-desktop.png` 与 `item-icon-exact-candidate-mobile-390.png`。隔离功能进展中的加入与撤销也已实点，撤销后八个内容路径与采用前的 SHA-256/不存在状态逐项相同，完整 `git status --porcelain=v1 -uall` 也相同。随后按用户要求把同一 PNG 放入正式 CardGame demo 的 `public/assets/items/herbs/white-leaf-v1.png`，在出发准备背包实点显示白叶草 ×2 与图标；截图见 `docs/verification/assets/formal-n1-whiteleaf-backpack-desktop.png`。该内容尚未提交或发布。

## 完整生成提示词

> Create a NEW isolated White Leaf Herb inventory item icon by using supplied whiteleaf clearing scene as the botanical subject reference and supplied confirmed disciple portrait ONLY as the style reference. A small medicinal herb bunch: three to five broad pale ivory leaves with sage gray-green veins, a few muted green smaller leaves, short dark stems tied with a simple old-gold cord. Mature Chinese fantasy pixel art, same large coherent square-pixel clusters, restrained two-to-three-step flat material shading and dark charcoal outline as references. Strong distinct silhouette and readable at a final game UI display size of 48-56 pixels. Centered square composition with generous transparent margin, no soil, landscape, pot, plate, card frame, label, letters, numbers, glow, drop shadow, glossy 3D, smooth gradients or fine pixel noise. Genuine transparent alpha background. Use the clearing's white plants only for leaf shape/color, do not reproduce its background. Use the disciple only for pixel cluster density and palette, do not depict the person.
