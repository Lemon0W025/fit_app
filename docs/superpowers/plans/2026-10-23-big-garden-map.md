# 大地图庭院 + 去掉每日的树 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 庭院变成撑满屏幕、可拖动缩放的 3×3 块大地图，花暖豆开荒扩建；界面上去掉「每日的树」，改成早 / 午 / 晚打卡印章 + 暖豆。

**Architecture:** 云函数：`shared/forest.js` 出印章和暖豆提示，`shared/garden.js` 出地图 / 开荒规则，`services/garden.js` 新增 `expand` 并只允许在开垦的地上摆；小程序：新 `utils/world.js` 负责大地图布局和点按换算，庭院页用 `movable-area` / `movable-view` 做拖动缩放，`garden-life` 让动物只在开垦的地上走。

**Tech Stack:** 微信小程序原生（WXML/WXSS/CommonJS）、微信云开发、node:test、Python + Pillow（画图脚本）。

## Global Constraints

- 设计文档：`docs/superpowers/specs/2026-10-23-big-garden-map-design.md`
- `cloudfunctions/api/lib/shared/*` 改完立即 `cp` 到 `miniprogram/utils/shared/`（逐字节一致，有测试）
- 云函数响应 `{ ok, data }` / `{ ok: false, code, message }`，message 中文
- 每个任务结束：`npm test` 全绿、改过的 JS `node --check`；提交信息结尾 `<trailer>` = 两行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 和 `Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv`
- 地图：3×3 块、每块 6×6 格（共 18×18）；中间块 `"1,1"`；开荒价 `100 + 50 × (已开垦块数 − 1)`
- 开荒文案：「暖豆不够啦，开荒要 X 暖豆，再攒攒」「要挨着已经开垦的地才能开荒」「这块地已经开垦过了」「这块地不在庭院里」「这块地还没开荒呢」
- 暖豆规则不变（`STAGE_BEANS`），界面上不出现「树」

---

### Task 1: 每日暖豆：印章、提示语，服务端去掉「树」

**Files:**
- Modify: `cloudfunctions/api/lib/shared/forest.js`（复制到 `miniprogram/utils/shared/forest.js`）
- Modify: `cloudfunctions/api/services/forest.js`、`services/meal.js`、`services/day.js`
- Test: `test/forest.test.js`、`test/services-forest.test.js`、`test/services-meal.test.js`、`test/services-day.test.js`、`test/cloud-e2e.test.js`

**Interfaces:**
- Produces:
  - `mealStamps(meals) → [{ mealType, label: '早'|'午'|'晚', state: 'green'|'yellow'|'red'|'done'|'none' }]`（固定 3 个，早午晚顺序）
  - `beansHint(tree) → string`（`tree` 是 `dayTree()` 的返回）
  - `forest.today(...) → { date, stamps, beansToday, nextGain, hint, streak, beans }`
  - `forest.get(...)` → `days: [{ date, day, future, stamps, beans, mealsCount, kcal }]`、`stats: { days, beans }`、`today`、`totalDays`
  - `meal.analyze / reanalyze` 响应字段 `gain: { beans, beansToday, hint, stamps } | null`（替代 `tree`）
  - `day.get` 响应字段 `daily`（替代 `tree`，形状同 `forest.today`）
  - 删除：`STAGE_LABELS`、`treeHint`

- [ ] **Step 1: 改写 `test/forest.test.js`**

顶部解构改成 `STAGES, dayTree, mealStamps, beansHint, streakFrom`；「阶段常量」测试删掉 `STAGE_LABELS` 那行；两个 `treeHint` 测试替换为：

```js
test('beansHint：每一档告诉下一步能得多少暖豆', () => {
  assert.equal(beansHint(dayTree([])), '打卡一顿正餐就能得 10 暖豆')
  assert.equal(beansHint(dayTree([meal('breakfast')])), '再打卡午餐还能得 10 暖豆')
  assert.equal(beansHint(dayTree([meal('breakfast'), meal('lunch')])), '再打卡晚餐还能得 20 暖豆')
  assert.equal(beansHint(dayTree([meal('breakfast'), meal('lunch'), meal('dinner')])), '三顿都打卡啦！明天多吃绿色的，暖豆更多')
  assert.equal(beansHint(dayTree([meal('breakfast', 'green'), meal('lunch', 'green'), meal('dinner')])), '真棒！明天三顿都吃成绿色，能拿满 60 暖豆')
  assert.equal(beansHint(dayTree([meal('breakfast', 'green'), meal('lunch', 'green'), meal('dinner', 'green')])), '三顿都吃得好，今天的暖豆拿满啦！')
})

test('beansHint：优先提示还没到的下一顿', () => {
  assert.equal(beansHint(dayTree([meal('lunch')])), '再打卡晚餐还能得 10 暖豆')
  assert.equal(beansHint(dayTree([meal('dinner')])), '再打卡早餐还能得 10 暖豆')
  assert.equal(beansHint(dayTree([meal('breakfast'), meal('dinner')])), '再打卡午餐还能得 20 暖豆')
})

test('mealStamps：早午晚三个印章，取每餐最新一次', () => {
  assert.deepEqual(mealStamps([]).map((s) => [s.label, s.state]), [['早', 'none'], ['午', 'none'], ['晚', 'none']])
  assert.deepEqual(mealStamps(undefined).length, 3)
  const stamps = mealStamps([
    meal('breakfast', 'red'),
    meal('breakfast', 'green'),
    meal('lunch', 'yellow', { status: 'failed', analysis: null }),
    meal('snack', 'red'),
  ])
  assert.deepEqual(stamps, [
    { mealType: 'breakfast', label: '早', state: 'green' },
    { mealType: 'lunch', label: '午', state: 'done' },
    { mealType: 'dinner', label: '晚', state: 'none' },
  ])
})
```

- [ ] **Step 2: 改写服务层测试**

`test/services-forest.test.js` 里 `today` 两个测试和 `get` 两个测试替换为：

```js
test('today：今天的印章、暖豆、提示和连续天数', async () => {
  const { repo, forest } = setup()
  for (let i = 3; i >= 1; i--) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
  await addMeal(repo, TODAY, 'breakfast', 'green')
  await addMeal(repo, TODAY, 'lunch', 'green')
  await forest.syncDay('u1', TODAY)
  const view = await forest.today('u1', TODAY, await repo.listMeals('u1', TODAY))
  assert.deepEqual(view.stamps.map((s) => s.state), ['green', 'green', 'none'])
  assert.equal(view.hint, '再打卡晚餐还能得 20 暖豆')
  assert.equal(view.beansToday, 20)
  assert.equal(view.nextGain, 20)
  assert.equal(view.streak, 4)
  assert.equal(view.beans, 50)
  assert.equal(view.stage, undefined)
})

test('today：还没有花园时也能返回，余额不显示负数', async () => {
  const { repo, forest } = setup()
  const empty = await forest.today('u1', TODAY, [])
  assert.equal(empty.beansToday, 0)
  assert.deepEqual(empty.stamps.map((s) => s.state), ['none', 'none', 'none'])
  assert.equal(empty.streak, 0)
  assert.equal(empty.beans, 0)
  await repo.saveGarden('u1', { beans: { earned: {}, bonus: 0, spent: 30 } })
  assert.equal((await forest.today('u1', TODAY, [])).beans, 0)
})

test('get：本月日历，每天的印章和暖豆，未来日期标 future', async () => {
  const { repo, forest } = setup()
  for (const t of ['breakfast', 'lunch', 'dinner']) await addMeal(repo, '2026-10-20', t, 'green', 400)
  await addMeal(repo, '2026-10-21', 'lunch')
  await addMeal(repo, '2026-10-21', 'snack', 'red', 200)
  await addMeal(repo, TODAY, 'breakfast')
  await addMeal(repo, TODAY, 'lunch')
  await addMeal(repo, '2026-09-30', 'lunch')
  for (const d of ['2026-10-20', '2026-10-21', TODAY]) await forest.syncDay('u1', d)

  const view = await forest.get('u1', {})
  assert.equal(view.month, '2026-10')
  assert.equal(view.monthLabel, '2026年10月')
  assert.equal(view.firstWeekday, 4)
  assert.equal(view.days.length, 31)
  assert.deepEqual(view.days[19], {
    date: '2026-10-20',
    day: 20,
    future: false,
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green' },
      { mealType: 'lunch', label: '午', state: 'green' },
      { mealType: 'dinner', label: '晚', state: 'green' },
    ],
    beans: 60,
    mealsCount: 3,
    kcal: 1200,
  })
  assert.deepEqual(view.days[20].stamps.map((s) => s.state), ['none', 'yellow', 'none'])
  assert.equal(view.days[20].beans, 10)
  assert.equal(view.days[20].mealsCount, 2)
  assert.equal(view.days[21].beans, 20)
  assert.equal(view.days[0].beans, 0)
  assert.equal(view.days[0].future, false)
  assert.equal(view.days[22].future, true)
  assert.deepEqual(view.days[22].stamps, [])
  assert.deepEqual(view.stats, { days: 3, beans: 90 })
  assert.equal(view.prevMonth, '2026-09')
  assert.equal(view.nextMonth, null)
  assert.equal(view.today.beansToday, 20)
  assert.equal(view.today.streak, 3)
  assert.equal(view.totalDays, 3)
})

test('get：查看过去的月份', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, '2026-09-30', 'lunch')
  await forest.syncDay('u1', '2026-09-30')
  const view = await forest.get('u1', { month: '2026-09' })
  assert.equal(view.days.length, 30)
  assert.equal(view.days[29].beans, 10)
  assert.equal(view.firstWeekday, 2)
  assert.equal(view.nextMonth, '2026-10')
  assert.equal(view.today.date, TODAY)
})
```

`test/services-day.test.js` 的「get：带上今天的树」替换为：

```js
test('get：带上今天的暖豆和印章', async () => {
  const { repo, service } = setup()
  await seedMeals(repo)
  const day = await service.get('u1', {})
  assert.equal(day.tree, undefined)
  assert.deepEqual(day.daily.stamps.map((s) => s.state), ['green', 'yellow', 'none'])
  assert.equal(day.daily.hint, '再打卡晚餐还能得 20 暖豆')
  assert.equal(day.daily.beansToday, 20)
  assert.equal(day.daily.nextGain, 20)
})
```

`test/services-meal.test.js`：两处 `const { tree, arrival, ...stored } = meal` 改成 `const { gain, arrival, ...stored } = meal`，其中第一处下一行 `assert.equal(tree.after, 'sprout')` 改成 `assert.equal(gain.beans, 10)`、注释改成「gain 只在响应里给页面做反馈，不存库」。四个树相关测试（「analyze 正餐：返回今天的树变化…」「analyze 加餐：不影响树…」「analyze：失败的打卡也让树长大」「reanalyze：评级变绿后今天的树开花变结果」）替换为：

```js
test('analyze 正餐：返回这次多得的暖豆和今天的印章，并记下当天暖豆', async () => {
  const { repo, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'breakfast', note: '小米粥' })
  assert.deepEqual(meal.gain, {
    beans: 10,
    beansToday: 10,
    hint: '再打卡午餐还能得 10 暖豆',
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green' },
      { mealType: 'lunch', label: '午', state: 'none' },
      { mealType: 'dinner', label: '晚', state: 'none' },
    ],
  })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 10 })
})

test('analyze 加餐：不算暖豆', async () => {
  const { repo, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'snack', note: '一个苹果' })
  assert.equal(meal.gain, null)
  assert.equal(await repo.getGarden('u1'), null)
})

test('analyze：失败的打卡也算打卡，印章是灰的', async () => {
  const { service } = setup({ results: [new Error('down')] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch' })
  assert.equal(meal.status, 'failed')
  assert.equal(meal.gain.beans, 10)
  assert.equal(meal.gain.stamps[1].state, 'done')
})

test('reanalyze：评级变绿后暖豆拿满', async () => {
  const { repo, service } = setup({ results: [new Error('down'), analysisJson({ rating: 'green' })] })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'breakfast', status: 'done', analysis: { rating: 'green', totalKcal: 200 }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', status: 'done', analysis: { rating: 'green', totalKcal: 500 }, createdAt: 2 })
  const failed = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner' })
  assert.equal(failed.gain.beans, 30)
  assert.equal(failed.gain.beansToday, 50)

  const meal = await service.reanalyze('u1', { mealId: failed._id, note: '清蒸鱼和青菜' })
  assert.equal(meal.gain.beans, 10)
  assert.equal(meal.gain.beansToday, 60)
  assert.equal(meal.gain.hint, '三顿都吃得好，今天的暖豆拿满啦！')
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 60 })
})
```

`test/cloud-e2e.test.js` 的「养生森林：…」测试改名为「每日暖豆：三顿全绿拿满、日历印章、删除后回退」，其中：

```js
  const beans = []
  const ids = []
  for (const mealType of ['breakfast', 'lunch', 'dinner']) {
    const res = await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
    assert.equal(res.ok, true, res.message)
    beans.push(res.data.gain.beans)
    ids.push(res.data._id)
  }
  assert.deepEqual(beans, [10, 10, 40])
```

（删掉 `stages` 数组及其断言）；`forest.get` 那段断言改成：

```js
  const forest = await main({ action: 'forest.get' })
  assert.equal(forest.ok, true, forest.message)
  assert.equal(forest.data.today.beansToday, 60)
  assert.equal(forest.data.today.streak, 1)
  assert.equal(forest.data.today.beans, 60)
  assert.equal(forest.data.days.find((d) => d.date === today).beans, 60)
  assert.deepEqual(forest.data.stats, { days: 1, beans: 60 })

  const day = await main({ action: 'day.get' })
  assert.equal(day.data.daily.beansToday, 60)
  assert.deepEqual(day.data.daily.stamps.map((s) => s.state), ['green', 'green', 'green'])
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/forest.test.js test/services-forest.test.js test/services-meal.test.js test/services-day.test.js test/cloud-e2e.test.js`
Expected: FAIL（`beansHint is not a function` 等）

