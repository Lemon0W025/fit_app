# 养生庭院 + 扭蛋机 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打卡赚暖豆 → 扭蛋抽物品 → 摆进等距庭院 → 图鉴收集；节气限定。

**Architecture:** 规则全部在 `lib/shared/garden.js`（前后端共用）；`gardens` 文档新增 beans / inventory / placed / collected / gacha 字段；forest service 的 `syncDay` 负责按当天打卡记账，garden service 负责扭蛋与摆放（注入 `random`）。前端等距布局与点击反算在 `utils/iso.js`，纯函数可测。

**Tech Stack:** 同主项目；占位图用 Noto Color Emoji 烘焙（`scripts/draw-images.py`）。

## Global Constraints

- 数值：暖豆 0/10/20/40/50/60（空地→结果）；扭蛋 30 豆；新手礼 60 豆 + 一棵大树；稀有度 65/25/8/2；保底第 10 次；节气限定在稀有池权重 ×4；图鉴 ≥ 20 种扩成 8×8。
- 物品 id 稳定（存进数据库），图片路径 `/images/garden/items/<id>.png`。
- 豆子、扭蛋、摆放的校验全部在云函数；前端只做展示和动画。
- 移除树种：`forest.setSpecies`、解锁与庆祝弹窗、各树种图片。

## Interfaces

```js
// lib/shared/garden.js
RARITIES: [{ id, label, weight, color }]; ITEMS: [{ id, name, rarity, size: 's'|'m'|'l', emoji, term? , starter? }]
STAGE_BEANS, SPIN_COST = 30, WELCOME_BEANS = 60, PITY = 10, STARTER_ITEM = 'starter_tree'
itemById(id); beanBalance(garden) -> number; nextStageGain(stage) -> number
rollRarity(rand, sincePity) -> rarityId; pickItem(rarity, termId, rand) -> itemId
SOLAR_TERMS: [{ id, name, start }]; currentTerm(dateKey) -> { id, name, start } | null
gardenSize(collectedCount) -> 6 | 8

// lib/garden-state.js（仅云函数）
normalizeGarden(doc) -> 完整字段的 garden

// services/forest.js
syncDay(openid, date) -> { stage, beans }       // 取代 recordDay / pruneDay
today(openid, date, meals) -> { date, stage, stageLabel, hint, streak, totalTrees, beansToday, beans }
get(openid, { month }) -> 日历（无树种字段）

// services/garden.js
createGardenService({ repo, now, random })
get(openid) -> view；spin(openid) -> { itemId, rarity, isNew, beans, pityLeft, collectedCount, size }
place(openid, { itemId, c, r }) / move(openid, { uid, c, r }) / stash(openid, { uid }) -> view
view = { beans, size, placed, inventory: [{ itemId, count }], collected, collectedCount, totalCount,
         spinCost, pityLeft, rates, term, welcome }

// miniprogram/utils/iso.js
isoLayout(size, width) -> { size, tileW, tileH, top, originX, landHeight, height }
tileCenter(c, r, layout) -> { x, y }; tileAt(x, y, layout) -> { c, r } | null

// miniprogram/utils/garden-view.js
itemImage(id); buildScene(placed, layout) -> sprites（含 left/top/width/z）; inventoryList(inventory); collectionGroups(collected)
```

### Task 1: shared/garden.js + 节气表
- [ ] 测试：物品 id 唯一、各稀有度数量 15/15/9/4、5 件节气限定都对应节气；beanBalance；nextStageGain；rollRarity 边界（rand 0 / 0.649 / 0.65 / 0.899 / 0.9 / 0.979 / 0.98）与保底；pickItem 节气加权与非当季排除；currentTerm 边界；gardenSize。
- [ ] 实现 → 复制到 miniprogram → 通过 → commit。

### Task 2: forest 重构（去树种、syncDay 记豆）
- [ ] 更新 forest.test / services-forest / services-meal / services-day / router / e2e：去掉树种断言，新增 syncDay、beansToday、tree.beans。
- [ ] 实现 → 通过 → commit。

### Task 3: garden service + 路由 + e2e
- [ ] 测试：首次 get 发新手礼且只发一次；spin 扣豆、进背包、新物品、保底计数、余额不足 NO_BEANS；place 越界/占用/背包不足；move；stash；集齐 20 种扩地；e2e 打卡 → 扭蛋 → 摆放。
- [ ] 实现 → 通过 → commit。

### Task 4: 前端工具 + 占位图
- [ ] iso / garden-view 测试 → 实现。
- [ ] draw-images.py：物品占位图、地块 land-6/land-8、高亮格、扭蛋机、扭蛋、暖豆；树图去掉树种。

### Task 5: 页面
- [ ] garden（标签页）、gacha、collection；forest 改打卡日历；today 卡片与 meal 横幅加暖豆；app.json；pages 测试；截图检查 → commit。

### Task 6: 收尾
- [ ] README / CLAUDE.md；`npm test`、`node --check`；push；`wx:function` + `wx:preview`。
