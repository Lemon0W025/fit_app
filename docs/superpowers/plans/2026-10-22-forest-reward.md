# 养生森林 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每天根据正餐打卡长出一棵树，按月排成森林，累计种树解锁新树种。

**Architecture:** 树的阶段由 `shared/forest.js` 的纯函数从当天打卡记录实时算出；`gardens` 集合只存树种选择、每天的树种、解锁状态。新增 `forest` service，`meal`/`day` service 通过依赖注入调用它。前端新增「森林」标签页，今日页和餐详情页展示今日树。

**Tech Stack:** 同主项目（原生小程序、wx-server-sdk、node:test），树的图片用 PIL 生成。

## Global Constraints

- 规则与文案以 [设计文档](../specs/2026-10-22-forest-reward-design.md) 为准：阶段 `empty/sprout/small/big/bloom/fruit`，树种 `apple/orange/peach/pomegranate/persimmon/cherry`，解锁阈值 0/7/15/30/50/80。
- 只计正餐 `breakfast/lunch/dinner`，每种取 `createdAt` 最新的一条；失败打卡计入、无评级。
- `shared/forest.js` 两侧逐字节一致（已有 shared-sync 测试覆盖整个目录）。
- 树阶段不入库；`gardens` 用 `doc(openid).set` 整体写入。

## Interfaces

```js
// lib/shared/forest.js
STAGES, STAGE_LABELS, MAIN_MEALS, SPECIES: [{ id, name, unlockAt }], DEFAULT_SPECIES = 'apple'
dayTree(meals) -> { stage, logged: mealType[], missing: mealType[], greens }
treeHint(tree) -> string
streakFrom(days: { [date]: species }, today) -> number
unlockedFor(total) -> speciesId[]
nextUnlock(total) -> { id, name, remaining } | null
speciesName(id) -> string

// repo（真实与 fake 一致）
getGarden(openid) -> garden | null
saveGarden(openid, garden)
listMealsBetween(openid, startDate, endDate) -> meals（date、createdAt 升序）

// services/forest.js
createForestService({ repo, now }) -> {
  recordDay(openid, date) -> garden            // 当天首个正餐：记树种、检查解锁
  pruneDay(openid, date) -> void               // 当天已无正餐时删除
  today(openid, date, meals) -> { date, stage, stageLabel, species, speciesName, hint, streak, newlyUnlocked: [{id,name}] }
  get(openid, { month }) -> { month, prevMonth, nextMonth, firstWeekday, days: [{ date, day, stage, species, mealsCount, kcal }],
                              stats: { trees, fruits }, today, totalTrees, currentSpecies,
                              species: [{ id, name, unlockAt, unlocked }], nextUnlock }
  setSpecies(openid, { species }) -> { currentSpecies }
}
// meal.analyze / reanalyze 返回值增加 tree: { before, after, stageLabel, hint, species }
// day.get 返回值增加 tree（= forest.today）
// router: 'forest.get' -> forest.get, 'forest.setSpecies' -> forest.setSpecies
```

### Task 1: shared/forest.js

- [ ] 测试 `test/forest.test.js`：0–3 顿各阶段；3 顿绿色 0/1/2/3；同餐次多条取最新；加餐不计；失败打卡计入；各阶段提示语（树苗提示下一个没打的正餐名）；`streakFrom` 今天有树、今天没树算到昨天、中间断档、空；`unlockedFor(0/6/7/80)`；`nextUnlock(0)` 剩 7、`nextUnlock(80)` 为 null；`speciesName`。
- [ ] 实现 → 复制到 `miniprogram/utils/shared/` → `npm test` → commit。

### Task 2: repo + fake 支持

- [ ] fake-repo 增加 gardens 与 `listMealsBetween`；fake-cloud 的 db 支持 `command.gte/lte` 及 `.and()`。
- [ ] `repo.js` 实现三个方法（`_.gte(start).and(_.lte(end))`，limit 1000）。

### Task 3: forest service

- [ ] 测试 `test/services-forest.test.js`：recordDay 首次写入当前树种、重复调用不变；第 7 天解锁 orange 并进入 unseen；pruneDay 有/无正餐；today 返回阶段、提示、连续天数并清空 unseen（第二次调用为空）；get 默认本月、firstWeekday、未来日期为 `future`、每天 mealsCount/kcal、stats、prev/next 月（不超过本月）、非法 month BAD_REQUEST；setSpecies 未解锁 BAD_REQUEST、成功后今天的树种同步更新。
- [ ] 实现 → 通过 → commit。

### Task 4: meal / day / router 集成

- [ ] 测试：analyze 正餐返回 `tree.before/after`，并 recordDay；加餐不 recordDay 且 tree 不变；reanalyze 评级变化后 tree.after 变化；remove 最后一顿正餐后 pruneDay；day.get 含 tree；router 两个新 action；e2e 增加森林流程。
- [ ] 实现 → `index.js` 注入 forest → 通过 → commit。

### Task 5: 美术与页面

- [ ] PIL 生成 `miniprogram/images/forest/*.png`（empty、sprout、small、big-*、bloom-*、fruit-*）与 `tab-forest(-on).png`；预览检查。
- [ ] `utils/view.js` 增加 `treeImage(stage, species)`；测试。
- [ ] 新页面 `pages/forest`；`app.json` 加 tab；今日页树卡片 + 解锁弹窗；checkin 把 `tree` 放进 `getApp().globalData.lastTree`；餐详情页成长横幅；pages 测试覆盖。
- [ ] 浏览器渲染截图检查 → commit。

### Task 6: 收尾

- [ ] README 功能与目录更新；`npm test` 全绿；`node --check`；push。