- [ ] **Step 4: 实现 `shared/forest.js`**（整份替换，然后 `cp` 到 `miniprogram/utils/shared/forest.js`）

```js
// 与 miniprogram/utils/shared/forest.js 保持一致（test/shared-sync.test.js 会检查）
// 每天的打卡档位：由当天三顿正餐的打卡情况决定当天得多少暖豆；界面上显示成早 / 午 / 晚三个印章

const { addDays } = require('./date')
const { MEAL_LABELS } = require('./meal-types')
const { STAGE_BEANS, nextStageGain } = require('./garden')

const STAGES = ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit']

// 加餐照常打卡点评，但不算进每天的暖豆：既不因零食受罚，也不会为了暖豆多吃一顿
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']
const STAMP_LABELS = { breakfast: '早', lunch: '午', dinner: '晚' }

// 每种正餐取最新的一条（重拍、重新打卡以最后一次为准）
function latestMainMeals(meals) {
  const latest = {}
  ;(meals || []).forEach((m) => {
    if (MAIN_MEALS.indexOf(m.mealType) === -1) return
    if (!latest[m.mealType] || m.createdAt > latest[m.mealType].createdAt) latest[m.mealType] = m
  })
  return latest
}

function dayTree(meals) {
  const latest = latestMainMeals(meals)
  const logged = MAIN_MEALS.filter((t) => latest[t])
  const missing = MAIN_MEALS.filter((t) => !latest[t])
  // 分析失败的打卡也算打卡了，只是没有评级
  const greens = logged.filter((t) => {
    const m = latest[t]
    return m.status === 'done' && m.analysis && m.analysis.rating === 'green'
  }).length

  let stage = 'empty'
  if (logged.length === 1) stage = 'sprout'
  else if (logged.length === 2) stage = 'small'
  else if (logged.length === 3) stage = greens === 3 ? 'fruit' : greens === 2 ? 'bloom' : 'big'

  return { stage, logged, missing, greens }
}

// 早 / 午 / 晚三个印章：评级的颜色；分析失败但打了卡是 done；没打卡是 none
function mealStamps(meals) {
  const latest = latestMainMeals(meals)
  return MAIN_MEALS.map((t) => {
    const m = latest[t]
    let state = 'none'
    if (m) state = m.status === 'done' && m.analysis && m.analysis.rating ? m.analysis.rating : 'done'
    return { mealType: t, label: STAMP_LABELS[t], state }
  })
}

// 提示还没打卡的下一顿：优先选比已打卡餐次更晚的
function nextMissingMeal(tree) {
  const lastIndex = Math.max(-1, ...tree.logged.map((t) => MAIN_MEALS.indexOf(t)))
  const later = tree.missing.filter((t) => MAIN_MEALS.indexOf(t) > lastIndex)
  return later[0] || tree.missing[0]
}

function beansHint(tree) {
  switch (tree.stage) {
    case 'empty':
      return `打卡一顿正餐就能得 ${STAGE_BEANS.sprout} 暖豆`
    case 'sprout':
    case 'small':
      return `再打卡${MEAL_LABELS[nextMissingMeal(tree)]}还能得 ${nextStageGain(tree.stage)} 暖豆`
    case 'big':
      return '三顿都打卡啦！明天多吃绿色的，暖豆更多'
    case 'bloom':
      return `真棒！明天三顿都吃成绿色，能拿满 ${STAGE_BEANS.fruit} 暖豆`
    default:
      return '三顿都吃得好，今天的暖豆拿满啦！'
  }
}

// days：{ 'YYYY-MM-DD': true }，有正餐打卡的日子
// 今天还没打卡时算到昨天为止，今天还有机会续上
function streakFrom(days, today) {
  const has = (d) => !!(days && days[d])
  let d = has(today) ? today : addDays(today, -1)
  let count = 0
  while (has(d)) {
    count += 1
    d = addDays(d, -1)
  }
  return count
}

module.exports = {
  STAGES,
  MAIN_MEALS,
  dayTree,
  mealStamps,
  beansHint,
  streakFrom,
}
```

- [ ] **Step 5: 实现服务层**

`services/forest.js`：第 5 行 import 改成 `const { dayTree, mealStamps, beansHint, streakFrom } = require('../lib/shared/forest')`；`todayView` 改成：

```js
  async function todayView(openid, date, meals, garden) {
    const tree = dayTree(meals)
    return {
      date,
      stamps: mealStamps(meals),
      beansToday: STAGE_BEANS[tree.stage],
      nextGain: nextStageGain(tree.stage),
      hint: beansHint(tree),
      streak: streakFrom(garden.days, dateKey(now())),
      beans: Math.max(0, beanBalance(garden)),
    }
  }
```

`syncDay` 的注释改成「打卡新增、重新分析、删除之后调用：按这一天的正餐重算当天的暖豆，重复调用结果不变」；`get` 的注释改成「打卡日历：按月显示每天的印章和暖豆」，循环体和返回值改成：

```js
      const days = []
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const meals = byDate[date] || []
        const future = date > today
        days.push({
          date,
          day: Number(date.slice(8)),
          future,
          stamps: future ? [] : mealStamps(meals),
          beans: future ? 0 : STAGE_BEANS[dayTree(meals).stage],
          mealsCount: meals.length,
          kcal: sumMeals(meals).kcal,
        })
      }

      const todayMeals = month === currentMonth ? byDate[today] || [] : await repo.listMeals(openid, today)
      const [y, m] = month.split('-').map(Number)
      return {
        month,
        monthLabel: `${y}年${m}月`,
        prevMonth: shiftMonth(month, -1),
        nextMonth: month < currentMonth ? shiftMonth(month, 1) : null,
        firstWeekday: new Date(Date.UTC(y, m - 1, 1)).getUTCDay(),
        days,
        stats: {
          days: days.filter((d) => d.beans > 0).length,
          beans: days.reduce((sum, d) => sum + d.beans, 0),
        },
        today: await todayView(openid, today, todayMeals, garden),
        totalDays: Object.keys(garden.days).length,
      }
```

`services/meal.js`：第 7、8 行 import 改成

```js
const { MAIN_MEALS, dayTree, mealStamps, beansHint } = require('../lib/shared/forest')
const { STAGE_BEANS } = require('../lib/shared/garden')
```

`treeChange` 整个替换为：

```js
// 这次打卡前后今天的暖豆变了多少，给打卡结果页做即时反馈
function beansChange(beforeMeals, afterMeals) {
  const before = dayTree(beforeMeals)
  const after = dayTree(afterMeals)
  return {
    beans: STAGE_BEANS[after.stage] - STAGE_BEANS[before.stage],
    beansToday: STAGE_BEANS[after.stage],
    hint: beansHint(after),
    stamps: mealStamps(afterMeals),
  }
}
```

`analyze` 末尾：

```js
      // 只有正餐算暖豆、引来小动物，加餐不算
      let gain = null
      let arrival = null
      if (isMainMeal(src.mealType)) {
        await forest.syncDay(openid, date)
        gain = beansChange(meals, meals.concat(saved))
        arrival = await garden.arrive(openid)
      }
      return { ...saved, gain, arrival }
```

`reanalyze` 末尾：

```js
      let gain = null
      if (isMainMeal(meal.mealType)) {
        await forest.syncDay(openid, meal.date)
        gain = beansChange(meals, meals.map((m) => (m._id === meal._id ? updated : m)))
      }
      return { ...updated, gain }
```

`services/day.js`：`tree: await forest.today(openid, date, meals),` 改成 `daily: await forest.today(openid, date, meals),`。

- [ ] **Step 6: 跑测试**

Run: `cp cloudfunctions/api/lib/shared/forest.js miniprogram/utils/shared/forest.js && node --test test/forest.test.js test/services-forest.test.js test/services-meal.test.js test/services-day.test.js test/cloud-e2e.test.js test/shared-sync.test.js`
Expected: PASS。`npm test` 里页面测试此时会因为 `tree` / `STAGE_LABELS` 失败——属于 Task 2，先不提交，直接做 Task 2。

---

### Task 2: 小程序：今日页、结果页、打卡日历换成印章 + 暖豆，删掉树的图

**Files:**
- Modify: `miniprogram/utils/view.js`、`miniprogram/app.js`、`miniprogram/app.wxss`
- Modify: `miniprogram/pages/today/*`、`pages/meal/*`、`pages/checkin/checkin.js`、`pages/forest/*`、`pages/garden/garden.wxml`（打卡日历按钮图标）
- Modify: `scripts/draw-images.py`、`scripts/slice-art.py`
- Delete: `miniprogram/images/forest/`
- Test: `test/view.test.js`、`test/pages.test.js`、`test/helpers/page-harness.js`

**Interfaces:**
- Consumes: Task 1 的 `daily`、`gain`、`stamps`
- Produces: `view.js` 导出 `stampsView(stamps) → [{ key, label, cls }]`、`decorateGain(gain) → { title, hint, stamps } | null`、`beansCard(daily) → { title, hint, stamps, streakText } | null`、`buildCalendarCells(days, firstWeekday)`；删除 `treeImage / decorateTree / treeCard / buildForestCells`；`globalData.lastGain = { mealId, gain, arrival }`（替代 `lastTree`）；新图 `images/garden/ui/calendar.png`、`basket.png`、`home.png`（占位）

- [ ] **Step 1: 改写 `test/view.test.js` 的树相关测试**（文件末尾那段 `require` 和四个测试整体替换）

```js
const { stampsView, decorateGain, beansCard, buildCalendarCells } = require('../miniprogram/utils/view')

const STAMPS = [
  { mealType: 'breakfast', label: '早', state: 'green' },
  { mealType: 'lunch', label: '午', state: 'done' },
  { mealType: 'dinner', label: '晚', state: 'none' },
]

test('stampsView：印章的样式', () => {
  assert.deepEqual(stampsView(STAMPS), [
    { key: 'breakfast', label: '早', cls: 'stamp-green' },
    { key: 'lunch', label: '午', cls: 'stamp-done' },
    { key: 'dinner', label: '晚', cls: 'stamp-none' },
  ])
  assert.deepEqual(stampsView(undefined), [])
})

test('decorateGain：这次多得了暖豆就庆祝，没多得就说记下了', () => {
  const gain = decorateGain({ beans: 10, beansToday: 20, hint: '再打卡晚餐还能得 20 暖豆', stamps: STAMPS })
  assert.equal(gain.title, '+10 暖豆')
  assert.equal(gain.hint, '再打卡晚餐还能得 20 暖豆')
  assert.equal(gain.stamps.length, 3)
  assert.equal(decorateGain({ beans: 0, beansToday: 20, hint: 'x', stamps: STAMPS }).title, '这顿记下啦')
  assert.equal(decorateGain({ beans: -10, beansToday: 10, hint: 'x', stamps: STAMPS }).title, '这顿记下啦')
  assert.equal(decorateGain(null), null)
})

test('beansCard：今天的暖豆卡片', () => {
  const card = beansCard({ stamps: STAMPS, beansToday: 20, nextGain: 20, hint: '再打卡晚餐还能得 20 暖豆', streak: 3, beans: 85 })
  assert.equal(card.title, '今天得了 20 暖豆')
  assert.equal(card.hint, '再打卡晚餐还能得 20 暖豆')
  assert.equal(card.streakText, '🔥 已连续 3 天')
  assert.equal(card.stamps[0].cls, 'stamp-green')
  const empty = beansCard({ stamps: [], beansToday: 0, nextGain: 10, hint: '打卡一顿正餐就能得 10 暖豆', streak: 0, beans: 0 })
  assert.equal(empty.title, '今天还没打卡')
  assert.equal(empty.streakText, '')
  assert.equal(beansCard(null), null)
})

test('buildCalendarCells：周一开头的日历，每天印章和暖豆', () => {
  const days = [
    { date: '2026-10-01', day: 1, future: false, stamps: STAMPS, beans: 20, mealsCount: 2, kcal: 900 },
    { date: '2026-10-02', day: 2, future: false, stamps: [], beans: 0, mealsCount: 0, kcal: 0 },
    { date: '2026-10-03', day: 3, future: true, stamps: [], beans: 0, mealsCount: 0, kcal: 0 },
  ]
  // 2026-10-01 是周四（firstWeekday = 4），周一开头前面补 3 个空格
  const cells = buildCalendarCells(days, 4)
  assert.equal(cells.length, 6)
  assert.deepEqual(cells.slice(0, 3).map((c) => c.blank), [true, true, true])
  assert.equal(cells[3].day, 1)
  assert.equal(cells[3].beansText, '+20')
  assert.equal(cells[3].stamps[0].cls, 'stamp-green')
  assert.equal(cells[4].beansText, '')
  assert.equal(cells[5].future, true)
  assert.ok(cells.every((c) => c.key))
  assert.equal(buildCalendarCells(days, 0).filter((c) => c.blank).length, 6)
  assert.equal(buildCalendarCells(days, 1).filter((c) => c.blank).length, 0)
})
```

`test/pages.test.js`：
- 完整流程里详情页那三行改成 `assert.equal(meal.data.gain.title, '+10 暖豆')`、`assert.equal(meal.data.gain.stamps[1].cls, 'stamp-green')`；`assert.equal(wx.app.globalData.lastTree, null)` 改成 `lastGain`；重新分析后 `meal.data.tree.title` 那行改成 `assert.equal(meal.data.gain.title, '这顿记下啦')`；今日页三行改成：

```js
  assert.equal(today.data.daily.title, '今天得了 10 暖豆')
  assert.equal(today.data.daily.hint, '再打卡晚餐还能得 10 暖豆')
  assert.equal(today.data.daily.streakText, '🔥 已连续 1 天')
```

