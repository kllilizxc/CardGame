# 雾林狐爷爷立绘 · 候选 v1

状态：`candidate`。Codex 内置 imagegen 按已确认的问心大像素风格生成；已在隔离确切试玩候选中核验桌面和 390px 手机画面，尚未获用户确认或采用到正式游戏。用途是剧情对白中由稳定人物 ID `npc.qa-fog-fox` 引用的透明人物立绘，不改变人物身份揭示、玩法或对话。

| 项目 | 值 |
| --- | --- |
| 原图 | `n1-fox-physician-portrait-v1.png` |
| SHA-256 | `5030978a64af28653e1551d9a32046f1335f7479d0c5263cc1c4f400e8ed14f1` |
| 尺寸 | 1024 × 1536 RGBA；四角 alpha 为 0 |
| 候选目标 | `public/assets/story/qa-fog/fox-physician-v1.png` |
| 参考风格 | `game-asset-production/references/wenxin.md` v1，`disciple-reference-v2.png`，SHA-256 `df9aa0963b43ff13089bfc29201664f19f5503e0a7cad4d54aba9dc3e0f0f526` |
| 对照角色 | CardGame `public/assets/wenxin/series-fox.png`，SHA-256 `c89abef8bb94dd07096a12db2b3ec37e85f297426286afa6dfdfbcc0e8cf`；仅核对色块与世界视觉关系，未作为 imagegen 的编辑目标 |
| 运行时 | Phaser 以最近邻采样，人物目录 `portraitAsset` 按说话者 ID 选择；暂不添加独立动画帧 |

原图自检：灰绿、暖麻布、炭色与旧金的大像素簇和已有弟子样张接近；老人面容、药囊与银针盒有辨识度，狐的身份没有耳尾等直接剧透。确切候选 `story-5b8fd73c8d4b57c8166d32c2950849b4d902`（提交 `f6c1b140bde457acfcf9e622241b35c209c6d8cf`）的六项试玩检查通过；桌面可见全身立绘，390px 手机可见页眉小立绘，切到玩家对白时隐藏、NPC 再发言时恢复，下一场景能收起。实机缩小后银针盒细节不够醒目，仍可辨认医者轮廓。缺图回退和多角色同屏未实测；正式 N1 内容尚未采用本素材。

## 完整生成提示词

> Use case: style-transfer. Asset type: transparent full-body story character portrait for a Chinese xianxia pixel-art game, displayed beside a dialogue panel. Edit the supplied confirmed disciple reference into a NEW, clearly different elderly herbal physician called Fox Grandfather. Preserve ONLY the reference's large coherent square-pixel clusters, low detail density, calm flat two-to-three-step shading, outline weight, mature six-to-six-and-a-half-head figure proportions, and muted sage green, warm linen, charcoal blue and old-gold color language. Replace the young disciple completely: an elderly human man with a weathered gentle face, gray hair tied low, short gray beard, modest moss-green and warm-linen physician robes, a worn herb satchel and a small closed silver-needle case held near his waist. His concealed fox identity should remain a subtle story secret: no visible fox ears, tail, glowing eyes or overt animal traits; at most a tiny fox-shaped clasp that is not obvious at game size. Quiet observant expression, slightly tired from illness. Full figure from head to feet, body and both hands visible, front three-quarter view facing slightly right, enough empty transparent margin around all edges for crop and idle motion. Genuine alpha transparency; no background, floor, cast shadow, frame, card, UI, caption, letters, watermark, loose props or second figure. Hard pixel edges only, no smooth gradients, painterly blending, soft focus, glossy 3D, fine hair strands, ornate embroidery, childish proportions, or dense tiny-pixel noise.