- 庭院页面测试末尾打卡日历两行改成：

```js
  assert.equal(calendar.data.daily.title, '今天得了 20 暖豆')
  assert.equal(calendar.data.view.totalDays, 1)
  assert.equal(calendar.data.view.stats.beans, 20)
  assert.ok(calendar.data.cells.find((c) => c.beansText === '+20'))
```

- 小动物页面测试里 `wx.app.globalData.lastTree.arrival` 改成 `wx.app.globalData.lastGain.arrival`。

`test/helpers/page-harness.js`：`app: { globalData: { lastTree: null } }` 改成 `app: { globalData: { lastGain: null } }`。

（如果完整流程用例里午餐的评级不是 `green`，按 `analysisJson` 的默认值调整第二个印章断言——默认是 `green`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/view.test.js test/pages.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 `utils/view.js`**

「养生森林」那一段（从 `// ---------------------------------------------------------------- 养生森林` 到 `buildForestCells` 结束）整体替换为：

```js
// ---------------------------------------------------------------- 每日暖豆

// 早 / 午 / 晚三个印章：cls 对应 app.wxss 里的颜色
function stampsView(stamps) {
  return (stamps || []).map((s) => ({ key: s.mealType, label: s.label, cls: `stamp-${s.state}` }))
}

// 打卡结果页：这次打卡多得了多少暖豆
function decorateGain(gain) {
  if (!gain) return null
  return {
    title: gain.beans > 0 ? `+${gain.beans} 暖豆` : '这顿记下啦',
    hint: gain.hint,
    stamps: stampsView(gain.stamps),
  }
}

// 今日页、打卡日历顶部的「今天的暖豆」卡片
function beansCard(daily) {
  if (!daily) return null
  return {
    title: daily.beansToday > 0 ? `今天得了 ${daily.beansToday} 暖豆` : '今天还没打卡',
    hint: daily.hint,
    stamps: stampsView(daily.stamps),
    streakText: daily.streak > 0 ? `🔥 已连续 ${daily.streak} 天` : '',
  }
}

// 打卡日历：周一开头，firstWeekday 是 1 号的星期（0 = 周日）
function buildCalendarCells(days, firstWeekday) {
  const blanks = (firstWeekday + 6) % 7
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push({ key: `blank-${i}`, blank: true })
  days.forEach((d) => {
    cells.push({ ...d, key: d.date, stamps: stampsView(d.stamps), beansText: d.beans > 0 ? `+${d.beans}` : '' })
  })
  return cells
}
```

`module.exports` 里 `treeImage, decorateTree, treeCard, buildForestCells` 换成 `stampsView, decorateGain, beansCard, buildCalendarCells`。

- [ ] **Step 4: 印章样式**（`miniprogram/app.wxss` 末尾追加）

```css
/* 早 / 午 / 晚打卡印章 */
.stamps {
  display: flex;
  gap: 12rpx;
  margin: 10rpx 0;
}

.stamp {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
  box-sizing: border-box;
  color: #fff;
}

.stamp-green {
  background: var(--green);
}

.stamp-yellow {
  background: var(--yellow);
}

.stamp-red {
  background: var(--red);
}

.stamp-done {
  background: var(--gray);
}

.stamp-none {
  border: 3rpx dashed var(--gray);
  color: var(--gray);
}

/* 日历格子里的小印章：只要颜色 */
.stamps-small {
  gap: 4rpx;
  justify-content: center;
  margin: 4rpx 0 0;
}

.stamps-small .stamp {
  width: 20rpx;
  height: 20rpx;
  font-size: 0;
  border-width: 2rpx;
}
```

- [ ] **Step 5: 今日页**

`today.js`：`treeCard` 换成 `beansCard`；data 里 `tree: null` 改成 `daily: null`；`tree: treeCard(day.tree),` 改成 `daily: beansCard(day.daily),`。

`today.wxml`：`<view wx:if="{{tree}}" class="card tree-card" ...>…</view>` 整块替换为：

```xml
    <view wx:if="{{daily}}" class="card beans-card" bindtap="goGarden">
      <image class="beans-card-icon" src="/images/garden/ui/bean.png" mode="aspectFit" />
      <view class="beans-card-body">
        <view class="beans-card-title">{{daily.title}}</view>
        <view class="stamps">
          <view wx:for="{{daily.stamps}}" wx:key="key" class="stamp {{item.cls}}">{{item.label}}</view>
        </view>
        <view class="beans-card-hint">{{daily.hint}}</view>
        <view wx:if="{{daily.streakText}}" class="beans-card-streak">{{daily.streakText}}</view>
      </view>
      <text class="beans-card-arrow">›</text>
    </view>
```

`today.wxss`：删掉 `.tree-card` 到 `.tree-card-arrow` 七条规则，换成：

```css
.beans-card {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: linear-gradient(90deg, #fff4e0 0%, #ffffff 80%);
}

.beans-card-icon {
  width: 110rpx;
  height: 110rpx;
  flex-shrink: 0;
}

.beans-card-body {
  flex: 1;
  margin-left: 16rpx;
  min-width: 0;
}

.beans-card-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #b8763a;
}

.beans-card-hint {
  font-size: 28rpx;
}

.beans-card-streak {
  font-size: 26rpx;
  color: var(--muted);
  margin-top: 4rpx;
}

.beans-card-arrow {
  font-size: 44rpx;
  color: var(--gray);
  margin-left: 8rpx;
}
```

- [ ] **Step 6: 打卡页与结果页**

`miniprogram/app.js`：`globalData` 里的 `lastTree: null` 改成 `lastGain: null`。

`checkin.js`：`getApp().globalData.lastTree = { mealId: meal._id, tree: meal.tree, arrival: meal.arrival }` 改成 `getApp().globalData.lastGain = { mealId: meal._id, gain: meal.gain, arrival: meal.arrival }`。

`meal.js`：import 改成 `const { decorateMeal, decorateGain } = require('../../utils/view')`；data 里 `tree: null` 改成 `gain: null`；`onLoad` 里那段改成：

```js
    // 刚打完卡跳过来时，告诉妈妈这次得了多少暖豆、有没有小动物搬来
    const app = getApp()
    const last = app.globalData.lastGain
    if (last && last.mealId === options.id) {
      this.setData({ gain: decorateGain(last.gain), arrival: arrivalCard(last.arrival) })
      app.globalData.lastGain = null
    }
```

`reanalyze` 里 `tree: decorateTree(meal.tree)` 改成 `gain: decorateGain(meal.gain)`。

`meal.wxml`：树横幅（`<view wx:if="{{tree}}" class="card tree-banner" …>…</view>`）替换为：

```xml
  <view wx:if="{{gain}}" class="card gain-banner" bindtap="goGarden">
    <image class="gain-icon" src="/images/garden/ui/bean.png" mode="aspectFit" />
    <view class="gain-body">
      <view class="gain-title">{{gain.title}}</view>
      <view class="stamps">
        <view wx:for="{{gain.stamps}}" wx:key="key" class="stamp {{item.cls}}">{{item.label}}</view>
      </view>
      <view class="gain-hint">{{gain.hint}}</view>
    </view>
  </view>
```

`meal.wxss`：删掉 `.tree-banner` 到 `.tree-banner-hint` 五条规则，换成：

```css
.gain-banner {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: linear-gradient(90deg, #fff4e0 0%, #ffffff 80%);
}

.gain-icon {
  width: 110rpx;
  height: 110rpx;
  flex-shrink: 0;
}

.gain-body {
  flex: 1;
  margin-left: 16rpx;
}

.gain-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #d97a1e;
}

.gain-hint {
  font-size: 28rpx;
}
```

- [ ] **Step 7: 打卡日历**

`forest.js` 整份替换为：

```js
const api = require('../../utils/api')
const { beansCard, buildCalendarCells } = require('../../utils/view')

Page({
  data: {
    loaded: false,
    month: '',
    view: null,
    daily: null,
    cells: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
  },

  onShow() {
    this.load(this.data.month)
  },

  load(month) {
    return api.call('forest.get', month ? { month } : {})
      .then((view) => {
        this.setData({
          loaded: true,
          month: view.month,
          view: {
            monthLabel: view.monthLabel,
            prevMonth: view.prevMonth,
            nextMonth: view.nextMonth,
            stats: view.stats,
            totalDays: view.totalDays,
          },
          daily: beansCard(view.today),
          cells: buildCalendarCells(view.days, view.firstWeekday),
        })
      })
      .catch((err) => api.showError(err))
  },

  prevMonth() {
    if (this.data.view && this.data.view.prevMonth) this.load(this.data.view.prevMonth)
  },

  nextMonth() {
    if (this.data.view && this.data.view.nextMonth) this.load(this.data.view.nextMonth)
  },

  openDay(e) {
    const cell = this.data.cells.find((c) => c.key === e.currentTarget.dataset.key)
    if (!cell || cell.blank || cell.future) return
    let content = '这天没有打卡'
    if (cell.mealsCount) {
      content = `打卡 ${cell.mealsCount} 顿 · 约 ${cell.kcal} 千卡`
      if (cell.beans) content += ` · 得了 ${cell.beans} 暖豆`
    }
    wx.showModal({
      title: `${Number(cell.date.slice(5, 7))}月${cell.day}日`,
      content,
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
```

`forest.wxml` 整份替换为：

```xml
<view wx:if="{{!loaded}}" class="empty">正在翻打卡日历…</view>

<view class="page" wx:if="{{loaded}}">
  <view class="card today-card">
    <view class="today-title">{{daily.title}}</view>
    <view class="stamps today-stamps">
      <view wx:for="{{daily.stamps}}" wx:key="key" class="stamp {{item.cls}}">{{item.label}}</view>
    </view>
    <view class="today-hint">{{daily.hint}}</view>
    <view class="today-stats">
      <text wx:if="{{daily.streakText}}" class="today-stat">{{daily.streakText}}</text>
      <text class="today-stat">📅 累计打卡 {{view.totalDays}} 天</text>
    </view>
  </view>

  <view class="card">
    <view class="month-bar">
      <text class="month-arrow" bindtap="prevMonth">‹</text>
      <text class="month-label">{{view.monthLabel}}</text>
      <text class="month-arrow {{view.nextMonth ? '' : 'month-arrow-off'}}" bindtap="nextMonth">›</text>
    </view>
    <view class="weekdays">
      <text wx:for="{{weekdays}}" wx:key="*this" class="weekday">{{item}}</text>
    </view>
    <view class="grid">
      <view wx:for="{{cells}}" wx:key="key" class="cell {{item.future ? 'cell-future' : ''}}" data-key="{{item.key}}" bindtap="openDay">
        <block wx:if="{{!item.blank}}">
          <view class="cell-day">{{item.day}}</view>
          <view class="stamps stamps-small">
            <view wx:for="{{item.stamps}}" wx:for-item="stamp" wx:key="key" class="stamp {{stamp.cls}}"></view>
          </view>
          <view class="cell-beans">{{item.beansText}}</view>
        </block>
      </view>
    </view>
    <view class="month-stats">这个月打卡 {{view.stats.days}} 天，得了 {{view.stats.beans}} 暖豆</view>
  </view>
</view>
```

`forest.wxss`：删掉 `.today-tree`、`.today-image`、`.cell-image`、`.cell-future` 四条规则；`.today-title` 前加：

```css
.today-card {
  text-align: center;
  background: linear-gradient(180deg, #fff4e0 0%, #ffffff 70%);
}

.today-stamps {
  justify-content: center;
  margin: 16rpx 0;
}
```

把 `.cell-day` 改成并追加：

```css
.cell-day {
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.2;
}

.cell-future {
  opacity: 0.35;
}

.cell-beans {
  font-size: 20rpx;
  color: #d97a1e;
  min-height: 28rpx;
  line-height: 28rpx;
}
```

- [ ] **Step 8: 删掉树的图，补图标**

```bash
git rm -r -q miniprogram/images/forest
```

`pages/garden/garden.wxml`：打卡日历按钮的图标 `/images/forest/fruit.png` 改成 `/images/garden/ui/calendar.png`。

`scripts/draw-images.py`：
1. 删除 `TILE = 240`、`TREE = …`、`TRUNK`、`TRUNK_DARK`、`CANOPY` 常量，以及 `tile_canvas`、`shadow`、`leaf`、`draw_empty`、`draw_sprout`、`draw_small`、`canopy_points`、`draw_big`、`draw_flowers`、`draw_fruits`、`draw_tiles` 函数（`shade`、`tint`、`P`、`GRASS*`、`SOIL*` 留着）；`__main__` 里删掉 `draw_tiles(...)` 那行。
2. 文件头说明改成「生成小程序里用到的图片：tabBar 图标、庭院地块，以及庭院物品和界面图的占位图」。
3. `draw_garden` 的 `ui` 字典里加三个占位：

```python
        'calendar.png': lambda: bottom_anchored(emoji_image('📅', 130)),
        'basket.png': lambda: bottom_anchored(emoji_image('🧺', 130)),
        'home.png': lambda: bottom_anchored(emoji_image('🏠', 130)),
```

`scripts/slice-art.py`：第 2 张图那行改成

```python
    # 每天的树已经不用了；这张图只取「大树」给院子中间的新手大树（见 EXTRA_ITEMS）
    ('02-每天的树.png', 'source', [None, None, None, 'small', 'big', None, None, None, None]),
```

`main()` 里 `if kind == 'tree':` 分支整个删掉，改成 `if kind == 'source':\n            pass`（后面的 `elif kind == 'item'` 不变）；「有图没用上」的判断 `kind != 'tree'` 改成 `kind != 'source'`；`TREE_PX` 常量删除。

然后：

```bash
python3 scripts/draw-images.py && python3 scripts/slice-art.py && git status --short miniprogram/images
```

Expected：新增 `ui/calendar.png`、`ui/basket.png`、`ui/home.png`，其余图片无变化（slice-art 输出与仓库里一致）。

- [ ] **Step 9: 跑全量测试并提交 Task 1 + Task 2**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
for f in cloudfunctions/api/lib/shared/forest.js cloudfunctions/api/services/*.js miniprogram/utils/view.js miniprogram/app.js miniprogram/pages/*/*.js; do node --check $f || echo FAIL $f; done
git add -A
git commit -m "feat: replace the daily tree with meal stamps and beans

<trailer>"
```

---

### Task 3: 地图与开荒规则（云函数）

**Files:**
- Modify: `cloudfunctions/api/lib/shared/garden.js`（复制到 miniprogram）
- Modify: `cloudfunctions/api/lib/garden-state.js`、`services/garden.js`、`router.js`
- Modify: `miniprogram/pages/gacha/gacha.js`、`gacha.wxml`、`miniprogram/pages/collection/collection.wxml`
- Test: `test/garden.test.js`、`test/services-garden.test.js`、`test/router.test.js`、`test/cloud-e2e.test.js`

**Interfaces:**
- Produces（shared/garden）：`PLOT_SIZE = 6`、`PLOT_GRID = 3`、`WORLD_SIZE = 18`、`CENTER_PLOT = '1,1'`、`plotOf(c, r) → 'pc,pr'`、`parsePlot(key) → { pc, pr } | null`、`plotNeighbors(key) → string[]`、`canExpand(plots, key) → boolean`、`expandCost(openedCount) → number`、`inWorld(c, r) → boolean`、`tileOpen(plots, c, r) → boolean`；删除 `gardenSize`
- Produces（service）：`view` 去掉 `size`，加 `plots: string[]`、`expandCost: number | null`、`world: { plotSize, grid }`；`expand(openid, { plot }) → view`；`spin` 返回去掉 `size`、`sizeGrew`；新 action `garden.expand`

- [ ] **Step 1: 写失败的测试**

`test/garden.test.js`：解构里 `gardenSize` 换成 `WORLD_SIZE, PLOT_SIZE, plotOf, parsePlot, plotNeighbors, canExpand, expandCost, tileOpen`；`gardenSize` 测试替换为：

```js
test('地图：块坐标、相邻、开荒价格、格子开没开垦', () => {
  assert.equal(PLOT_SIZE, 6)
  assert.equal(WORLD_SIZE, 18)
  assert.equal(plotOf(0, 0), '0,0')
  assert.equal(plotOf(8, 8), '1,1')
  assert.equal(plotOf(17, 6), '2,1')
  assert.deepEqual(parsePlot('2,1'), { pc: 2, pr: 1 })
  assert.equal(parsePlot('3,1'), null)
  assert.equal(parsePlot('x'), null)
  assert.deepEqual(plotNeighbors('1,1').sort(), ['0,1', '1,0', '1,2', '2,1'])
  assert.deepEqual(plotNeighbors('0,0').sort(), ['0,1', '1,0'])
  assert.deepEqual(plotNeighbors('3,3'), [])
  assert.equal(canExpand(['1,1'], '1,0'), true)
  assert.equal(canExpand(['1,1'], '0,0'), false)
  assert.equal(canExpand(['1,1'], '1,1'), false)
  assert.equal(canExpand(['1,1'], '9,9'), false)
  assert.deepEqual([1, 2, 8].map(expandCost), [100, 150, 450])
  assert.equal(tileOpen(['1,1'], 6, 11), true)
  assert.equal(tileOpen(['1,1'], 5, 11), false)
  assert.equal(tileOpen(['1,1'], 6.5, 7), false)
  assert.equal(tileOpen(['1,1'], 18, 7), false)
})
```

`test/services-garden.test.js`：
1. `richGarden` 的默认值里加 `plots: ['0,0'],`（让已有用例的坐标 0～5 都在开垦的地上）。
2. 第一个测试里 `assert.equal(first.size, 6)` 改成 `assert.deepEqual(first.plots, ['1,1'])` 和 `assert.equal(first.expandCost, 100)` 两行；`[2, 2]` 改成 `[8, 8]`。
3. 「spin：图鉴集齐 20 种时庭院扩成 8×8」测试删除。
4. 追加：

```js
test('expand：花暖豆开垦相邻的荒地，价格递增', async () => {
  const { repo, service } = setup({ garden: { welcomed: true, plots: ['1,1'], beans: { earned: {}, bonus: 400, spent: 0 } } })
  let view = await service.expand('u1', { plot: '1,0' })
  assert.deepEqual(view.plots, ['1,1', '1,0'])
  assert.equal(view.beans, 300)
  assert.equal(view.expandCost, 150)
  assert.deepEqual(view.world, { plotSize: 6, grid: 3 })
  view = await service.expand('u1', { plot: '2,0' })
  assert.equal(view.beans, 150)
  assert.equal(view.expandCost, 200)
  assert.equal((await repo.getGarden('u1')).beans.spent, 250)
})

test('expand：不相邻、已开垦、不在地图里、暖豆不够都不行', async () => {
  const { service } = setup({ garden: { welcomed: true, plots: ['1,1'], beans: { earned: {}, bonus: 120, spent: 0 } } })
  await assert.rejects(service.expand('u1', { plot: '0,0' }), { code: 'BAD_REQUEST', message: '要挨着已经开垦的地才能开荒' })
  await assert.rejects(service.expand('u1', { plot: '1,1' }), { code: 'BAD_REQUEST', message: '这块地已经开垦过了' })
  await assert.rejects(service.expand('u1', { plot: '3,1' }), { code: 'BAD_REQUEST', message: '这块地不在庭院里' })
  await assert.rejects(service.expand('u1', {}), { code: 'BAD_REQUEST', message: '这块地不在庭院里' })
  await service.expand('u1', { plot: '0,1' })
  await assert.rejects(service.expand('u1', { plot: '2,1' }), { code: 'NO_BEANS', message: '暖豆不够啦，开荒要 150 暖豆，再攒攒' })
})

test('全部开垦完，expandCost 是 null', async () => {
  const all = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']
  const { service } = setup({ garden: richGarden({ plots: all }) })
  assert.equal((await service.get('u1')).expandCost, null)
})

test('place / move：只能放在开垦了的地上', async () => {
  const { service } = setup({ garden: richGarden({ plots: ['1,1'], inventory: { daisy: 2 }, placed: [{ uid: 'p1', itemId: 'pavilion', c: 7, r: 7 }] }) })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 0, r: 0 }), { code: 'BAD_REQUEST', message: '这块地还没开荒呢' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 18, r: 0 }), { code: 'BAD_REQUEST', message: '放不到庭院外面哦' })
  await service.place('u1', { itemId: 'daisy', c: 6, r: 11 })
  await assert.rejects(service.move('u1', { uid: 'p1', c: 12, r: 7 }), { code: 'BAD_REQUEST', message: '这块地还没开荒呢' })
})

test('旧数据：小庭院的坐标挪进中间那块，越界的东西所在的地块直接开垦', async () => {
  const { service } = setup({
    garden: { welcomed: true, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 2, r: 2 }, { uid: 'p2', itemId: 'daisy', c: 7, r: 0 }] },
  })
  const view = await service.get('u1')
  assert.deepEqual(view.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 8, 8], ['daisy', 13, 6]])
  assert.deepEqual(view.plots, ['1,1', '2,1'])
})
```

（若有用例断言 `res.size` / `res.sizeGrew`，一并删除这两行。）

`test/router.test.js`：fake services 的 `garden` 加 `expand: record('garden.expand')`，pairs 加 `['garden.expand', 'garden.expand']`。

`test/cloud-e2e.test.js` 庭院测试：`c: 0, r: 0` 改成 `c: 6, r: 6`；`garden.move` 被挡的目标 `{ c: 2, r: 2 }` 改成 `{ c: 8, r: 8 }`；移动目标 `{ c: 5, r: 5 }` 改成 `{ c: 11, r: 11 }`（断言同步改）。小动物端到端测试里翠竹 `c: 0, r: 0` 改成 `c: 6, r: 6`。再追加：

```js
test('开荒：豆不够提示、开垦后能往新地上摆', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  await main({ action: 'garden.get' })
  const poor = await main({ action: 'garden.expand', data: { plot: '1,0' } })
  assert.equal(poor.code, 'NO_BEANS')

  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: 500 }, inventory: { daisy: 1 } })
  const opened = await main({ action: 'garden.expand', data: { plot: '1,0' } })
  assert.equal(opened.ok, true, opened.message)
  assert.deepEqual(opened.data.plots, ['1,1', '1,0'])
  assert.equal(opened.data.expandCost, 150)
  const placed = await main({ action: 'garden.place', data: { itemId: 'daisy', c: 8, r: 2 } })
  assert.equal(placed.ok, true, placed.message)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden.test.js test/services-garden.test.js test/router.test.js test/cloud-e2e.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 `shared/garden.js`**

`SEASONAL_WEIGHT = 4` 下面加：

```js
// 庭院地图：PLOT_GRID × PLOT_GRID 块地，每块 PLOT_SIZE × PLOT_SIZE 格；一开始只开垦中间一块，其余花暖豆开荒
const PLOT_SIZE = 6
const PLOT_GRID = 3
const WORLD_SIZE = PLOT_SIZE * PLOT_GRID
const CENTER_PLOT = '1,1'
const EXPAND_BASE = 100
const EXPAND_STEP = 50
```

`gardenSize` 删除，换成：

```js
function plotOf(c, r) {
  return `${Math.floor(c / PLOT_SIZE)},${Math.floor(r / PLOT_SIZE)}`
}

function parsePlot(key) {
  const m = /^(\d+),(\d+)$/.exec(String(key))
  if (!m) return null
  const pc = Number(m[1])
  const pr = Number(m[2])
  return pc < PLOT_GRID && pr < PLOT_GRID ? { pc, pr } : null
}

// 上下左右相邻的地块
function plotNeighbors(key) {
  const p = parsePlot(key)
  if (!p) return []
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dc, dr]) => ({ pc: p.pc + dc, pr: p.pr + dr }))
    .filter((n) => n.pc >= 0 && n.pr >= 0 && n.pc < PLOT_GRID && n.pr < PLOT_GRID)
    .map((n) => `${n.pc},${n.pr}`)
}

function canExpand(plots, key) {
  return !!parsePlot(key) && plots.indexOf(key) === -1 && plotNeighbors(key).some((n) => plots.indexOf(n) !== -1)
}

// 已开垦 openedCount 块时再开一块要多少暖豆：100、150、200……
function expandCost(openedCount) {
  return EXPAND_BASE + EXPAND_STEP * (openedCount - 1)
}

function inWorld(c, r) {
  return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < WORLD_SIZE && r < WORLD_SIZE
}

function tileOpen(plots, c, r) {
  return inWorld(c, r) && plots.indexOf(plotOf(c, r)) !== -1
}
```

`module.exports`：去掉 `gardenSize,`，加 `PLOT_SIZE, PLOT_GRID, WORLD_SIZE, CENTER_PLOT, plotOf, parsePlot, plotNeighbors, canExpand, expandCost, inWorld, tileOpen,`。然后 `cp` 到 `miniprogram/utils/shared/garden.js`。

- [ ] **Step 4: 实现 `lib/garden-state.js`**

1. import 改成 `const { ANIMALS, PLOT_SIZE, CENTER_PLOT, plotOf } = require('./shared/garden')`。
2. `adoptAnimals` 上面加：

```js
// 以前庭院只有一小块（坐标从 0 开始）：整体挪进大地图中间那块，物件落到的地块直接算开垦
function adoptWorld(garden, plots) {
  if (plots) return { ...garden, plots }
  const placed = garden.placed.map((p) => ({ ...p, c: p.c + PLOT_SIZE, r: p.r + PLOT_SIZE }))
  const opened = [CENTER_PLOT]
  placed.forEach((p) => {
    const key = plotOf(p.c, p.r)
    if (opened.indexOf(key) === -1) opened.push(key)
  })
  return { ...garden, placed, plots: opened }
}
```

3. `normalizeGarden` 的 `return adoptAnimals({ … })` 改成 `return adoptAnimals(adoptWorld({ … }, g.plots))`，对象里加注释行 `// 开垦了哪些地块，见 adoptWorld`（不加字段，`plots` 由 `adoptWorld` 给）。

- [ ] **Step 5: 实现 `services/garden.js`**

1. import 里 `gardenSize,` 去掉，加 `PLOT_SIZE, PLOT_GRID, CENTER_PLOT, parsePlot, canExpand, expandCost, inWorld, tileOpen,`。
2. `view()`：`size: gardenSize(garden.collected.length),` 换成

```js
      world: { plotSize: PLOT_SIZE, grid: PLOT_GRID },
      plots: garden.plots,
      expandCost: garden.plots.length >= PLOT_GRID * PLOT_GRID ? null : expandCost(garden.plots.length),
```

3. `checkTile` 替换为：

```js
  function checkTile(garden, c, r, ignoreUid) {
    if (!inWorld(c, r)) throw new AppError(CODES.BAD_REQUEST, '放不到庭院外面哦')
    if (!tileOpen(garden.plots, c, r)) throw new AppError(CODES.BAD_REQUEST, '这块地还没开荒呢')
    if (garden.placed.some((p) => p.c === c && p.r === r && p.uid !== ignoreUid)) {
      throw new AppError(CODES.BAD_REQUEST, '这块地上已经有东西了')
    }
  }
```

4. `get` 里新手大树位置：`const center = Math.floor((gardenSize(garden.collected.length) - 1) / 2)` 改成

```js
        // 地图正中：中间那块地的中心
        const [pc, pr] = CENTER_PLOT.split(',').map(Number)
        const center = { c: pc * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2), r: pr * PLOT_SIZE + Math.floor((PLOT_SIZE - 1) / 2) }
```

并把 `c: center, r: center` 改成 `c: center.c, r: center.r`。
5. `spin`：删除 `const sizeBefore = …`、`const size = …` 两行以及返回里的 `size, sizeGrew: …` 两项。
6. `arrive` 后面加：

```js
    // 开荒：花暖豆开垦一块挨着已开垦土地的荒地
    async expand(openid, input) {
      const key = (input || {}).plot
      const garden = await load(openid)
      if (!parsePlot(key)) throw new AppError(CODES.BAD_REQUEST, '这块地不在庭院里')
      if (garden.plots.indexOf(key) !== -1) throw new AppError(CODES.BAD_REQUEST, '这块地已经开垦过了')
      if (!canExpand(garden.plots, key)) throw new AppError(CODES.BAD_REQUEST, '要挨着已经开垦的地才能开荒')
      const cost = expandCost(garden.plots.length)
      if (beanBalance(garden) < cost) throw new AppError(CODES.NO_BEANS, `暖豆不够啦，开荒要 ${cost} 暖豆，再攒攒`)
      garden.beans = { ...garden.beans, spent: garden.beans.spent + cost }
      garden.plots = garden.plots.concat(key)
      await repo.saveGarden(openid, garden)
      return view(garden)
    },
```

`router.js`：ROUTES 加 `'garden.expand': ['garden', 'expand'],`。

- [ ] **Step 6: 扭蛋页、图鉴页去掉「扩大成 8×8」**

`gacha.js`：result 里 `sizeGrew: res.sizeGrew,` 删除。`gacha.wxml`：`<view wx:if="{{result.sizeGrew}}" class="grew">…</view>` 删除。`collection.wxml`：`<view class="muted small">集齐 20 种，庭院会扩大成 8×8</view>` 改成 `<view class="muted small">摆对东西，小动物会自己搬来</view>`。

- [ ] **Step 7: 跑测试并提交**

```bash
cp cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/garden.js
npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

Expected：除 `test/pages.test.js` 里庭院相关断言（Task 7 重写）外全部通过；如果 `pages.test.js` 的庭院用例因为坐标（`tap(2, 2)` 等）失败，记下，Task 7 一起改。若有 `garden-view` / `garden-life` 用例失败，看原因只能是 `gardenSize` 被删——它们不应引用它。

```bash
node --check cloudfunctions/api/services/garden.js && node --check cloudfunctions/api/lib/garden-state.js && node --check cloudfunctions/api/router.js
git add -A
git commit -m "feat(garden): 3x3 plot world with bean-paid expansion

<trailer>"
```

（`pages.test.js` 如有失败，在提交信息里注明「庭院页测试在下一个提交里随页面重写」，且不推送，直到 Task 7 全绿。）

---

### Task 4: `utils/world.js`——大地图布局、地块、木牌、装饰、点按换算

**Files:**
- Create: `miniprogram/utils/world.js`
- Modify: `miniprogram/utils/garden-view.js`（`hintTiles` 加 `open` 参数）
- Test: `test/world.test.js`、`test/garden-view.test.js`

**Interfaces:**
- Consumes: Task 3 的 shared 地图函数；`isoLayout / tileTop / tileCenter / tileAt`
- Produces:
  - `worldLayout(windowWidth) → L`（`isoLayout(18, …)` 的字段 + `margin`、`viewWidth`、`viewHeight`）
  - `centerOffset(L, windowWidth, windowHeight) → { x, y, scale: 1 }`
  - `plotViews(plots, L, cost) → [{ key, open, z, image, left, top, width, height, sign: { left, bottom, width, cost } | null }]`（按 z 从后往前）
  - `decorations(L) → [{ key, image, left, bottom, width, z, cloud }]`
  - `tileFromTouch(x, y, rect, L) → { c, r } | null`
  - `openChecker(plots) → (c, r) => boolean`
  - `hintTiles(placed, L, ignoreUid, open = () => true)`

- [ ] **Step 1: 写失败的测试** `test/world.test.js`

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker } = require('../miniprogram/utils/world')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = worldLayout(375)
const ALL = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']

test('worldLayout：1 倍时一块地占屏幕宽 92%，四周留白', () => {
  assert.equal(L.size, 18)
  assert.ok(Math.abs(L.tileW * 6 - 375 * 0.92) < 1e-9)
  assert.equal(L.margin, 225)
  assert.equal(L.viewWidth, L.width + 450)
  assert.equal(L.viewHeight, L.height + 450)
})

test('centerOffset：地图正中对准屏幕正中', () => {
  const o = centerOffset(L, 375, 700)
  const p = tileTop(9, 9, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
})

test('plotViews：9 块地从后往前排，开垦的是草地，能开荒的荒地立木牌', () => {
  const views = plotViews(['1,1'], L, 100)
  assert.equal(views.length, 9)
  assert.ok(views.every((v, i) => i === 0 || views[i - 1].z <= v.z))
  const center = views.find((v) => v.key === '1,1')
  assert.equal(center.open, true)
  assert.equal(center.image, '/images/garden/plot-open.png')
  assert.equal(center.sign, null)
  const t = tileTop(6, 6, L)
  assert.ok(Math.abs(center.left + center.width / 2 - t.x) < 1e-9)
  assert.equal(center.top, t.y)
  assert.ok(Math.abs(center.width - L.tileW * 6) < 1e-9)
  const north = views.find((v) => v.key === '1,0')
  assert.equal(north.image, '/images/garden/plot-wild.png')
  assert.equal(north.sign.cost, 100)
  assert.equal(views.find((v) => v.key === '0,0').sign, null)
  assert.equal(views.filter((v) => v.sign).length, 4)
  assert.ok(plotViews(ALL, L, null).every((v) => v.open && !v.sign))
})

test('decorations：都在小岛外面，图片路径正确', () => {
  const decor = decorations(L)
  assert.ok(decor.length >= 8)
  decor.forEach((d) => {
    assert.match(d.image, /^\/images\/garden\/(decor-\w+|items\/\w+)\.png$/)
    assert.ok(d.width > 0 && d.key)
  })
  assert.ok(decor.some((d) => d.cloud))
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(10, 7, L)
    assert.deepEqual(tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 10, r: 7 })
  }
  assert.equal(tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})

test('openChecker：只有开垦的地块算数', () => {
  const open = openChecker(['1,1'])
  assert.equal(open(6, 6), true)
  assert.equal(open(5, 6), false)
  assert.equal(open(-1, 6), false)
})
```

`test/garden-view.test.js` 追加：

```js
test('hintTiles：可以只算开垦了的格子', () => {
  const L18 = isoLayout(18, 540)
  const open = (c, r) => c >= 6 && c < 12 && r >= 6 && r < 12
  const tiles = hintTiles([{ uid: 'a', itemId: 'daisy', c: 8, r: 8 }], L18, null, open)
  assert.equal(tiles.length, 35)
  assert.ok(tiles.every((t) => open(t.c, t.r)))
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/world.test.js test/garden-view.test.js`
Expected: FAIL（Cannot find module '../miniprogram/utils/world'）

- [ ] **Step 3: 实现 `miniprogram/utils/world.js`**

```js
// 大地图庭院：布局尺寸、每块地的地面图和开荒木牌、小岛外的装饰、屏幕点按 → 格子（纯函数，有单测）

const { PLOT_SIZE, PLOT_GRID, WORLD_SIZE, canExpand, tileOpen } = require('./shared/garden')
const { isoLayout, tileTop, tileCenter, tileAt } = require('./iso')

// 1 倍时一块地占屏幕宽度的比例；小岛外面留白（装饰、拖到边上时的余地）占屏幕宽度的比例
const PLOT_SCREEN = 0.92
const MARGIN_SCREEN = 0.6

function worldLayout(windowWidth) {
  const tileW = (windowWidth * PLOT_SCREEN) / PLOT_SIZE
  const L = isoLayout(WORLD_SIZE, tileW * WORLD_SIZE)
  const margin = Math.round(windowWidth * MARGIN_SCREEN)
  return { ...L, margin, viewWidth: L.width + margin * 2, viewHeight: L.height + margin * 2 }
}

// movable-view 的位置：地图正中（也就是中间那块地的中心）对准屏幕正中
function centerOffset(L, windowWidth, windowHeight) {
  const middle = WORLD_SIZE / 2
  const p = tileTop(middle, middle, L)
  return { x: windowWidth / 2 - (L.margin + p.x), y: windowHeight / 2 - (L.margin + p.y), scale: 1 }
}

// 每块地一张地面图（带下面的土边），从后往前画：前面的地盖住后面那块的土边，只有小岛外圈露出来
function plotViews(plots, L, cost) {
  const width = L.tileW * PLOT_SIZE
  const height = PLOT_SIZE * L.tileH + L.depth
  const signWidth = L.tileW * 1.4
  const views = []
  for (let pr = 0; pr < PLOT_GRID; pr++) {
    for (let pc = 0; pc < PLOT_GRID; pc++) {
      const key = `${pc},${pr}`
      const open = plots.indexOf(key) !== -1
      const top = tileTop(pc * PLOT_SIZE, pr * PLOT_SIZE, L)
      const middle = tileTop(pc * PLOT_SIZE + PLOT_SIZE / 2, pr * PLOT_SIZE + PLOT_SIZE / 2, L)
      views.push({
        key,
        open,
        z: pc + pr,
        image: open ? '/images/garden/plot-open.png' : '/images/garden/plot-wild.png',
        left: top.x - width / 2,
        top: top.y,
        width,
        height,
        sign: !open && cost != null && canExpand(plots, key)
          ? { left: middle.x - signWidth / 2, bottom: L.height - middle.y, width: signWidth, cost }
          : null,
      })
    }
  }
  return views.sort((a, b) => a.z - b.z)
}

// 小岛外面的装饰（不能点）：坐标是地图外面的格子，scale 是相对格子宽度的大小
const DECOR = [
  { image: 'decor-tree', c: -2, r: 2, scale: 1.6 },
  { image: 'decor-bush', c: -2, r: 7, scale: 1.1 },
  { image: 'decor-tree', c: -3, r: 12, scale: 2 },
  { image: 'items/pebbles', c: -2, r: 16, scale: 0.9 },
  { image: 'decor-tree', c: 3, r: -2, scale: 1.8 },
  { image: 'items/pebbles', c: 9, r: -2, scale: 0.9 },
  { image: 'decor-bush', c: 14, r: -2, scale: 1.2 },
  { image: 'decor-tree', c: 20, r: 4, scale: 1.7 },
  { image: 'decor-bush', c: 20, r: 11, scale: 1.1 },
  { image: 'decor-tree', c: 5, r: 20, scale: 1.6 },
  { image: 'decor-bush', c: 12, r: 20, scale: 1.2 },
  { image: 'decor-cloud', c: -6, r: 2, scale: 2.4, cloud: true },
  { image: 'decor-cloud', c: 6, r: -7, scale: 2, cloud: true },
]

function decorations(L) {
  return DECOR.map((d, i) => {
    const center = tileCenter(d.c, d.r, L)
    const width = L.tileW * d.scale
    return {
      key: `d${i}`,
      image: `/images/garden/${d.image}.png`,
      left: center.x - width / 2,
      bottom: L.height - center.y,
      width,
      // 小岛后面的画在地面下层，前面的按前后顺序和物件一起排
      z: d.c < 0 || d.r < 0 ? -5 : (d.c + d.r) * 10 + d.c,
      cloud: !!d.cloud,
    }
  })
}

// 屏幕上的点 → 格子；rect 是 #world 此刻在屏幕上的位置和宽度（已经算上拖动和缩放）
function tileFromTouch(x, y, rect, L) {
  const scale = rect.width / L.width
  return tileAt((x - rect.left) / scale, (y - rect.top) / scale, L)
}

function openChecker(plots) {
  return (c, r) => tileOpen(plots, c, r)
}

module.exports = { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker }
```

`garden-view.js` 的 `hintTiles` 改成（注释同步）：

```js
// 摆放、移动时可以点的空地（移动时自己原来的位置也算空地；open 判断格子开没开垦）
function hintTiles(placed, L, ignoreUid, open = () => true) {
  const taken = {}
  placed.forEach((p) => {
    if (p.uid !== ignoreUid) taken[`${p.c},${p.r}`] = true
  })
  const tiles = []
  for (let c = 0; c < L.size; c++) {
    for (let r = 0; r < L.size; r++) {
      if (taken[`${c},${r}`] || !open(c, r)) continue
      const t = tileTop(c, r, L)
      tiles.push({ key: `${c}-${r}`, c, r, left: t.x - L.tileW / 2, top: t.y, width: L.tileW, height: L.tileH })
    }
  }
  return tiles
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/world.test.js test/garden-view.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/utils/world.js && node --check miniprogram/utils/garden-view.js
git add miniprogram/utils/world.js miniprogram/utils/garden-view.js test/world.test.js test/garden-view.test.js
git commit -m "feat(garden): world layout, plots, signs, decorations and touch mapping

<trailer>"
```

---

### Task 5: 小动物只在开垦的地上走，从开垦土地的边上进来

**Files:**
- Modify: `miniprogram/utils/garden-life.js`
- Test: `test/garden-life.test.js`

**Interfaces:**
- Produces: `createLife({ …, open = () => true })`：`open(c, r)` 为假的格子算挡路；新住户起点是开垦土地边上那格外面的格子（荒地或地图外），第一步走进开垦的地

- [ ] **Step 1: 写失败的测试**（`test/garden-life.test.js`）

1. `tileOf` 改成可传布局，并把 r 的扫描范围扩到 `-1..L.size`：

```js
// sprite 站在哪一格（站在物件上面时返回 null）
function tileOf(s, layout = L) {
  const x = s.left + s.width / 2
  for (let c = -1; c <= layout.size; c++) {
    for (let r = -1; r <= layout.size; r++) {
      const center = tileCenter(c, r, layout)
      if (Math.abs(center.x - x) < 0.01 && Math.abs(layout.height - (center.y + layout.tileH * 0.18) - s.bottom) < 0.01) return { c, r }
    }
  }
  return null
}
```

2. 「新住户从院子边上走进来…」改成：

```js
test('新住户从院子边上走进来，头上说自我介绍', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], arrivals: ['panda'], random: lcg(3) })
  const start = tileOf(sprites[0])
  assert.ok(start.c < 0 || start.r < 0 || start.c >= L.size || start.r >= L.size, JSON.stringify(start))
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.panda.hello)
  life.start()
  clock.advance(5000)
  const t = tileOf(sprites[0])
  assert.ok(t && t.c >= 0 && t.r >= 0 && t.c < L.size && t.r < L.size)
  assert.equal(sprites[0].bubble, '')
})
```

3. 追加：

```js
const L12 = isoLayout(12, 480)
const openMiddle = (c, r) => c >= 3 && c < 9 && r >= 3 && r < 9

test('只在开垦的地上走：荒地和地图外都不去', () => {
  const clock = manualClock()
  const current = {}
  const life = createLife({
    L: L12, placed: [{ uid: 'p1', itemId: 'bamboo', c: 5, r: 5 }], residents: ['chick', 'rabbit', 'panda'], random: lcg(11), clock, open: openMiddle,
    onChange: (i, s) => {
      current[i] = s
      const t = tileOf(s, L12)
      if (t && s.action !== 'eat') assert.ok(openMiddle(t.c, t.r), `走到了荒地 ${t.c},${t.r}`)
    },
  })
  life.sprites().forEach((s, i) => {
    current[i] = s
    const t = tileOf(s, L12)
    assert.ok(openMiddle(t.c, t.r))
  })
  life.start()
  clock.advance(5 * 60 * 1000)
  life.stop()
})

test('新住户从荒地那边走进开垦的地', () => {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({ L: L12, placed: [], residents: ['duck'], arrivals: ['duck'], random: lcg(5), clock, open: openMiddle, onChange: (i, s) => { sprites[i] = s } })
  life.sprites().forEach((s, i) => { sprites[i] = s })
  const start = tileOf(sprites[0], L12)
  assert.equal(openMiddle(start.c, start.r), false)
  life.start()
  clock.advance(3000)
  const t = tileOf(sprites[0], L12)
  assert.equal(openMiddle(t.c, t.r), true)
  assert.equal(Math.abs(t.c - start.c) + Math.abs(t.r - start.r), 1)
  life.stop()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/garden-life.test.js`
Expected: FAIL（新用例走到荒地 / 起点在开垦的地上）

- [ ] **Step 3: 实现**

`createLife` 参数加 `open = () => true`（放在 `arrivals = []` 后面）。在 `const animals = …` 之后加：

```js
  // 没开垦的格子：和摆了东西的格子一样走不进去
  const closed = new Set()
  for (let c = 0; c < L.size; c++) {
    for (let r = 0; r < L.size; r++) if (!open(c, r)) closed.add(key({ c, r }))
  }
```

`blockedFor` 第一行改成：

```js
    const set = new Set(closed)
    items.forEach((p) => set.add(key(p)))
```

`walkIn` 整个替换为：

```js
  // 新住户：从开垦土地的边上走进来——起点是边上那格外面的荒地或地图外
  function walkIn(a) {
    const blocked = blockedFor(a)
    const doors = []
    freeTiles(blocked).forEach((t) => {
      const outside = [{ c: t.c + 1, r: t.r }, { c: t.c, r: t.r + 1 }, { c: t.c - 1, r: t.r }, { c: t.c, r: t.r - 1 }]
        .find((n) => !inside(n, L.size) || closed.has(key(n)))
      if (outside) doors.push({ from: outside, to: t })
    })
    if (!doors.length) return settleIn(a)
    const door = doors[Math.min(doors.length - 1, Math.floor(random() * doors.length))]
    a.c = door.from.c
    a.r = door.from.r
    a.path = [door.to]
    say(a, a.info.hello, HELLO_MS)
  }
```

（`settleIn` 定义在 `walkIn` 之前或之后都可以，函数声明会提升。）

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/garden-life.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/utils/garden-life.js
git add miniprogram/utils/garden-life.js test/garden-life.test.js
git commit -m "feat(animals): stay on cleared land and walk in from its edge

<trailer>"
```

---

### Task 6: 地图的图：草地 / 荒地地块、木牌、外围装饰

**Files:**
- Modify: `scripts/draw-images.py`、`scripts/slice-art.py`
- Create（生成）：`miniprogram/images/garden/plot-open.png`、`plot-wild.png`、`sign.png`、`decor-cloud.png`、`decor-tree.png`、`decor-bush.png`

**Interfaces:**
- Produces: Task 4 的 `plotViews` / `decorations` 引用的全部图片路径

- [ ] **Step 1: `draw-images.py` 画地块、木牌、云**

1. `draw_land(size)` 改名为 `draw_plot(wild=False)`，固定 `size = 6`，输出 `garden/plot-open.png` / `garden/plot-wild.png`：

```python
WILD = (126, 160, 92)
WILD_DARK = (98, 132, 70)
WEED = ((92, 140, 66), (120, 166, 82), (150, 170, 90))
STONE = ((168, 162, 150), (140, 134, 124))


def draw_plot(wild=False):
    """一块 6×6 的地：开垦的是浅深相间的草地；荒地颜色深一些，长满杂草、散着小石头。带下面的土边"""
    size = 6
    W = LAND_WIDTH * 2
    tw = W / size
    th = tw / 2
    depth = th * 0.4
    H = int(size * th + depth) + 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = lambda c, r: (W / 2 + (c - r) * tw / 2, (c + r) * th / 2)
    left, bottom, right = (0, size * th / 2), (W / 2, size * th), (W, size * th / 2)
    d.polygon([left, bottom, (bottom[0], bottom[1] + depth), (left[0], left[1] + depth)], fill=SOIL_LEFT)
    d.polygon([bottom, right, (right[0], right[1] + depth), (bottom[0], bottom[1] + depth)], fill=SOIL_RIGHT)
    rim = depth * 0.35
    edge = WILD_DARK if wild else GRASS_DARK
    d.polygon([left, bottom, (bottom[0], bottom[1] + rim), (left[0], left[1] + rim)], fill=edge)
    d.polygon([bottom, right, (right[0], right[1] + rim), (bottom[0], bottom[1] + rim)], fill=shade(edge, 0.92))
    base = WILD if wild else GRASS
    for c in range(size):
        for r in range(size):
            x, y = top(c, r)
            color = base if (c + r) % 2 == 0 else shade(base, 0.95)
            if wild:
                color = base
            d.polygon([(x, y), (x + tw / 2, y + th / 2), (x, y + th), (x - tw / 2, y + th / 2)], fill=color)
    rnd = random.Random(7 if wild else size)
    inside = lambda x, y, k: abs(x - W / 2) / (W / 2) + abs(y - size * th / 2) / (size * th / 2) < k
    if wild:
        for _ in range(26):
            x, y = rnd.uniform(0.1, 0.9) * W, rnd.uniform(0.12, 0.88) * size * th
            if inside(x, y, 0.85):
                rx, ry = rnd.uniform(18, 34), rnd.uniform(10, 18)
                d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=rnd.choice(STONE))
        for _ in range(420):
            x, y = rnd.uniform(0.05, 0.95) * W, rnd.uniform(0.06, 0.94) * size * th
            if not inside(x, y, 0.9):
                continue
            color = rnd.choice(WEED)
            h = rnd.uniform(26, 56)
            for dx in (-10, 0, 10):
                d.line([(x, y), (x + dx * 1.6 + rnd.uniform(-6, 6), y - h)], fill=color, width=7)
    else:
        for _ in range(size * size * 2):
            x, y = rnd.uniform(0.15, 0.85) * W, rnd.uniform(0.1, 0.9) * size * th
            if inside(x, y, 0.92):
                d.line([(x, y), (x + 3, y - 10)], fill=GRASS_DARK, width=4)
    img = img.resize((LAND_WIDTH, int(H / 2)), Image.LANCZOS)
    save_small(img, 'garden', 'plot-wild.png' if wild else 'plot-open.png')


def draw_sign():
    """开荒木牌：一根木桩 + 上面一块空白木板（价格由页面写上去）"""
    S = 480
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    wood, wood_dark, board = (150, 100, 56), (112, 72, 38), (226, 184, 120)
    d.rounded_rectangle([S / 2 - 22, 150, S / 2 + 22, S - 20], radius=10, fill=wood_dark)
    d.ellipse([S / 2 - 60, S - 44, S / 2 + 60, S - 8], fill=(90, 120, 60, 120))
    d.rounded_rectangle([40, 40, S - 40, 230], radius=28, fill=wood_dark)
    d.rounded_rectangle([52, 50, S - 52, 218], radius=22, fill=board)
    for y in (100, 160):
        d.line([(70, y), (S - 70, y)], fill=shade(board, 0.9), width=4)
    d.ellipse([S / 2 - 12, 58, S / 2 + 12, 82], fill=wood)
    save_small(img.resize((240, 240), Image.LANCZOS), 'garden', 'sign.png')


def draw_cloud():
    S = 480
    img = Image.new('RGBA', (S, S // 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for x, y, r in ((150, 150, 70), (230, 120, 95), (320, 150, 75), (240, 175, 80)):
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=(255, 255, 255, 235))
    save_small(img.resize((240, 120), Image.LANCZOS), 'garden', 'decor-cloud.png')
```

2. `draw_garden` 开头的 `draw_land(6)`、`draw_land(8)` 换成 `draw_plot()`、`draw_plot(wild=True)`、`draw_sign()`、`draw_cloud()`。

`slice-art.py`：`EXTRA_ITEMS` 下面加

```python
# 小岛外面的装饰树：每日树里的大树和小树（存到 images/garden/，不是物件）
EXTRA_DECOR = {'decor-tree': ('02-每天的树.png', 'big'), 'decor-bush': ('02-每天的树.png', 'small')}
```

`main()` 末尾（`EXTRA_ITEMS` 循环之后）加：

```python
    for name, (sheet, piece) in EXTRA_DECOR.items():
        if sheet in cut:
            total += save(fit(cut[sheet][piece], ITEM_PX), 'garden', f'{name}.png')
```

- [ ] **Step 2: 生成并检查**

```bash
python3 scripts/draw-images.py && python3 scripts/slice-art.py
ls -la miniprogram/images/garden/plot-*.png miniprogram/images/garden/sign.png miniprogram/images/garden/decor-*.png
du -sh miniprogram
```

Expected：6 张新图存在；`miniprogram` 总大小 < 2MB。用 Read 看一眼 `plot-wild.png`、`sign.png` 是否像样。

- [ ] **Step 3: 提交**

```bash
git add scripts/draw-images.py scripts/slice-art.py miniprogram/images/garden
git commit -m "feat(garden): plot ground, wild land, sign and border decoration art

<trailer>"
```

---

### Task 7: 庭院页：全屏大地图

**Files:**
- Modify: `miniprogram/pages/garden/garden.js`、`garden.wxml`、`garden.wxss`、`garden.json`
- Delete: `miniprogram/images/garden/land-6.png`、`land-8.png`；`scripts/draw-images.py` 里已经没有 `draw_land`
- Modify: `test/helpers/page-harness.js`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: Task 3 的 `garden.get` / `garden.expand` 视图（`plots`、`expandCost`）；Task 4 的 `world.js`；Task 5 的 `createLife({ open })`
- Produces: 页面 data `hud`、`world`、`view`、`plots`、`decor`、`bagOpen`、`bagCount`、`justOpened`；方法 `openBag`、`closeBag`、`tapSign`、`recenter`；页面属性 `this.L`（世界布局）、`this.open`

- [ ] **Step 1: 测试工具**（`test/helpers/page-harness.js`）

1. `createSelectorQuery` 的 `exec` 改成：

```js
        exec: (cb) => cb([selector === '#world' ? wx.worldRect : selector === '#garden' ? wx.gardenRect : null]),
```

并在 `gardenRect` 旁边加 `worldRect: null,`（注释：「大地图 #world 在屏幕上的位置和宽度，测试里按拖动、缩放设置」）。
2. `getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 700, statusBarHeight: 20 }),`
3. 加 `getMenuButtonBoundingClientRect: () => ({ top: 24, bottom: 56, height: 32, left: 281, right: 368, width: 87 }),`

- [ ] **Step 2: 改写庭院页面测试**（`test/pages.test.js` 的「养生庭院页面：…」整个替换）

```js
test('养生庭院页面：新手礼 → 扭蛋 → 背包摆放 → 移动 → 收回 → 开荒 → 回到中间 → 图鉴 → 日历', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  // 第一次进庭院：新手礼 60 + 打卡赚的 20；只开垦了中间一块，四周 4 块能开荒
  const garden = loadPage('garden', wx)
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.deepEqual(garden.data.hud, { top: 24, height: 32, below: 68 })
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.plots.length, 9)
  assert.deepEqual(garden.data.plots.filter((p) => p.open).map((p) => p.key), ['1,1'])
  assert.equal(garden.data.plots.filter((p) => p.sign).length, 4)
  assert.ok(garden.data.decor.length > 0)
  assert.ok(garden.data.view.x < 0 && garden.data.view.y < 0)
  assert.equal(garden.data.sprites[0].itemId, 'starter_tree')
  assert.deepEqual([garden.data.sprites[0].c, garden.data.sprites[0].r], [8, 8])
  assert.equal(garden.data.bagCount, 0)
  garden.goGacha()
  assert.equal(garden.data.welcome, null)
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/gacha/gacha'])

  // 扭蛋
  const gacha = loadPage('gacha', wx)
  gacha.shakeMs = 0
  gacha.onShow()
  await settle()
  gacha.spin()
  await settle()
  gacha.openCapsule()
  const itemId = gacha.data.result.itemId
  gacha.goPlace()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 背包抽屉 → 摆放；地图被拖动并缩小到 0.8 倍时也能点准格子
  garden.onShow()
  await settle()
  assert.equal(garden.data.bagCount, 1)
  garden.openBag()
  assert.equal(garden.data.bagOpen, true)
  garden.pickInventory(event({ id: itemId }))
  assert.equal(garden.data.bagOpen, false)
  assert.equal(garden.data.mode, 'place')
  assert.equal(garden.data.hints.length, 35)
  wx.worldRect = { left: -420, top: -260, width: garden.L.width * 0.8 }
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.worldRect.left + p.x * 0.8, clientY: wx.worldRect.top + p.y * 0.8 }] }
  }
  garden.tapLand(tap(8, 8))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(2, 2))
  assert.equal(wx.log.toasts.pop(), '这块地还没开荒呢')
  garden.tapLand(tap(6, 6))
  await settle()
  assert.equal(garden.data.mode, 'view')
  assert.equal(garden.data.sprites.length, 2)
  const uid = garden.data.sprites.find((x) => x.itemId === itemId).uid

  // 移动
  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid }))
  assert.equal(garden.data.mode, 'move')
  garden.tapLand(tap(11, 11))
  await settle()
  const moved = garden.data.sprites.find((x) => x.uid === uid)
  assert.deepEqual([moved.c, moved.r], [11, 11])

  // 收回背包
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid }))
  await settle()
  assert.equal(garden.data.sprites.length, 1)
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 开荒：暖豆不够先提示；攒够了确认后开垦
  garden.tapSign(event({ key: '1,0' }))
  assert.equal(wx.log.toasts.pop(), '开荒要 100 暖豆，再攒攒')
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: doc.beans.bonus + 200 } })
  garden.onShow()
  await settle()
  assert.equal(garden.data.beans, 250)
  garden.tapSign(event({ key: '1,0' }))
  await settle()
  assert.match(wx.log.modals.pop(), /100 暖豆/)
  assert.deepEqual(garden.data.plots.filter((p) => p.open).map((p) => p.key).sort(), ['1,0', '1,1'])
  assert.equal(garden.data.beans, 150)
  assert.equal(garden.data.justOpened, '1,0')
  assert.equal(garden.data.plots.find((p) => p.key === '0,0').sign.cost, 150)
  assert.equal(wx.log.toasts.pop(), '开垦好啦！')

  // 回到中间：每次都换一点点数值，保证 movable-view 真的会动
  const before = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, before)
  const again = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, again)

  // 图鉴
  const collection = loadPage('collection', wx)
  collection.onShow()
  await settle()
  assert.equal(collection.data.totalCount, 48)
  assert.equal(collection.data.groups.length, 6)

  // 打卡日历
  garden.goCalendar()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/forest/forest'])
  const calendar = loadPage('forest', wx)
  calendar.onShow()
  await settle()
  assert.equal(calendar.data.daily.title, '今天得了 20 暖豆')
  assert.equal(calendar.data.view.totalDays, 1)
  garden.onUnload()
})
```

小动物页面测试：翠竹 `c: 0, r: 0` 改成 `c: 6, r: 6`；`garden.onShow()` 前加一次 `garden.onLoad()`。

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`garden.data.hud` undefined 等）

- [ ] **Step 4: `garden.json`**

```json
{
  "navigationStyle": "custom",
  "disableScroll": true
}
```

- [ ] **Step 5: `garden.js`**（整份替换）

```js
const api = require('../../utils/api')
const { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker } = require('../../utils/world')
const { buildScene, inventoryList, hintTiles } = require('../../utils/garden-view')
const { itemById } = require('../../utils/shared/garden')
const { createLife } = require('../../utils/garden-life')

function windowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

// 右上角胶囊按钮的位置：屏幕上浮着的按钮要避开它
function capsule() {
  try {
    return wx.getMenuButtonBoundingClientRect()
  } catch (e) {
    return null
  }
}

Page({
  data: {
    loaded: false,
    beans: 0,
    collectedCount: 0,
    totalCount: 0,
    termText: '',
    waitingText: '',
    hud: { top: 28, height: 32, below: 72 },
    world: null,
    view: { x: 0, y: 0, scale: 1 },
    plots: [],
    decor: [],
    sprites: [],
    animals: [],
    inventory: [],
    bagCount: 0,
    bagOpen: false,
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    hints: [],
    justOpened: '',
    welcome: null,
  },

  onLoad() {
    const rect = capsule()
    if (rect && rect.height) this.setData({ hud: { top: rect.top, height: rect.height, below: rect.bottom + 12 } })
  },

  onShow() {
    this.cancel()
    this.load()
  },

  onHide() {
    this.stopLife()
  },

  onUnload() {
    this.stopLife()
  },

  load() {
    return api.call('garden.get', { markSeen: true })
      .then((view) => {
        this.setData({ justOpened: '' })
        this.render(view, true)
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const info = windowInfo()
    if (!this.L) this.L = worldLayout(info.windowWidth || 375)
    const L = this.L
    this.garden = view
    this.open = openChecker(view.plots)
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    const inventory = inventoryList(view.inventory)
    const patch = {
      loaded: true,
      beans: view.beans,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      world: { width: L.width, height: L.height, viewWidth: L.viewWidth, viewHeight: L.viewHeight, margin: L.margin },
      plots: plotViews(view.plots, L, view.expandCost),
      decor: decorations(L),
      sprites: buildScene(view.placed, L),
      inventory,
      bagCount: inventory.reduce((sum, i) => sum + i.count, 0),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    }
    // 第一次进来把中间那块地摆到屏幕正中；之后保留拖到的位置
    if (!this.centered) {
      patch.view = centerOffset(L, info.windowWidth || 375, info.windowHeight || 667)
      this.centered = true
    }
    this.setData(patch)
    this.syncLife(view, fresh)
  },

  // movable-view 只在 x / y / scale-value 的值变了才会动：每次换一点点不同的小数
  recenter() {
    const info = windowInfo()
    const center = centerOffset(this.L, info.windowWidth || 375, info.windowHeight || 667)
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: center.x + d, y: center.y + d, scale: 1 + d / 100 } })
  },

  // ---------------------------------------------------------------- 背包与摆放

  openBag() {
    this.setData({ bagOpen: true })
  },

  closeBag() {
    this.setData({ bagOpen: false })
  },

  pickInventory(e) {
    const { id } = e.currentTarget.dataset
    const item = itemById(id)
    this.selected = { type: 'place', itemId: id }
    this.setData({
      bagOpen: false,
      mode: 'place',
      selectedName: item ? item.name : '',
      hints: hintTiles(this.garden.placed, this.L, null, this.open),
    })
    if (this.life) this.life.pause()
  },

  tapSprite(e) {
    if (this.data.mode !== 'view') return
    const uid = e.currentTarget.dataset.uid
    const sprite = this.data.sprites.find((s) => s.uid === uid)
    if (!sprite) return
    wx.showActionSheet({
      itemList: ['移动位置', '收回背包'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.selected = { type: 'move', uid }
          this.setData({ mode: 'move', selectedName: sprite.name, hints: hintTiles(this.garden.placed, this.L, uid, this.open) })
          if (this.life) this.life.pause()
        } else if (res.tapIndex === 1) {
          this.save('garden.stash', { uid }, `${sprite.name}收进背包了`)
        }
      },
    })
  },

  tapLand(e) {
    if (this.data.mode === 'view' || !this.selected) return
    const touch = (e.changedTouches && e.changedTouches[0]) || e.detail
    const x = touch.clientX != null ? touch.clientX : touch.x
    const y = touch.clientY != null ? touch.clientY : touch.y
    wx.createSelectorQuery()
      .select('#world')
      .boundingClientRect()
      .exec((res) => {
        const rect = res && res[0]
        if (!rect) return
        const tile = tileFromTouch(x, y, rect, this.L)
        if (!tile) return
        if (!this.data.hints.some((h) => h.c === tile.c && h.r === tile.r)) {
          wx.showToast({ title: this.open(tile.c, tile.r) ? '这块地上已经有东西了' : '这块地还没开荒呢', icon: 'none' })
          return
        }
        const sel = this.selected
        if (sel.type === 'place') this.save('garden.place', { itemId: sel.itemId, c: tile.c, r: tile.r })
        else this.save('garden.move', { uid: sel.uid, c: tile.c, r: tile.r })
      })
  },

  save(action, data, toast) {
    if (this.saving) return
    this.saving = true
    api.call(action, data)
      .then((view) => {
        this.saving = false
        this.cancel()
        this.render(view)
        if (toast) wx.showToast({ title: toast, icon: 'none' })
      })
      .catch((err) => {
        this.saving = false
        api.showError(err)
      })
  },

  cancel() {
    this.selected = null
    this.setData({ mode: 'view', selectedName: '', hints: [] })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 开荒

  tapSign(e) {
    const { key } = e.currentTarget.dataset
    const cost = this.garden && this.garden.expandCost
    if (this.data.mode !== 'view' || cost == null) return
    if (this.data.beans < cost) {
      wx.showToast({ title: `开荒要 ${cost} 暖豆，再攒攒`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '开荒',
      content: `花 ${cost} 暖豆开垦这块地？`,
      confirmText: '开垦',
      success: (res) => {
        if (!res.confirm) return
        api.call('garden.expand', { plot: key })
          .then((view) => {
            this.setData({ justOpened: key })
            this.render(view, true)
            wx.showToast({ title: '开垦好啦！', icon: 'none' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面、开荒之后重新安排；摆放、移动之后只告诉它们物件变了
  syncLife(view, fresh) {
    if (this.life && !fresh) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
      open: this.open,
      clock: this.clock || undefined,
      onChange: (i, sprite) => this.setData({ [`animals[${i}]`]: sprite }),
    })
    this.setData({ animals: this.life.sprites() })
    if (this.data.mode === 'view') this.life.start()
  },

  stopLife() {
    if (this.life) this.life.stop()
    this.life = null
  },

  tapAnimal(e) {
    if (this.data.mode !== 'view' || !this.life) return
    this.life.tap(e.currentTarget.dataset.index)
  },

  // ---------------------------------------------------------------- 跳转

  closeWelcome() {
    this.setData({ welcome: null })
  },

  // 点弹窗内容时不关闭弹窗
  noop() {},

  goGacha() {
    this.setData({ welcome: null })
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },

  goCollection() {
    wx.navigateTo({ url: '/pages/collection/collection' })
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
  },
})
```

- [ ] **Step 6: `garden.wxml`**（整份替换；`#world` 里的提示格、物件、小动物三段沿用现在 `#garden` 里的写法）

```xml
<view class="screen">
  <view wx:if="{{!loaded}}" class="loading">正在推开庭院的门…</view>

  <movable-area wx:if="{{loaded}}" class="map-area">
    <movable-view class="map" direction="all" inertia out-of-bounds="{{false}}" scale scale-min="0.5" scale-max="1.5" scale-value="{{view.scale}}" x="{{view.x}}" y="{{view.y}}" style="width: {{world.viewWidth}}px; height: {{world.viewHeight}}px">
      <view id="world" class="world" style="left: {{world.margin}}px; top: {{world.margin}}px; width: {{world.width}}px; height: {{world.height}}px" bindtap="tapLand">
        <image wx:for="{{decor}}" wx:key="key" class="decor {{item.cloud ? 'decor-cloud' : ''}}" src="{{item.image}}" mode="widthFix" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <image wx:for="{{plots}}" wx:key="key" class="plot {{item.key === justOpened ? 'plot-new' : ''}}" src="{{item.image}}" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px; z-index: {{item.z}}" />
        <view wx:for="{{plots}}" wx:key="key" wx:if="{{item.key === justOpened}}" class="dust" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.width / 2}}px">
          <view class="puff puff-1"></view>
          <view class="puff puff-2"></view>
          <view class="puff puff-3"></view>
          <view class="puff puff-4"></view>
        </view>
        <view wx:for="{{plots}}" wx:key="key" wx:if="{{item.sign}}" class="sign" style="left: {{item.sign.left}}px; bottom: {{item.sign.bottom}}px; width: {{item.sign.width}}px" data-key="{{item.key}}" catchtap="tapSign">
          <image class="sign-img" src="/images/garden/sign.png" mode="widthFix" />
          <view class="sign-text">开荒<text class="sign-cost">{{item.sign.cost}} 暖豆</text></view>
        </view>
        <image wx:for="{{hints}}" wx:key="key" class="hint" src="/images/garden/tile-hint.png" style="left: {{item.left}}px; top: {{item.top}}px; width: {{item.width}}px; height: {{item.height}}px" />
        <image wx:for="{{sprites}}" wx:key="uid" class="sprite {{mode === 'view' ? '' : 'sprite-ghost'}}" src="{{item.image}}" mode="widthFix" data-uid="{{item.uid}}" catchtap="tapSprite" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}" />
        <view wx:for="{{animals}}" wx:key="id" class="animal {{mode === 'view' ? '' : 'animal-ghost'}}" style="left: {{item.left}}px; bottom: {{item.bottom}}px; width: {{item.width}}px; z-index: {{item.z + 10}}; transition-duration: {{item.duration}}ms" data-index="{{index}}" catchtap="tapAnimal">
          <view wx:if="{{item.bubble}}" class="bubble" style="width: {{item.bubbleWidth}}px; left: {{item.bubbleLeft}}px; bottom: {{item.bubbleBottom}}px">{{item.bubble}}</view>
          <view wx:if="{{item.emoji}}" class="act-emoji">{{item.emoji}}</view>
          <view wx:if="{{item.tapping}}" class="heart">❤️</view>
          <view class="animal-body {{item.flip ? 'flip' : ''}} {{item.action === 'swim' ? 'in-water' : ''}}" style="height: {{item.bodyHeight}}px">
            <image class="animal-img act-{{item.action}} {{item.id === 'duck' && item.action === 'swim' ? 'paddle' : ''}} {{item.tapping ? 'tap' : ''}}" src="{{item.image}}" mode="widthFix" />
          </view>
          <view wx:if="{{item.action === 'swim'}}" class="ripple"></view>
        </view>
      </view>
    </movable-view>
  </movable-area>

  <block wx:if="{{loaded}}">
    <view class="hud-beans" style="top: {{hud.top}}px; height: {{hud.height}}px">
      <image class="beans-icon" src="/images/garden/ui/bean.png" mode="aspectFit" />
      <text class="beans-num">{{beans}}</text>
      <text class="beans-unit">暖豆</text>
    </view>
    <view class="hud-collect" style="top: {{hud.below}}px" bindtap="goCollection">图鉴 {{collectedCount}}/{{totalCount}} ›</view>
    <view class="hud-notes" style="top: {{hud.below + 52}}px">
      <view wx:if="{{termText}}" class="note">🍂 {{termText}}</view>
      <view wx:if="{{waitingText}}" class="note note-green">{{waitingText}}</view>
    </view>

    <view wx:if="{{mode === 'view'}}" class="recenter" bindtap="recenter">
      <image class="recenter-icon" src="/images/garden/ui/home.png" mode="aspectFit" />
    </view>
    <view wx:if="{{mode === 'view'}}" class="dock">
      <view class="dock-btn dock-main" bindtap="goGacha">
        <image class="dock-icon" src="/images/garden/ui/gacha.png" mode="aspectFit" />
        <text>扭蛋机</text>
      </view>
      <view class="dock-btn" bindtap="openBag">
        <image class="dock-icon" src="/images/garden/ui/basket.png" mode="aspectFit" />
        <text>背包</text>
        <view wx:if="{{bagCount}}" class="badge">{{bagCount}}</view>
      </view>
      <view class="dock-btn" bindtap="goCalendar">
        <image class="dock-icon" src="/images/garden/ui/calendar.png" mode="aspectFit" />
        <text>打卡日历</text>
      </view>
    </view>

    <view wx:if="{{mode !== 'view'}}" class="placing">
      <view class="placing-text">{{mode === 'place' ? '摆放' : '移动'}}「{{selectedName}}」：点一块亮着的空地</view>
      <button class="btn-plain btn-small" bindtap="cancel">取消</button>
    </view>

    <view wx:if="{{bagOpen}}" class="drawer-mask" catchtap="closeBag"></view>
    <view class="drawer {{bagOpen ? 'drawer-open' : ''}}">
      <view class="drawer-head">
        <text class="drawer-title">背包（点一下，摆进庭院）</text>
        <text class="drawer-close" catchtap="closeBag">✕</text>
      </view>
      <scroll-view wx:if="{{inventory.length}}" class="bag" scroll-x enhanced show-scrollbar="{{false}}">
        <view wx:for="{{inventory}}" wx:key="itemId" class="bag-item" style="border-color: {{item.rarityColor}}" data-id="{{item.itemId}}" bindtap="pickInventory">
          <image class="bag-image" src="{{item.image}}" mode="aspectFit" />
          <view class="bag-name">{{item.name}}</view>
          <view wx:if="{{item.count > 1}}" class="bag-count">×{{item.count}}</view>
        </view>
      </scroll-view>
      <view wx:else class="muted small">背包空空的，去扭蛋机试试手气吧～</view>
    </view>
  </block>

  <view wx:if="{{welcome}}" class="overlay" catchtap="closeWelcome">
    <view class="welcome" catchtap="noop">
      <image class="welcome-gift" src="/images/garden/ui/gift.png" mode="aspectFit" />
      <view class="welcome-title">欢迎来到你的养生庭院！</view>
      <view class="welcome-text">送你 {{welcome.beans}} 暖豆，还在院子中间种了一棵大树。每天好好吃饭攒暖豆，扭蛋抽花草，摆对东西小动物会搬来；暖豆攒多了还能开荒，把庭院越扩越大～</view>
      <button class="btn-primary" bindtap="goGacha">去扭蛋</button>
      <view class="link link-muted welcome-later" bindtap="closeWelcome">先看看</view>
    </view>
  </view>
</view>
```

- [ ] **Step 7: `garden.wxss`**

删除 `.topbar`、`.collect`、`.term`、`.garden`、`.land`、`.actions`、`.action`、`.action-main`、`.action-icon`、`.waiting`、`.placing`（及 `.placing-text` 保留但改位置，见下）规则；`.beans`、`.beans-icon`、`.beans-num`、`.beans-unit`、`.hint`、`.sprite`、`.sprite-ghost`、`button.btn-small`、`.bag*`、`.overlay`、`.welcome*`、小动物整段保留。文件开头加：

```css
/* ---------------------------------------------------------------- 全屏地图 */

page {
  height: 100%;
  overflow: hidden;
}

.screen {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #cfe6c4 0%, #e3efd6 45%, #f6f1e7 100%);
}

.loading {
  padding-top: 40vh;
  text-align: center;
  color: var(--muted);
}

.map-area {
  width: 100%;
  height: 100%;
}

.world {
  position: absolute;
}

.plot {
  position: absolute;
}

.plot-new {
  animation: plot-in 1s ease-out;
}

@keyframes plot-in {
  0% {
    opacity: 0.2;
  }
  100% {
    opacity: 1;
  }
}

.decor {
  position: absolute;
  pointer-events: none;
}

.decor-cloud {
  opacity: 0.9;
  animation: drift 24s ease-in-out infinite alternate;
}

@keyframes drift {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(40%);
  }
}

/* 开荒时冒的一团尘土 */
.dust {
  position: absolute;
  z-index: 9;
  pointer-events: none;
}

.puff {
  position: absolute;
  width: 28%;
  height: 40%;
  border-radius: 50%;
  background: rgba(214, 190, 150, 0.85);
  opacity: 0;
  animation: puff 1.2s ease-out forwards;
}

.puff-1 {
  left: 20%;
  top: 30%;
}

.puff-2 {
  left: 50%;
  top: 20%;
  animation-delay: 0.1s;
}

.puff-3 {
  left: 35%;
  top: 50%;
  animation-delay: 0.2s;
}

.puff-4 {
  left: 60%;
  top: 45%;
  animation-delay: 0.15s;
}

@keyframes puff {
  0% {
    opacity: 0.9;
    transform: scale(0.4);
  }
  100% {
    opacity: 0;
    transform: scale(1.6) translateY(-30%);
  }
}

/* 开荒木牌 */
.sign {
  position: absolute;
  z-index: 8;
  transform-origin: 50% 100%;
  animation: sway 2.6s ease-in-out infinite;
}

@keyframes sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}

.sign-img {
  display: block;
  width: 100%;
}

.sign-text {
  position: absolute;
  left: 0;
  right: 0;
  top: 14%;
  text-align: center;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.3;
  color: #5a3a1a;
}

.sign-cost {
  display: block;
  font-size: 24rpx;
  color: #b8461e;
}

/* ---------------------------------------------------------------- 浮在地图上的按钮 */

.hud-beans {
  position: absolute;
  left: 24rpx;
  z-index: 50;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 40rpx;
  padding: 0 24rpx 0 8rpx;
  box-shadow: 0 4rpx 12rpx rgba(60, 50, 30, 0.12);
}

.hud-collect {
  position: absolute;
  right: 24rpx;
  z-index: 50;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--primary);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 32rpx;
  padding: 10rpx 24rpx;
  box-shadow: 0 4rpx 12rpx rgba(60, 50, 30, 0.12);
}

.hud-notes {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  z-index: 50;
  pointer-events: none;
}

.note {
  display: inline-block;
  margin-bottom: 10rpx;
  padding: 10rpx 20rpx;
  font-size: 26rpx;
  color: #b8763a;
  background: rgba(255, 244, 224, 0.95);
  border-radius: 16rpx;
}

.note-green {
  color: var(--primary);
  background: rgba(238, 246, 234, 0.95);
}

.recenter {
  position: absolute;
  right: 24rpx;
  bottom: 220rpx;
  z-index: 50;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(60, 50, 30, 0.15);
}

.recenter-icon {
  width: 56rpx;
  height: 56rpx;
}

.dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 28rpx;
  z-index: 50;
  display: flex;
  justify-content: center;
  gap: 32rpx;
}

.dock-btn {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
  box-shadow: 0 6rpx 16rpx rgba(60, 50, 30, 0.16);
}

.dock-main {
  background: linear-gradient(180deg, #fff1e6 0%, #ffffff 100%);
  color: #c0442f;
}

.dock-icon {
  width: 88rpx;
  height: 88rpx;
}

.badge {
  position: absolute;
  top: 6rpx;
  right: 10rpx;
  min-width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  padding: 0 8rpx;
  border-radius: 18rpx;
  background: #e8553b;
  color: #fff;
  font-size: 22rpx;
  text-align: center;
  box-sizing: border-box;
}

.placing {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: 28rpx;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fffbe8;
  border-radius: 24rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 16rpx rgba(60, 50, 30, 0.16);
}

/* 背包抽屉 */
.drawer-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  background: rgba(47, 42, 36, 0.35);
}

.drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  background: var(--card);
  border-radius: 32rpx 32rpx 0 0;
  padding: 28rpx 32rpx 40rpx;
  transform: translateY(110%);
  transition: transform 0.25s ease-out;
}

.drawer-open {
  transform: translateY(0);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.drawer-title {
  font-size: 32rpx;
  font-weight: 700;
}

.drawer-close {
  font-size: 36rpx;
  color: var(--gray);
  padding: 0 8rpx;
}
```

（`.placing-text` 规则保留。）

- [ ] **Step 8: 删掉旧地块图**

```bash
git rm -q miniprogram/images/garden/land-6.png miniprogram/images/garden/land-8.png
grep -rn "land-6\|land-8\|landImage" miniprogram scripts test || echo "no references"
```

Expected: `no references`

- [ ] **Step 9: 跑测试**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: 全部 PASS

- [ ] **Step 10: 提交并推送**

```bash
node --check miniprogram/pages/garden/garden.js && node --check test/helpers/page-harness.js
git add -A
git commit -m "feat(garden): full-screen draggable, zoomable map with plots to clear

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
```

---

### Task 8: 截图检查、出图说明、文档、部署

**Files:**
- Modify（不进仓库）：scratchpad 的 `preview/wxml-render.js`（`movable-area` / `movable-view` 渲染成 div，按 `x` / `y` 做 translate）、`preview/shoot.js` / `shoot-animals.js`
- Create: `docs/art/garden-map-art-brief.md`
- Modify: `README.md`、`CLAUDE.md`、`docs/superpowers/specs/2026-10-23-big-garden-map-design.md`（状态改「已确认」）

- [ ] **Step 1: 截图检查**

渲染器：`movable-area` → `div`（`position: relative; width: 375px; height: 812px; overflow: hidden`），`movable-view` → `div`（`position: absolute; transform: translate({x}px, {y}px) scale({scale-value})`，`transform-origin: center`）。截：庭院首屏、缩到 0.5 倍看全岛、开荒后、背包抽屉打开、摆放模式；今日页卡片、结果页横幅、打卡日历。逐张看：地块拼接无缝、只有外圈露土边、木牌文字落在木板上、按钮不挡胶囊、印章颜色对。按需要调 `world.js` 的 `PLOT_SCREEN` / `MARGIN_SCREEN`、`.sign-text` 的 `top`、装饰位置。

- [ ] **Step 2: 出图说明** `docs/art/garden-map-art-brief.md`

内容：沿用 `docs/art/garden-art-brief.md` 的统一风格段落；新的一张 3×3 sprite sheet：① 荒地杂草丛（一小丛，透明底）② 另一种杂草丛 ③ 小石头堆 ④ 开荒木牌（木桩 + 空白木板，板上不要字）⑤ 尘土团 ⑥ 外围大树 ⑦ 外围灌木 ⑧ 云朵 ⑨ 竹篮背包图标；另说明日历图标、回到中间（小房子）图标可放第二张。文件名、切图方式同上次（zip 发来，或传到 `art/raw/`）。

- [ ] **Step 3: 文档**

README：「养生庭院」开头的「每天一棵树 → 暖豆」小节改为「每天打卡 → 暖豆」（印章说明、暖豆表保留）；「扭蛋机 → 庭院 → 图鉴」里「图鉴集齐 20 种…8×8」那条换成开荒说明（3×3 块、价格 100 起每块 +50、拖动缩放、回到中间）；目录结构加 `utils/world.js`；「图片」小节去掉每日树，加地块 / 木牌 / 装饰。CLAUDE.md 简介句去掉「长一棵树」，「当前状态」加一行大地图上线。设计文档状态改「已确认」。

- [ ] **Step 4: 全量测试、提交、推送**

```bash
npm test 2>&1 | grep -E "^# (pass|fail)"
du -sh miniprogram
git add -A && git commit -m "docs: big garden map in README; map art brief

<trailer>"
git push -u origin claude/mini-program-dev-nzn2n0
```

- [ ] **Step 5: 部署与预览**

```bash
npm run wx:function
npm run wx:preview
```

用 SendUserFile 发 `.wechat/preview-qrcode.jpg`，再附两张截图（首屏、缩小看全岛）；同时把 `docs/art/garden-map-art-brief.md` 发给用户。
