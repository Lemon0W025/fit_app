# 打卡动效和连续打卡里程碑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打卡相关页面加上短小的动效（盖章、数字滚动、浮现、呼吸、按压），连续打卡到 3、7、14……天时弹一次庆祝并发一枚纪念章。

**Architecture:** 里程碑规则放共用的 `shared/streak.js`（两边逐字节一致）；云函数在 `forest.syncDay` 判断「这一天刚开始算 + 连续天数正好是里程碑」，纪念章记在营地数据 `streakBadges`，打卡结果 `gain.milestone` 带回去。小程序这边：通用动画写在 `app.wxss`（页面加 class 就能用，节奏用 `animation-delay`），数字滚动和震动在 `utils/fx.js`（时钟可注入），彩带的纯计算在 `utils/confetti.js`，两个自定义组件 `medal`（纯 CSS 纪念章）和 `celebrate`（canvas 彩带 + 庆祝卡）。

**Tech Stack:** 微信小程序原生（WXML / WXSS / 自定义组件 / `canvas type="2d"`），云函数 Node，测试 `node:test`（零依赖），预览录屏 Playwright + ffmpeg（不进 package.json）。

设计文档：`docs/superpowers/specs/2026-10-25-checkin-effects-design.md`

## Global Constraints

- `npm test` 必须全绿再推；改了 JS 跑 `node --check`
- `cloudfunctions/api/lib/shared/` 与 `miniprogram/utils/shared/` 逐字节一致（`test/shared-sync.test.js` 查），shared 里不能用 `wx`
- 云函数响应 `{ ok, data }` / `{ ok: false, code, message }`，message 中文
- 面向长辈：字号偏大、文案口语化；动效短（一屏约 1.5 秒播完）、不闪、点一下跳到结束；震动只在盖章（`light`）和里程碑（`medium`）
- 不要声音；不引 Lottie、不换 UI 组件库；不加图片（主包上限 2MB，现在 1.68MB）
- 里程碑：`[3, 7, 14, 21, 30, 60, 100, 150, 200, 300, 365]`，365 以后每满 100 天
- 纪念章不给暖豆、不给装饰；删掉打卡不收回；同一天只触发一次；断了再连到同一天数 `times` 加一
- 组件的样式类名一律带前缀（`medal-*`、`cel-*`），不和页面、app.wxss 的类撞（预览渲染器没有样式隔离）
- 提交信息结尾带：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv
  ```
  只推 `claude/mini-program-dev-nzn2n0`

---

### Task 1: 共用规则 `shared/streak.js`

**Files:**
- Create: `cloudfunctions/api/lib/shared/streak.js`、`miniprogram/utils/shared/streak.js`（同一份）
- Test: `test/streak.test.js`

**Interfaces:**
- Produces:
  - `MILESTONES: number[]`
  - `isMilestone(days: number) → boolean`
  - `nextMilestone(days: number) → { days: number, left: number }`
  - `milestonesUpTo(days: number) → number[]`（升序）
  - `badgeLook(days: number) → { tier: 'bronze'|'silver'|'gold', glow: boolean }`

- [ ] **Step 1: 写测试 `test/streak.test.js`**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { MILESTONES, isMilestone, nextMilestone, milestonesUpTo, badgeLook } = require('../cloudfunctions/api/lib/shared/streak')

test('isMilestone：列表里的、365 以后每满 100 天', () => {
  for (const d of MILESTONES) assert.equal(isMilestone(d), true, String(d))
  for (const d of [0, 1, 2, 4, 6, 8, 29, 31, 364, 366, 400, 464]) assert.equal(isMilestone(d), false, String(d))
  for (const d of [465, 565, 1065]) assert.equal(isMilestone(d), true, String(d))
})

test('nextMilestone：下一个里程碑和还差几天', () => {
  assert.deepEqual(nextMilestone(0), { days: 3, left: 3 })
  assert.deepEqual(nextMilestone(2), { days: 3, left: 1 })
  assert.deepEqual(nextMilestone(3), { days: 7, left: 4 })
  assert.deepEqual(nextMilestone(300), { days: 365, left: 65 })
  assert.deepEqual(nextMilestone(365), { days: 465, left: 100 })
  assert.deepEqual(nextMilestone(366), { days: 465, left: 99 })
  assert.deepEqual(nextMilestone(465), { days: 565, left: 100 })
  assert.deepEqual(nextMilestone(undefined), { days: 3, left: 3 })
})

test('milestonesUpTo：不超过这个天数的里程碑', () => {
  assert.deepEqual(milestonesUpTo(2), [])
  assert.deepEqual(milestonesUpTo(7), [3, 7])
  assert.deepEqual(milestonesUpTo(20), [3, 7, 14])
  assert.deepEqual(milestonesUpTo(565).slice(-3), [365, 465, 565])
})

test('badgeLook：铜、银、金，365 起带光', () => {
  assert.deepEqual(badgeLook(3), { tier: 'bronze', glow: false })
  assert.deepEqual(badgeLook(7), { tier: 'bronze', glow: false })
  assert.deepEqual(badgeLook(14), { tier: 'silver', glow: false })
  assert.deepEqual(badgeLook(30), { tier: 'silver', glow: false })
  assert.deepEqual(badgeLook(60), { tier: 'gold', glow: false })
  assert.deepEqual(badgeLook(365), { tier: 'gold', glow: true })
  assert.deepEqual(badgeLook(465), { tier: 'gold', glow: true })
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/streak.test.js`
Expected: FAIL，`Cannot find module '../cloudfunctions/api/lib/shared/streak'`

- [ ] **Step 3: 写 `cloudfunctions/api/lib/shared/streak.js`**

```js
// 与 miniprogram/utils/shared/streak.js 保持一致（test/shared-sync.test.js 会检查）
// 连续打卡的里程碑和纪念章：连续第 3、7、14……天庆祝一次、发一枚纪念章（连续天数怎么算见 forest.js 的 streakFrom）

const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 150, 200, 300, 365]
const LAST = MILESTONES[MILESTONES.length - 1]
const EVERY_AFTER = 100 // 365 以后每满 100 天再算一次

function isMilestone(days) {
  if (MILESTONES.indexOf(days) !== -1) return true
  return days > LAST && (days - LAST) % EVERY_AFTER === 0
}

// 比 days 大的下一个里程碑，和还差几天
function nextMilestone(days) {
  const n = Math.max(0, Math.floor(days || 0))
  const next = MILESTONES.find((m) => m > n) || LAST + EVERY_AFTER * (Math.floor((n - LAST) / EVERY_AFTER) + 1)
  return { days: next, left: next - n }
}

// 不超过 days 的里程碑，从小到大
function milestonesUpTo(days) {
  const list = MILESTONES.filter((m) => m <= days)
  for (let m = LAST + EVERY_AFTER; m <= days; m += EVERY_AFTER) list.push(m)
  return list
}

// 纪念章的样子：3、7 天铜，14～30 天银，60 天以上金；365 天起外面一圈光
function badgeLook(days) {
  return { tier: days >= 60 ? 'gold' : days >= 14 ? 'silver' : 'bronze', glow: days >= LAST }
}

module.exports = { MILESTONES, isMilestone, nextMilestone, milestonesUpTo, badgeLook }
```

再复制一份到小程序：`cp cloudfunctions/api/lib/shared/streak.js miniprogram/utils/shared/streak.js`

- [ ] **Step 4: 跑测试看它通过**

Run: `node --test test/streak.test.js test/shared-sync.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api/lib/shared/streak.js miniprogram/utils/shared/streak.js test/streak.test.js
git commit -m "feat(streak): shared milestone rules for consecutive check-in days"
```

---

### Task 2: 云函数：里程碑判断、纪念章、接口字段

**Files:**
- Modify: `cloudfunctions/api/lib/camp-state.js`（`normalizeCamp` 补 `streakBadges`）
- Modify: `cloudfunctions/api/services/forest.js`（`syncDay`、`todayView`、`get`）
- Modify: `cloudfunctions/api/services/meal.js`（`beansChange` 多一个参数，`analyze` 带 `milestone`）
- Test: `test/services-forest.test.js`、`test/services-meal.test.js`、`test/cloud-e2e.test.js`

**Interfaces:**
- Consumes: Task 1 的 `isMilestone`、`nextMilestone`、`milestonesUpTo`、`badgeLook`；`shared/forest.js` 的 `streakFrom(days, today)`
- Produces:
  - `forest.syncDay(openid, date) → { beans, milestone }`，`milestone` 为 `null` 或 `{ days, times, tier, glow, petId }`
  - `forest.today(...)` 多 `nextMilestone: { days, left }`
  - `forest.get(...)` 多 `badges: [{ days, tier, glow, got: true, first, times } | { days, tier, glow, got: false, left? }]`
  - 打卡结果 `gain.milestone`（同上，没有为 `null`）
  - 营地数据 `streakBadges: { '<天数>': { first, last, times } }`

- [ ] **Step 1: 改 forest 的旧测试 + 写新测试（`test/services-forest.test.js`）**

把前三个测试里的 `assert.deepEqual(await forest.syncDay(...), { beans: N })` 改成带 `milestone: null`：

```js
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 5, milestone: null })
  ...
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 20, milestone: null })
  ...
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 0, milestone: null })
```

在 `today：今天的印章、暖豆、提示……` 测试最后（`assert.equal(view.nextGain, undefined)` 前）加：

```js
  assert.deepEqual(view.nextMilestone, { days: 7, left: 3 })
```

在 `today：还没有营地时也能返回` 测试里 `assert.equal(empty.streak, 0)` 后加：

```js
  assert.deepEqual(empty.nextMilestone, { days: 3, left: 3 })
```

文件末尾加：

```js
async function lunchOn(repo, forest, ...daysAgo) {
  for (const i of daysAgo) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
}

test('syncDay：当天第一顿正餐让连续天数正好到里程碑，带 milestone 并记下纪念章；第二顿不再带', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'breakfast')
  const first = await forest.syncDay('u1', TODAY)
  assert.deepEqual(first.milestone, { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
  assert.deepEqual((await repo.getGarden('u1')).streakBadges, { 3: { first: TODAY, last: TODAY, times: 1 } })
})

test('syncDay：删掉打卡这天不算了，纪念章不收回；同一天再拍不再庆祝', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'breakfast')
  await forest.syncDay('u1', TODAY)
  repo.state.meals = repo.state.meals.filter((m) => m.date !== TODAY)
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
  const garden = await repo.getGarden('u1')
  assert.equal(garden.days[TODAY], undefined)
  assert.deepEqual(garden.streakBadges, { 3: { first: TODAY, last: TODAY, times: 1 } })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
})

test('syncDay：断了以后再连到同一个天数，记第 2 次', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 10, 9, 8)
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'lunch')
  const m = (await forest.syncDay('u1', TODAY)).milestone
  assert.equal(m.days, 3)
  assert.equal(m.times, 2)
  assert.deepEqual((await repo.getGarden('u1')).streakBadges[3], { first: addDays(TODAY, -8), last: TODAY, times: 2 })
})

test('syncDay：milestone 带营地里喂得最多的那只，一样多取先来的', async () => {
  const { repo, forest } = setup()
  await repo.saveGarden('u1', {
    camp: 1,
    pets: [{ id: 'doudou', fed: 4 }, { id: 'nuonuo', fed: 9 }, { id: 'qiqi', fed: 9 }],
    days: { [addDays(TODAY, -2)]: true, [addDays(TODAY, -1)]: true },
  })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone.petId, 'nuonuo')
})

test('get：纪念章列到下一个为止，已拿的带第一次的日期和次数；以前拿过更大的也列出来', async () => {
  const { repo, forest } = setup()
  const days = {}
  for (let i = 0; i < 5; i++) days[addDays(TODAY, -i)] = true
  await repo.saveGarden('u1', { camp: 1, days, streakBadges: { 3: { first: '2026-10-20', last: '2026-10-20', times: 1 } } })
  assert.deepEqual((await forest.get('u1', {})).badges, [
    { days: 3, tier: 'bronze', glow: false, got: true, first: '2026-10-20', times: 1 },
    { days: 7, tier: 'bronze', glow: false, got: false, left: 2 },
  ])
  await repo.saveGarden('u1', { camp: 1, days: { [TODAY]: true }, streakBadges: { 3: { first: '2026-09-03', last: '2026-09-03', times: 1 }, 7: { first: '2026-09-07', last: '2026-09-07', times: 1 } } })
  assert.deepEqual((await forest.get('u1', {})).badges.map((b) => [b.days, b.got, b.left]), [[3, true, undefined], [7, true, undefined]])
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/services-forest.test.js`
Expected: FAIL（`syncDay` 返回值没有 `milestone`、`nextMilestone` / `badges` 是 undefined）

- [ ] **Step 3: 实现**

`cloudfunctions/api/lib/camp-state.js` 的 `normalizeCamp` 返回对象最后 `days: src.days || {},` 下面加一行：

```js
    streakBadges: src.streakBadges || {},
```

`cloudfunctions/api/services/forest.js`：

顶部引入：

```js
const { isMilestone, nextMilestone, milestonesUpTo, badgeLook } = require('../lib/shared/streak')
```

`function shiftMonth` 后面加两个小函数：

```js
// 营地里和妈妈最亲的那只：喂得最多的，一样多取先来的；没有宠物为空
function closestPet(pets) {
  let best = null
  ;(pets || []).forEach((p) => {
    if (!best || (p.fed || 0) > (best.fed || 0)) best = p
  })
  return best ? best.id : ''
}

// 打卡日历顶上的纪念章：列到下一个里程碑为止（以前拿过更大的也列上），已拿的带第一次的日期和次数
function badgesOf(streakBadges, streak) {
  const next = nextMilestone(streak)
  const upTo = Math.max(next.days, ...Object.keys(streakBadges).map(Number))
  return milestonesUpTo(upTo).map((days) => {
    const got = streakBadges[days]
    const base = { days, ...badgeLook(days) }
    if (got) return { ...base, got: true, first: got.first, times: got.times }
    return days === next.days ? { ...base, got: false, left: next.left } : { ...base, got: false }
  })
}
```

`todayView` 里 `streak: ...` 那行换成先算出来再用：

```js
  function todayView(date, meals, garden, profile, monthMeals) {
    const times = mealTimesOf(profile)
    const streak = streakFrom(garden.days, dateKey(now()))
    return {
      date,
      stamps: mealStamps(meals),
      beansToday: dayBeans(meals).beans,
      hint: beansHint(meals, times, now()),
      streak,
      nextMilestone: nextMilestone(streak),
      beans: Math.max(0, beanBalance(garden)),
      monthOnTime: onTimeCount(monthMeals),
      mealTimes: times,
    }
  }
```

`syncDay` 整个换成：

```js
    // 打卡新增、重新分析、删除之后调用：按这一天的正餐重算当天的暖豆，重复调用结果不变。
    // 这一天刚从「没算」变成「算了」、连续天数又正好是里程碑时，记一枚纪念章并返回 milestone（同一天只记一次）
    async syncDay(openid, date) {
      const { beans, logged } = dayBeans(await repo.listMeals(openid, date))
      const garden = await load(openid)
      const days = { ...garden.days }
      const earned = { ...garden.beans.earned }
      let streakBadges = garden.streakBadges
      let milestone = null
      if (!logged.length) {
        delete days[date]
        delete earned[date]
      } else {
        const counted = !!days[date]
        days[date] = true
        earned[date] = beans
        const streak = streakFrom(days, date)
        const had = streakBadges[streak]
        if (!counted && isMilestone(streak) && !(had && had.last === date)) {
          const badge = had ? { ...had, last: date, times: had.times + 1 } : { first: date, last: date, times: 1 }
          streakBadges = { ...streakBadges, [streak]: badge }
          milestone = { days: streak, times: badge.times, ...badgeLook(streak), petId: closestPet(garden.pets) }
        }
      }
      await repo.saveGarden(openid, { ...garden, days, beans: { ...garden.beans, earned }, streakBadges })
      return { beans, milestone }
    },
```

`get` 的返回对象 `totalDays: ...` 后面加：

```js
        badges: badgesOf(garden.streakBadges, streakFrom(garden.days, today)),
```

- [ ] **Step 4: 跑 forest 测试看它通过**

Run: `node --test test/services-forest.test.js test/camp-state.test.js`
Expected: PASS

- [ ] **Step 5: 写 meal 的测试（`test/services-meal.test.js`）**

`analyze 正餐：返回这次多得的暖豆……` 那个测试的 `assert.deepEqual(meal.gain, { ... allOnTime: false, })` 里 `allOnTime: false,` 后面加一行 `milestone: null,`。

文件末尾加：

```js
test('analyze 正餐：这顿让连续打卡到 3 天，gain 带 milestone；重新分析不带', async () => {
  const { addDays } = require('../cloudfunctions/api/lib/shared/date')
  const { service } = setup({
    results: [analysisJson(), analysisJson()],
    garden: { camp: 1, days: { [addDays(TODAY, -2)]: true, [addDays(TODAY, -1)]: true } },
  })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭' })
  assert.deepEqual(meal.gain.milestone, { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' })
  const again = await service.reanalyze('u1', { mealId: meal._id, note: '米饭半碗' })
  assert.equal(again.gain.milestone, null)
})
```

- [ ] **Step 6: 跑测试看它失败**

Run: `node --test test/services-meal.test.js`
Expected: FAIL（`gain` 里没有 `milestone`）

- [ ] **Step 7: 实现 `cloudfunctions/api/services/meal.js`**

`beansChange` 加第 6 个参数并带上：

```js
function beansChange(beforeMeals, afterMeals, meal, times, at, milestone = null) {
  const before = dayBeans(beforeMeals)
  const after = dayBeans(afterMeals)
  return {
    beans: after.beans - before.beans,
    beansToday: after.beans,
    hint: beansHint(afterMeals, times, at),
    stamps: mealStamps(afterMeals),
    mealType: meal.mealType,
    timing: meal.timing || null,
    // 这一次让三顿都准时了（结果页额外庆祝一下）
    allOnTime: after.allOnTime && !before.allOnTime,
    // 这一次让连续打卡到了里程碑（结果页弹庆祝、发纪念章）
    milestone,
  }
}
```

`analyze` 里：

```js
      if (isMainMeal(src.mealType)) {
        const synced = await forest.syncDay(openid, date)
        gain = beansChange(meals, meals.concat(saved), saved, times, at, synced.milestone)
        arrival = await camp.arrive(openid)
      }
```

（`reanalyze` 里的 `beansChange(...)` 不改，默认 `null`。）

- [ ] **Step 8: 端到端测试（`test/cloud-e2e.test.js` 末尾加）**

```js
test('连续打卡：第 3、7 天的第一顿正餐带里程碑，同一天第二顿不带；日历列出纪念章', async (t) => {
  const clock = fixDate(t, '2026-10-16T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: Array.from({ length: 8 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  const got = []
  for (let i = 0; i < 7; i++) {
    clock.set(`2026-10-${16 + i}T08:00:00+08:00`)
    const res = await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥' } })
    assert.equal(res.ok, true, res.message)
    got.push(res.data.gain.milestone && res.data.gain.milestone.days)
  }
  assert.deepEqual(got, [null, null, 3, null, null, null, 7])
  clock.set('2026-10-22T12:10:00+08:00')
  const lunch = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭' } })
  assert.equal(lunch.data.gain.milestone, null)
  const garden = cloud.db.collections.get('gardens').get('u1')
  assert.deepEqual(garden.streakBadges, {
    3: { first: '2026-10-18', last: '2026-10-18', times: 1 },
    7: { first: '2026-10-22', last: '2026-10-22', times: 1 },
  })
  const forest = await main({ action: 'forest.get' })
  assert.deepEqual(forest.data.today.nextMilestone, { days: 14, left: 7 })
  assert.deepEqual(forest.data.badges.map((b) => [b.days, b.got]), [[3, true], [7, true], [14, false]])
})
```

- [ ] **Step 9: 跑全部测试**

Run: `npm test`
Expected: 全绿（`test/pages.test.js` 里首页的 `streakText` 还没改，这一步不受影响）

- [ ] **Step 10: 提交**

```bash
node --check cloudfunctions/api/services/forest.js && node --check cloudfunctions/api/services/meal.js
git add cloudfunctions/api test/services-forest.test.js test/services-meal.test.js test/cloud-e2e.test.js
git commit -m "feat(streak): award a badge when a day's first main meal reaches a streak milestone"
```

---

### Task 3: `utils/fx.js`（数字滚动、震动、时钟）和测试环境的震动

**Files:**
- Create: `miniprogram/utils/fx.js`
- Modify: `test/helpers/page-harness.js`（`wx.vibrateShort` 记到 `log.vibrations`）
- Test: `test/fx.test.js`

**Interfaces:**
- Produces:
  - `REAL_CLOCK = { set(fn, ms) → handle, clear(handle) }`
  - `clockOf(owner) → owner.clock || REAL_CLOCK`
  - `countUp(from, to, ms, onStep, clock = REAL_CLOCK) → { finish(), cancel(), done() → boolean }`：先调一次 `onStep(from)`，之后每 40ms 一步（缓出），最后一步一定是 `onStep(to)`；`from === to` 或 `ms <= 0` 直接 `onStep(to)`、不留定时器
  - `buzz(type = 'light')`：`wx.vibrateShort({ type })`，没有这个接口就什么都不做
  - 测试环境：`wx.log.vibrations: string[]`

- [ ] **Step 1: 写测试 `test/fx.test.js`**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { manualClock } = require('./helpers/manual-clock')
const { countUp, buzz, clockOf, REAL_CLOCK } = require('../miniprogram/utils/fx')

test('countUp：从 from 滚到 to，中途单调不超过，最后一步正好是 to', () => {
  const clock = manualClock()
  const seen = []
  const c = countUp(0, 520, 800, (n) => seen.push(n), clock)
  assert.equal(seen[0], 0)
  clock.advance(400)
  assert.ok(seen.length > 3)
  clock.advance(1000)
  assert.equal(seen[seen.length - 1], 520)
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && seen[i] <= 520)
  assert.equal(c.done(), true)
  assert.equal(clock.count(), 0)
})

test('countUp：finish 直接到目标值，cancel 停在原地；一样的数不留定时器', () => {
  const clock = manualClock()
  const seen = []
  const c = countUp(10, 30, 600, (n) => seen.push(n), clock)
  c.finish()
  assert.equal(seen[seen.length - 1], 30)
  assert.equal(clock.count(), 0)
  c.finish()
  assert.equal(seen.filter((n) => n === 30).length, 1)

  const stay = []
  const s = countUp(0, 100, 600, (n) => stay.push(n), clock)
  clock.advance(80)
  s.cancel()
  assert.equal(clock.count(), 0)
  assert.ok(stay[stay.length - 1] < 100)

  const same = []
  countUp(7, 7, 600, (n) => same.push(n), clock)
  assert.deepEqual(same, [7])
  assert.equal(clock.count(), 0)
})

test('buzz：有 wx.vibrateShort 就震，没有就跳过；clockOf 用注入的时钟', () => {
  const calls = []
  global.wx = { vibrateShort: (o) => calls.push(o.type) }
  buzz('medium')
  buzz()
  assert.deepEqual(calls, ['medium', 'light'])
  global.wx = {}
  assert.doesNotThrow(() => buzz('light'))
  const clock = manualClock()
  assert.equal(clockOf({ clock }), clock)
  assert.equal(clockOf({}), REAL_CLOCK)
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/fx.test.js`
Expected: FAIL，`Cannot find module '../miniprogram/utils/fx'`

- [ ] **Step 3: 写 `miniprogram/utils/fx.js`**

```js
// 打卡页面的小动效：数字滚动、轻震。定时器走 this.clock（测试里注入手动时钟快进），没有就用真的

const REAL_CLOCK = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
const FRAME_MS = 40

function clockOf(owner) {
  return (owner && owner.clock) || REAL_CLOCK
}

// 数字从 from 滚到 to（缓出）：先给一次 from，每 40ms 一步，最后一步一定是 to
function countUp(from, to, ms, onStep, clock = REAL_CLOCK) {
  const steps = Math.max(1, Math.round(ms / FRAME_MS))
  let i = 0
  let handle = null
  let over = false
  const stop = () => {
    over = true
    if (handle) clock.clear(handle)
    handle = null
  }
  const finish = () => {
    if (over) return
    stop()
    onStep(to)
  }
  const tick = () => {
    handle = null
    i += 1
    if (i >= steps) return finish()
    const t = i / steps
    onStep(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))))
    handle = clock.set(tick, FRAME_MS)
  }
  if (from === to || ms <= 0) finish()
  else {
    onStep(from)
    handle = clock.set(tick, FRAME_MS)
  }
  return { finish, cancel: stop, done: () => over }
}

// 轻轻震一下：盖章 light、里程碑 medium；没有这个接口（老版本、开发者工具）就算了
function buzz(type = 'light') {
  if (typeof wx === 'undefined' || !wx || typeof wx.vibrateShort !== 'function') return
  wx.vibrateShort({ type, fail() {} })
}

module.exports = { REAL_CLOCK, clockOf, countUp, buzz }
```

- [ ] **Step 4: 测试环境加震动记录**

`test/helpers/page-harness.js` 的 `createWx` 里：

```js
  const log = { toasts: [], modals: [], nav: [], uploads: [], downloads: [], vibrations: [] }
```

`wx` 对象里（`previewImage() {},` 后面）加：

```js
    vibrateShort(o) {
      log.vibrations.push((o && o.type) || 'heavy')
    },
```

- [ ] **Step 5: 跑测试看它通过**

Run: `node --test test/fx.test.js && npm test`
Expected: PASS，全绿

- [ ] **Step 6: 提交**

```bash
node --check miniprogram/utils/fx.js
git add miniprogram/utils/fx.js test/fx.test.js test/helpers/page-harness.js
git commit -m "feat(fx): count-up, gentle vibration and injectable clock for check-in effects"
```

---

### Task 4: 展示字段（view.js）、小暖的话、通用动画（app.wxss）

**Files:**
- Create: `miniprogram/utils/milestone-lines.js`
- Modify: `miniprogram/utils/view.js`
- Modify: `miniprogram/app.wxss`
- Test: `test/view.test.js`

**Interfaces:**
- Consumes: Task 1 的 `nextMilestone` 字段形状 `{ days, left }`；Task 2 的 `milestone`、`badges` 形状；`camp-view.js` 的 `petImage(id)`
- Produces（`utils/view.js` 新增 / 改动的导出）：
  - `gainTitle(gain, shown = gain.beans) → string`：`gain.beans > 0` 时按 `shown` 写数字，否则「这顿记下啦」
  - `decorateGain(gain, { fresh } = {})`：`fresh` 时这次那顿的印章 `cls` 多 ` fx-stamp`
  - `streakText(daily) → string`
  - `beansCard(daily).streakText` 用 `streakText`
  - `milestoneView(m) → { days, tier, glow, title, sub, line, image }`
  - `badgesView(badges) → [{ ...b, label, firstText }]`
  - `analysisSteps(hasPhoto, at) → [{ label, state: 'done'|'now'|'todo' }]`
  - `buildCalendarCells(days, firstWeekday, today)`：格子多 `isToday`
  - app.wxss 的类：`fx-rise`、`fx-pop`、`fx-d1`～`fx-d8`、`fx-stamp`、`fx-breathe`、`fx-breathe-warn`、`fx-nudge`、`fx-press`、`fx-skip`

- [ ] **Step 1: 写测试（`test/view.test.js`）**

把 `test/view.test.js` 第 97 行的 require 换成：

```js
const { stampsView, decorateGain, gainTitle, beansCard, streakText, milestoneView, badgesView, analysisSteps, buildCalendarCells, nextMealCard } = require('../miniprogram/utils/view')
```

`beansCard：今天的暖豆卡片` 测试里两处改成：

```js
  assert.equal(card.streakText, '🔥 已连续 3 天 · 再 4 天拿 7 天纪念章')
```

```js
  assert.equal(empty.streakText, '今天拍一顿，开始连续打卡')
```

并把这两个 `beansCard({...})` 调用各加上 `nextMilestone` 字段：第一个 `nextMilestone: { days: 7, left: 4 }`，第二个 `nextMilestone: { days: 3, left: 3 }`。

文件末尾加：

```js
test('gainTitle / decorateGain：滚动时按显示的数写；刚打完卡这顿的印章要盖', () => {
  const raw = { beans: 20, stamps: STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false }
  assert.equal(gainTitle(raw), '午饭准时打卡 +20 暖豆')
  assert.equal(gainTitle(raw, 0), '午饭准时打卡 +0 暖豆')
  assert.equal(gainTitle({ ...raw, timing: 'late' }, 3), '+3 暖豆')
  assert.equal(gainTitle({ ...raw, beans: 0 }, 0), '这顿记下啦')
  const fresh = decorateGain(raw, { fresh: true })
  assert.deepEqual(fresh.stamps.map((s) => s.cls), ['stamp-green stamp-on', 'stamp-done fx-stamp', 'stamp-none'])
  assert.deepEqual(decorateGain(raw).stamps.map((s) => s.cls), ['stamp-green stamp-on', 'stamp-done', 'stamp-none'])
})

test('streakText：连续几天 + 还差几天拿下一枚', () => {
  const stamps = (done) => [{ state: done ? 'green' : 'none' }, { state: 'none' }, { state: 'none' }]
  assert.equal(streakText({ streak: 0, nextMilestone: { days: 3, left: 3 }, stamps: stamps(false) }), '今天拍一顿，开始连续打卡')
  assert.equal(streakText({ streak: 5, nextMilestone: { days: 7, left: 2 }, stamps: stamps(true) }), '🔥 已连续 5 天 · 再 2 天拿 7 天纪念章')
  assert.equal(streakText({ streak: 6, nextMilestone: { days: 7, left: 1 }, stamps: stamps(true) }), '🔥 已连续 6 天 · 明天再拍就拿 7 天纪念章')
  assert.equal(streakText({ streak: 6, nextMilestone: { days: 7, left: 1 }, stamps: stamps(false) }), '🔥 已连续 6 天 · 今天拍一顿就拿 7 天纪念章')
  assert.equal(streakText({ streak: 2 }), '🔥 已连续 2 天')
})

test('milestoneView：庆祝卡的标题、第几次、小暖的话、最亲的小动物', () => {
  const v = milestoneView({ days: 7, times: 1, tier: 'bronze', glow: false, petId: 'doudou' })
  assert.deepEqual(v, {
    days: 7, tier: 'bronze', glow: false,
    title: '连续打卡 7 天！', sub: '', line: '一周都没落下，身体会记得的', image: '/images/camp/pets/doudou.png',
  })
  const again = milestoneView({ days: 465, times: 2, tier: 'gold', glow: true, petId: '' })
  assert.equal(again.sub, '第 2 次做到')
  assert.equal(again.line, '连续 465 天，小暖为你骄傲')
  assert.equal(again.image, '/images/garden/ui/bean.png')
  assert.equal(milestoneView(null), null)
})

test('badgesView：已拿的写天数和第一次的日子，下一个写还差几天', () => {
  const v = badgesView([
    { days: 3, tier: 'bronze', glow: false, got: true, first: '2026-10-18', times: 2 },
    { days: 7, tier: 'bronze', glow: false, got: false, left: 2 },
    { days: 14, tier: 'silver', glow: false, got: false },
  ])
  assert.deepEqual(v.map((b) => [b.label, b.firstText]), [['3 天', '2026年10月18日'], ['还差 2 天', ''], ['14 天', '']])
  assert.deepEqual(badgesView(undefined), [])
})

test('analysisSteps：有照片三步、没照片两步，走到哪步前面打勾', () => {
  assert.deepEqual(analysisSteps(true, 0).map((s) => [s.label, s.state]), [['上传照片', 'now'], ['认出菜', 'todo'], ['算热量', 'todo']])
  assert.deepEqual(analysisSteps(true, 2).map((s) => s.state), ['done', 'done', 'now'])
  assert.deepEqual(analysisSteps(false, 1).map((s) => [s.label, s.state]), [['认出菜', 'done'], ['算热量', 'now']])
})

test('buildCalendarCells：今天那格标出来', () => {
  const days = [
    { date: '2026-10-21', day: 21, future: false, stamps: [], beans: 0, mealsCount: 0, kcal: 0 },
    { date: '2026-10-22', day: 22, future: false, stamps: [], beans: 0, mealsCount: 0, kcal: 0 },
  ]
  const cells = buildCalendarCells(days, 3, '2026-10-22')
  assert.deepEqual(cells.filter((c) => !c.blank).map((c) => c.isToday), [false, true])
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/view.test.js`
Expected: FAIL（`gainTitle is not a function` 等）

- [ ] **Step 3: 写 `miniprogram/utils/milestone-lines.js`**

```js
// 里程碑庆祝卡上小暖说的一句话（按连续天数挑；没写到的天数用通用的一句）
const LINES = {
  3: '三天都没落下，好的开始！',
  7: '一周都没落下，身体会记得的',
  14: '两周了，吃饭越来越有规律啦',
  21: '21 天，好习惯已经养成一半了',
  30: '一个月了，这已经是习惯啦',
  60: '两个月天天打卡，小暖都佩服你',
  100: '一百天！你比小暖还坚持',
  150: '一百五十天，营地里的大家都看着呢',
  200: '两百天，好好吃饭已经刻进日子里了',
  300: '三百天，真的很了不起',
  365: '整整一年！每一顿都算数',
}

function milestoneLine(days) {
  return LINES[days] || `连续 ${days} 天，小暖为你骄傲`
}

module.exports = { milestoneLine }
```

- [ ] **Step 4: 改 `miniprogram/utils/view.js`**

顶部 require 加：

```js
const { petImage } = require('./camp-view')
const { milestoneLine } = require('./milestone-lines')
```

`decorateGain` 换成下面两个函数：

```js
// 结果页暖豆横幅的标题；shown 是滚动时正在显示的数（默认就是这次得的）
function gainTitle(gain, shown = gain.beans) {
  if (!(gain.beans > 0)) return '这顿记下啦'
  return gain.timing === 'on' ? `${MEAL_WORDS[gain.mealType]}准时打卡 +${shown} 暖豆` : `+${shown} 暖豆`
}

// 打卡结果页：这次打卡多得了多少暖豆，准时的写清楚是哪顿准时；fresh（刚打完卡进来）时这顿的印章要「盖」一下
function decorateGain(gain, { fresh = false } = {}) {
  if (!gain) return null
  const stamps = stampsView(gain.stamps).map((s) => (fresh && s.key === gain.mealType ? { ...s, cls: `${s.cls} fx-stamp` } : s))
  return {
    title: gainTitle(gain),
    bonus: gain.allOnTime ? `三顿都准时，再加 ${BEANS.allOnTime}！` : '',
    hint: gain.hint,
    stamps,
  }
}
```

`beansCard` 的 `streakText:` 那行换成 `streakText: streakText(daily),`，并在 `beansCard` 前面加：

```js
// 暖豆卡上的连续天数，带着下一枚纪念章的盼头
function streakText(daily) {
  const streak = daily.streak || 0
  if (!streak) return '今天拍一顿，开始连续打卡'
  const head = `🔥 已连续 ${streak} 天`
  const next = daily.nextMilestone
  if (!next) return head
  if (next.left === 1) {
    const todayDone = (daily.stamps || []).some((s) => s.state !== 'none')
    return `${head} · ${todayDone ? '明天再拍' : '今天拍一顿'}就拿 ${next.days} 天纪念章`
  }
  return `${head} · 再 ${next.left} 天拿 ${next.days} 天纪念章`
}
```

文件末尾（`module.exports` 前）加：

```js
// ---------------------------------------------------------------- 连续打卡里程碑

// 结果页的庆祝卡
function milestoneView(m) {
  if (!m) return null
  return {
    days: m.days,
    tier: m.tier,
    glow: m.glow,
    title: `连续打卡 ${m.days} 天！`,
    sub: m.times > 1 ? `第 ${m.times} 次做到` : '',
    line: milestoneLine(m.days),
    image: m.petId ? petImage(m.petId) : '/images/garden/ui/bean.png',
  }
}

// 打卡日历顶上的一排纪念章
function badgesView(badges) {
  return (badges || []).map((b) => {
    const [y, m, d] = (b.first || '').split('-')
    return {
      ...b,
      label: b.got || !b.left ? `${b.days} 天` : `还差 ${b.left} 天`,
      firstText: b.first ? `${y}年${Number(m)}月${Number(d)}日` : '',
    }
  })
}

// 打卡页等小暖分析时的几步：有照片先上传
function analysisSteps(hasPhoto, at) {
  const labels = hasPhoto ? ['上传照片', '认出菜', '算热量'] : ['认出菜', '算热量']
  return labels.map((label, i) => ({ label, state: i < at ? 'done' : i === at ? 'now' : 'todo' }))
}
```

`buildCalendarCells` 加第三个参数：

```js
function buildCalendarCells(days, firstWeekday, today = '') {
  const blanks = (firstWeekday + 6) % 7
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push({ key: `blank-${i}`, blank: true })
  days.forEach((d) => {
    const logged = d.beans > 0
    cells.push({ ...d, key: d.date, isToday: d.date === today, stamps: logged ? stampsView(d.stamps) : [], beansText: logged ? `+${d.beans}` : '' })
  })
  return cells
}
```

`module.exports` 换成：

```js
module.exports = {
  decorateMeal,
  buildDayView,
  greetingText,
  stampsView,
  gainTitle,
  decorateGain,
  streakText,
  beansCard,
  nextMealCard,
  buildCalendarCells,
  milestoneView,
  badgesView,
  analysisSteps,
}
```

- [ ] **Step 5: 通用动画加到 `miniprogram/app.wxss` 末尾**

```css
/* ---------------------------------------------------------------- 打卡动效（docs/superpowers/specs/2026-10-25-checkin-effects-design.md）
   都很短、只播一次（呼吸除外）；结束的样子就是平时的样子（fill-mode 用 backwards，不挡按压效果）；
   依次出现用 fx-d1～fx-d8（每档 100ms）；页面根节点加 fx-skip 就全部跳到结束 */
@keyframes fx-rise {
  from { opacity: 0; transform: translateY(32rpx); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fx-pop {
  0% { opacity: 0; transform: scale(0.3); }
  70% { opacity: 1; transform: scale(1.15); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes fx-stamp {
  0% { opacity: 0; transform: scale(1.6) rotate(-12deg); }
  55% { opacity: 1; transform: scale(0.92) rotate(4deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

@keyframes fx-ink {
  0% { opacity: 0.6; transform: scale(0.8); }
  100% { opacity: 0; transform: scale(1.9); }
}

@keyframes fx-breathe {
  0%, 100% { box-shadow: 0 4rpx 16rpx rgba(80, 60, 30, 0.05), 0 0 0 0 rgba(78, 125, 91, 0); }
  50% { box-shadow: 0 4rpx 16rpx rgba(80, 60, 30, 0.05), 0 0 0 14rpx rgba(78, 125, 91, 0.16); }
}

@keyframes fx-breathe-warn {
  0%, 100% { box-shadow: 0 4rpx 16rpx rgba(80, 60, 30, 0.05), 0 0 0 0 rgba(217, 130, 43, 0); }
  50% { box-shadow: 0 4rpx 16rpx rgba(80, 60, 30, 0.05), 0 0 0 14rpx rgba(217, 130, 43, 0.26); }
}

@keyframes fx-nudge {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}

@keyframes fx-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

.fx-rise { animation: fx-rise 0.45s cubic-bezier(0.2, 0.8, 0.3, 1) backwards; }
.fx-pop { animation: fx-pop 0.35s ease-out backwards; }
.fx-d1 { animation-delay: 100ms; }
.fx-d2 { animation-delay: 200ms; }
.fx-d3 { animation-delay: 300ms; }
.fx-d4 { animation-delay: 400ms; }
.fx-d5 { animation-delay: 500ms; }
.fx-d6 { animation-delay: 600ms; }
.fx-d7 { animation-delay: 700ms; }
.fx-d8 { animation-delay: 800ms; }

/* 盖章：落下、歪一下回正，周围一圈墨晕开；准时的「准」再晚一点跳出来 */
.fx-stamp {
  position: relative;
  animation: fx-stamp 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) 0.15s backwards;
}

.fx-stamp::before {
  content: '';
  position: absolute;
  left: -8rpx;
  top: -8rpx;
  right: -8rpx;
  bottom: -8rpx;
  border-radius: 50%;
  border: 6rpx solid rgba(160, 90, 40, 0.45);
  opacity: 0;
  animation: fx-ink 0.7s ease-out 0.35s forwards;
}

.fx-stamp.stamp-on::after {
  animation: fx-pop 0.3s ease-out 0.55s backwards;
}

/* 首页「下一顿」：饭点内慢慢呼吸，过点了琥珀色、快一点；按钮轻轻一胀一缩 */
.fx-breathe { animation: fx-breathe 4s ease-in-out infinite; }
.fx-breathe-warn { animation: fx-breathe-warn 2.5s ease-in-out infinite; }
.fx-nudge { animation: fx-nudge 2s ease-in-out infinite; }

/* 按下去缩一点，松手弹回：按钮用自带的 button-hover，卡片、小块用 hover-class="fx-press" */
button,
.card,
.chip {
  transition: transform 0.15s, opacity 0.15s;
}

button.button-hover {
  transform: scale(0.96);
}

.fx-press {
  transform: scale(0.96);
  opacity: 0.9;
}

.chip-on {
  animation: fx-bounce 0.25s ease-out;
}

/* 点一下就跳到结束 */
.fx-skip .fx-rise,
.fx-skip .fx-pop,
.fx-skip .fx-stamp,
.fx-skip .fx-stamp.stamp-on::after {
  animation: none;
}

.fx-skip .fx-stamp::before {
  display: none;
}
```

- [ ] **Step 6: 跑测试**

Run: `node --test test/view.test.js && npm test`
Expected: view 全绿；`test/pages.test.js` 的完整流程里 `streakText` 那条会失败（文案变了）——下一步一起改

- [ ] **Step 7: 改 `test/pages.test.js` 的旧断言**

完整流程测试里：

```js
  assert.equal(today.data.daily.streakText, '🔥 已连续 1 天 · 再 2 天拿 3 天纪念章')
```

Run: `npm test`
Expected: 全绿

- [ ] **Step 8: 提交**

```bash
node --check miniprogram/utils/view.js && node --check miniprogram/utils/milestone-lines.js
git add miniprogram/utils/view.js miniprogram/utils/milestone-lines.js miniprogram/app.wxss test/view.test.js test/pages.test.js
git commit -m "feat(fx): view fields for stamps, streak hint, milestone card, badges; shared animation classes"
```

---

### Task 5: 纪念章组件 `medal` + 测试环境支持自定义组件

**Files:**
- Create: `miniprogram/components/medal/medal.js`、`.json`、`.wxml`、`.wxss`
- Modify: `test/helpers/page-harness.js`（`loadComponent`、`readComponentWxml`）
- Test: `test/pages.test.js`（组件冒烟测试 + 页面 / 组件注册的组件文件都在）

**Interfaces:**
- Produces:
  - `<medal days tier glow locked size />`（`size` 单位 rpx，默认 120）
  - 测试：`loadComponent(name, wx, props) → { data, events, setData, triggerEvent, attach(), detach(), createSelectorQuery, ...methods }`、`readComponentWxml(name)`

- [ ] **Step 1: 测试环境加组件**

`test/helpers/page-harness.js` 里 `PAGES_DIR` 下面加：

```js
const COMPONENTS_DIR = path.join(__dirname, '../../miniprogram/components')
```

`loadPage` 后面加：

```js
// 自定义组件：属性默认值 + data，props 覆盖；attach / detach 调生命周期；triggerEvent 记在 events 里
function loadComponent(name, wx, props = {}) {
  const file = path.join(COMPONENTS_DIR, name, `${name}.js`)
  let def = null
  global.wx = wx
  global.getApp = () => wx.app
  global.Component = (d) => {
    def = d
  }
  delete require.cache[file]
  require(file)
  const defaults = {}
  Object.entries(def.properties || {}).forEach(([k, p]) => {
    defaults[k] = p && p.value !== undefined ? p.value : null
  })
  const life = def.lifetimes || {}
  return {
    ...(def.methods || {}),
    data: { ...clone(defaults), ...clone(def.data || {}), ...clone(props) },
    events: [],
    setData(patch, cb) {
      Object.entries(patch).forEach(([k, v]) => setPath(this.data, k, v))
      if (cb) cb()
    },
    triggerEvent(type, detail) {
      this.events.push([type, detail])
    },
    createSelectorQuery: () => wx.createSelectorQuery(),
    attach() {
      if (life.attached) life.attached.call(this)
    },
    detach() {
      if (life.detached) life.detached.call(this)
    },
  }
}

function readComponentWxml(name) {
  return fs.readFileSync(path.join(COMPONENTS_DIR, name, `${name}.wxml`), 'utf8')
}
```

`module.exports` 加上 `loadComponent, readComponentWxml`。

- [ ] **Step 2: 写组件冒烟测试（`test/pages.test.js`）**

第 6 行 require 加上 `loadComponent, readComponentWxml`。在页面冒烟测试的 `for (const name of PAGES) {...}` 后面加：

```js
const COMPONENTS = ['medal']

for (const name of COMPONENTS) {
  test(`组件 ${name}：标签配对、事件处理函数存在、变量都在属性 / data 里`, () => {
    const wxml = readComponentWxml(name)
    assert.deepEqual(checkTags(wxml), [])
    const comp = loadComponent(name, createWx(async () => ({ ok: true, data: null })))
    for (const handler of boundHandlers(wxml)) {
      assert.equal(typeof comp[handler], 'function', `${name} 缺少处理函数 ${handler}`)
    }
    for (const root of referencedRoots(wxml)) {
      assert.ok(root in comp.data || root === 'item' || root === 'index', `${name}.wxml 引用了没有的 ${root}`)
    }
  })
}

test('页面和组件注册的自定义组件文件都在', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '../miniprogram')
  const jsons = PAGES.map((p) => `pages/${p}/${p}.json`).concat(COMPONENTS.map((c) => `components/${c}/${c}.json`))
  for (const file of jsons) {
    const using = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).usingComponents || {}
    for (const [tag, ref] of Object.entries(using)) {
      for (const ext of ['js', 'json', 'wxml', 'wxss']) {
        assert.ok(fs.existsSync(path.join(root, `${ref}.${ext}`)), `${file} 的 ${tag} 缺少 ${ref}.${ext}`)
      }
    }
  }
  for (const c of COMPONENTS) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, `components/${c}/${c}.json`), 'utf8')).component, true)
  }
})
```

- [ ] **Step 3: 跑测试看它失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`components/medal/medal.wxml` 不存在）

- [ ] **Step 4: 写组件**

`miniprogram/components/medal/medal.json`：

```json
{
  "component": true
}
```

`miniprogram/components/medal/medal.js`：

```js
// 纪念章：纯 CSS 画的圆章 + 两条绶带，中间写天数（打卡日历、里程碑庆祝卡共用）。size 是圆章直径（rpx）
Component({
  properties: {
    days: { type: Number, value: 0 },
    tier: { type: String, value: 'bronze' },
    glow: { type: Boolean, value: false },
    locked: { type: Boolean, value: false },
    size: { type: Number, value: 120 },
  },
})
```

`miniprogram/components/medal/medal.wxml`：

```xml
<view class="medal medal-{{tier}} {{locked ? 'medal-locked' : ''}}" style="width: {{size}}rpx; height: {{size * 1.3}}rpx">
  <view class="medal-ribbon medal-ribbon-l" style="width: {{size * 0.28}}rpx; height: {{size * 0.62}}rpx; left: {{size * 0.2}}rpx; top: {{size * 0.62}}rpx"></view>
  <view class="medal-ribbon medal-ribbon-r" style="width: {{size * 0.28}}rpx; height: {{size * 0.62}}rpx; right: {{size * 0.2}}rpx; top: {{size * 0.62}}rpx"></view>
  <view wx:if="{{glow && !locked}}" class="medal-halo" style="width: {{size * 1.3}}rpx; height: {{size * 1.3}}rpx; left: {{size * -0.15}}rpx; top: {{size * -0.15}}rpx"></view>
  <view class="medal-disc" style="width: {{size}}rpx; height: {{size}}rpx">
    <view class="medal-ring">
      <text class="medal-num" style="font-size: {{days >= 100 ? size * 0.3 : size * 0.4}}rpx">{{days}}</text>
      <text class="medal-unit" style="font-size: {{size * 0.15}}rpx">天</text>
    </view>
  </view>
</view>
```

`miniprogram/components/medal/medal.wxss`：

```css
.medal {
  position: relative;
  display: inline-block;
}

/* 两条 V 字尾的绶带，从圆章下面斜着垂下来 */
.medal-ribbon {
  position: absolute;
  background: linear-gradient(180deg, #e98a6b, #d1543f);
  -webkit-clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
}

.medal-ribbon-l {
  transform: rotate(16deg);
  transform-origin: top center;
}

.medal-ribbon-r {
  transform: rotate(-16deg);
  transform-origin: top center;
}

.medal-disc {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 14rpx rgba(80, 60, 30, 0.25);
}

.medal-ring {
  width: 78%;
  height: 78%;
  box-sizing: border-box;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.medal-num {
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2rpx 0 rgba(0, 0, 0, 0.18);
}

.medal-unit {
  margin-top: 4rpx;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.medal-bronze .medal-disc {
  background: radial-gradient(circle at 35% 30%, #f3c79a 0%, #c98a4f 55%, #9c6232 100%);
}

.medal-silver .medal-disc {
  background: radial-gradient(circle at 35% 30%, #ffffff 0%, #c9ced6 55%, #8f97a3 100%);
}

.medal-silver .medal-num,
.medal-silver .medal-unit {
  color: #4a5260;
  text-shadow: none;
}

.medal-silver .medal-ribbon {
  background: linear-gradient(180deg, #8fb6d9, #5b86b0);
}

.medal-gold .medal-disc {
  background: radial-gradient(circle at 35% 30%, #fff3c2 0%, #f0b429 55%, #b97d0a 100%);
}

.medal-gold .medal-ribbon {
  background: linear-gradient(180deg, #6f9e7b, #4e7d5b);
}

/* 365 天起：外面一圈慢慢转的光 */
.medal-halo {
  position: absolute;
  border-radius: 50%;
  background: conic-gradient(rgba(240, 180, 41, 0), rgba(240, 180, 41, 0.55), rgba(240, 180, 41, 0), rgba(240, 180, 41, 0.55), rgba(240, 180, 41, 0));
  animation: medal-spin 6s linear infinite;
}

@keyframes medal-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 还没拿到：灰色虚线轮廓 */
.medal-locked .medal-disc {
  background: #f1ede6;
  box-shadow: none;
  border: 4rpx dashed #c9c1b4;
  box-sizing: border-box;
}

.medal-locked .medal-ring {
  border-color: transparent;
}

.medal-locked .medal-num,
.medal-locked .medal-unit {
  color: #b0a89c;
  text-shadow: none;
}

.medal-locked .medal-ribbon {
  background: #e6e0d6;
}
```

- [ ] **Step 5: 跑测试看它通过**

Run: `npm test`
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
node --check miniprogram/components/medal/medal.js
git add miniprogram/components/medal test/helpers/page-harness.js test/pages.test.js
git commit -m "feat(fx): medal component drawn in CSS; component support in the page test harness"
```

---

### Task 6: 彩带 `utils/confetti.js` + 庆祝组件 `celebrate`

**Files:**
- Create: `miniprogram/utils/confetti.js`
- Create: `miniprogram/components/celebrate/celebrate.js`、`.json`、`.wxml`、`.wxss`
- Test: `test/confetti.test.js`、`test/pages.test.js`（`COMPONENTS` 加 `celebrate`，组件行为测试）

**Interfaces:**
- Consumes: Task 3 的 `clockOf`、`buzz`；Task 4 的 `milestoneView` 形状 `{ days, tier, glow, title, sub, line, image }`；Task 5 的 `medal`
- Produces:
  - `confetti.makeParticles({ mode: 'burst'|'milestone', width, height, seed }) → particle[]`（`burst` 40 片、`milestone` 80 片）
  - `confetti.step(list, dt, height) → 还在屏幕里的片数`
  - `confetti.draw(ctx, list)`
  - `confetti.COLORS`、`confetti.RUN_MS = { burst: 1400, milestone: 2600 }`
  - `<celebrate mode="burst|milestone" milestone="{{...}}" bindclose="..." />`：`burst` 1400ms 后自己发 `close`；`milestone` 400ms 时 `buzz('medium')`，点按钮或卡片外发 `close`

- [ ] **Step 1: 写彩带测试 `test/confetti.test.js`**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const C = require('../miniprogram/utils/confetti')

test('makeParticles：片数、颜色、同一个种子出一样的；burst 从顶上中间出', () => {
  const a = C.makeParticles({ mode: 'milestone', width: 375, height: 700, seed: 3 })
  const b = C.makeParticles({ mode: 'milestone', width: 375, height: 700, seed: 3 })
  assert.equal(a.length, 80)
  assert.deepEqual(a, b)
  assert.ok(a.every((p) => C.COLORS.includes(p.color) && p.y < 0 && p.x >= 0 && p.x <= 375))
  const burst = C.makeParticles({ mode: 'burst', width: 375, height: 700, seed: 3 })
  assert.equal(burst.length, 40)
  assert.ok(burst.every((p) => Math.abs(p.x - 187.5) <= 20))
})

test('step：几秒内全部落出底边就停', () => {
  for (const mode of ['burst', 'milestone']) {
    const list = C.makeParticles({ mode, width: 375, height: 700, seed: 11 })
    let alive = list.length
    let t = 0
    while (alive && t < 5) {
      alive = C.step(list, 1 / 60, 700)
      t += 1 / 60
    }
    assert.equal(alive, 0, mode)
    assert.ok(t < C.RUN_MS[mode] / 1000 + 1, `${mode} 落完用了 ${t.toFixed(2)} 秒`)
  }
})

test('draw：每片画一次（save / restore 成对）', () => {
  const calls = { save: 0, restore: 0 }
  const ctx = new Proxy({}, { get: (_, k) => (k in calls ? () => (calls[k] += 1) : () => {}), set: () => true })
  const list = C.makeParticles({ mode: 'burst', width: 375, height: 700, seed: 5 })
  C.draw(ctx, list)
  assert.deepEqual(calls, { save: 40, restore: 40 })
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/confetti.test.js`
Expected: FAIL，`Cannot find module '../miniprogram/utils/confetti'`

- [ ] **Step 3: 写 `miniprogram/utils/confetti.js`**

```js
// 彩带：纯计算（生成、往前走、画），小程序的 canvas 和预览录屏的浏览器共用。颜色用 app.wxss 的暖色
// milestone：从屏幕上方一整排往下撒（约 2 秒落完）；burst：从顶上中间往两边喷一小把（约 1 秒）

const COLORS = ['#4e7d5b', '#f0b429', '#e98a6b', '#9cc5a1', '#f6c86b', '#d97a1e']
const SHAPES = ['strip', 'strip', 'strip', 'bean', 'ring']
const COUNT = { burst: 40, milestone: 80 }
const RUN_MS = { burst: 1400, milestone: 2600 }
const GRAVITY = 520 // 像素 / 秒²
const DRAG = 0.985

function rng(seed) {
  let s = Math.floor(seed) >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeParticles({ mode = 'milestone', width, height, seed = 1 }) {
  const r = rng(seed)
  const burst = mode === 'burst'
  const list = []
  for (let i = 0; i < (COUNT[mode] || COUNT.milestone); i++) {
    list.push({
      x: burst ? width / 2 + (r() - 0.5) * 40 : r() * width,
      y: burst ? -10 : -10 - r() * height * 0.4,
      vx: burst ? (r() - 0.5) * 520 : (r() - 0.5) * 80,
      vy: burst ? 80 + r() * 260 : 160 + r() * 200,
      rot: r() * Math.PI * 2,
      vr: (r() - 0.5) * 10,
      size: 6 + r() * 6,
      sway: r() * Math.PI * 2,
      shape: SHAPES[Math.floor(r() * SHAPES.length)],
      color: COLORS[Math.floor(r() * COLORS.length)],
    })
  }
  return list
}

// 往前走 dt 秒；返回还在屏幕里（没落出底边）的片数
function step(list, dt, height) {
  let alive = 0
  list.forEach((p) => {
    p.vy += GRAVITY * dt
    p.vx *= DRAG
    p.sway += dt * 3
    p.x += (p.vx + Math.sin(p.sway) * 30) * dt
    p.y += p.vy * dt
    p.rot += p.vr * dt
    if (p.y < height + 20) alive += 1
  })
  return alive
}

// 长条、暖豆（扁圆）、小印章（圆环）
function draw(ctx, list) {
  list.forEach((p) => {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.strokeStyle = p.color
    if (p.shape === 'strip') {
      ctx.fillRect(-p.size / 2, -p.size / 5, p.size, p.size / 2.5)
    } else if (p.shape === 'bean') {
      ctx.beginPath()
      ctx.ellipse(0, 0, p.size / 2, p.size / 3, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, p.size / 2.2, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  })
}

module.exports = { COLORS, RUN_MS, makeParticles, step, draw }
```

- [ ] **Step 4: 跑彩带测试看它通过**

Run: `node --test test/confetti.test.js`
Expected: PASS

- [ ] **Step 5: 写组件行为测试（`test/pages.test.js`）**

`COMPONENTS` 改成 `['medal', 'celebrate']`。在组件冒烟测试后面加：

```js
const MILESTONE_VIEW = { days: 7, tier: 'bronze', glow: false, title: '连续打卡 7 天！', sub: '', line: '一周都没落下，身体会记得的', image: '/images/camp/pets/doudou.png' }

test('庆祝组件：burst 播完自己关；milestone 中等震动、点「收下」关掉、不留定时器；拿不到 canvas 也不出错', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  const burst = loadComponent('celebrate', wx, { mode: 'burst' })
  burst.clock = manualClock()
  burst.attach()
  burst.clock.advance(1300)
  assert.deepEqual(burst.events, [])
  burst.clock.advance(200)
  assert.deepEqual(burst.events, [['close', {}]])

  const card = loadComponent('celebrate', wx, { mode: 'milestone', milestone: MILESTONE_VIEW })
  card.clock = manualClock()
  card.attach()
  card.clock.advance(500)
  assert.deepEqual(wx.log.vibrations, ['medium'])
  card.close()
  assert.deepEqual(card.events, [['close', {}]])
  assert.equal(card.clock.count(), 0)
  card.detach()
})
```

- [ ] **Step 6: 跑测试看它失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`components/celebrate` 不存在）

- [ ] **Step 7: 写组件**

`miniprogram/components/celebrate/celebrate.json`：

```json
{
  "component": true,
  "usingComponents": {
    "medal": "/components/medal/medal"
  }
}
```

`miniprogram/components/celebrate/celebrate.js`：

```js
// 庆祝：burst 只撒一把彩带（三顿都准时，不挡点击，播完自己关）；
// milestone 是连续打卡里程碑的整张庆祝卡（暗一下 + 彩带 + 纪念章 + 最亲的小动物 + 小暖的话），点按钮或卡片外面关
const C = require('../../utils/confetti')
const { clockOf, buzz } = require('../../utils/fx')

Component({
  properties: {
    mode: { type: String, value: '' },
    milestone: { type: Object, value: null },
  },

  lifetimes: {
    attached() {
      this.start()
    },
    detached() {
      this.stop()
    },
  },

  methods: {
    start() {
      const mode = this.data.mode
      if (!mode) return
      const clock = clockOf(this)
      this.timers = []
      // 纪念章转着落定的时候震一下
      if (mode === 'milestone') this.timers.push(clock.set(() => buzz('medium'), 400))
      if (mode === 'burst') this.timers.push(clock.set(() => this.close(), C.RUN_MS.burst))
      this.startConfetti(mode)
    },

    // 拿 canvas 画彩带；老基础库拿不到就只显示卡片
    startConfetti(mode) {
      this.createSelectorQuery()
        .select('#confetti')
        .fields({ node: true, size: true })
        .exec((res) => {
          const hit = res && res[0]
          if (!hit || !hit.node || !hit.node.getContext || this.stopped) return
          const canvas = hit.node
          const dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2
          canvas.width = hit.width * dpr
          canvas.height = hit.height * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)
          const list = C.makeParticles({ mode, width: hit.width, height: hit.height, seed: Date.now() })
          const t0 = Date.now()
          let prev = t0
          const tick = () => {
            if (this.stopped) return
            const now = Date.now()
            const alive = C.step(list, Math.min(0.05, (now - prev) / 1000), hit.height)
            prev = now
            ctx.clearRect(0, 0, hit.width, hit.height)
            C.draw(ctx, list)
            if (alive && now - t0 < C.RUN_MS[mode]) this.raf = canvas.requestAnimationFrame(tick)
            else ctx.clearRect(0, 0, hit.width, hit.height)
          }
          this.canvas = canvas
          this.raf = canvas.requestAnimationFrame(tick)
        })
    },

    stop() {
      this.stopped = true
      const clock = clockOf(this)
      ;(this.timers || []).forEach((h) => clock.clear(h))
      this.timers = []
      if (this.canvas && this.raf) this.canvas.cancelAnimationFrame(this.raf)
      this.raf = null
    },

    close() {
      this.stop()
      this.triggerEvent('close', {})
    },

    noop() {},
  },
})
```

`miniprogram/components/celebrate/celebrate.wxml`：

```xml
<view wx:if="{{mode === 'burst'}}" class="cel-burst">
  <canvas type="2d" id="confetti" class="cel-confetti"></canvas>
</view>
<view wx:elif="{{mode === 'milestone'}}" class="cel-mask" bindtap="close">
  <view class="cel-card" catchtap="noop">
    <view class="cel-medal">
      <medal days="{{milestone.days}}" tier="{{milestone.tier}}" glow="{{milestone.glow}}" size="{{200}}" />
    </view>
    <view class="cel-title">{{milestone.title}}</view>
    <view wx:if="{{milestone.sub}}" class="cel-sub">{{milestone.sub}}</view>
    <view class="cel-line">{{milestone.line}}</view>
    <button class="cel-btn" bindtap="close">收下纪念章</button>
    <image class="cel-peek" src="{{milestone.image}}" mode="aspectFit" />
  </view>
  <canvas type="2d" id="confetti" class="cel-confetti"></canvas>
</view>
```

`miniprogram/components/celebrate/celebrate.wxss`：

```css
.cel-burst {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  pointer-events: none;
}

.cel-confetti {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

.cel-mask {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  background: rgba(47, 42, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: cel-fade 0.3s ease-out backwards;
}

.cel-card {
  position: relative;
  z-index: 1;
  width: 78%;
  margin-top: 120rpx;
  padding: 0 40rpx 48rpx;
  border-radius: 32rpx;
  background: #fffdf7;
  text-align: center;
  animation: cel-card-in 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) 0.1s backwards;
}

/* 纪念章一半探出卡片上沿，转半圈放大落定 */
.cel-medal {
  display: flex;
  justify-content: center;
  margin-top: -130rpx;
  animation: cel-medal-in 0.7s cubic-bezier(0.3, 1.3, 0.5, 1) 0.25s backwards;
}

.cel-title {
  margin-top: 12rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #b8763a;
}

.cel-sub {
  font-size: 28rpx;
  color: #7a7166;
}

.cel-line {
  margin: 20rpx 0 8rpx;
  font-size: 32rpx;
  color: #2f2a24;
}

.cel-btn {
  width: 100% !important;
  margin-top: 32rpx;
  padding: 20rpx 0;
  border-radius: 48rpx;
  background: #4e7d5b;
  color: #fff;
  font-size: 34rpx;
  font-weight: 600;
}

.cel-btn::after {
  border: none;
}

/* 营地里最亲的那只从卡片左下角探出头 */
.cel-peek {
  position: absolute;
  left: -28rpx;
  bottom: -56rpx;
  width: 150rpx;
  height: 150rpx;
  animation: cel-peek 0.5s ease-out 0.6s backwards;
}

@keyframes cel-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cel-card-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes cel-medal-in {
  from { opacity: 0; transform: scale(0.3) rotate(-180deg); }
  to { opacity: 1; transform: scale(1) rotate(0deg); }
}

@keyframes cel-peek {
  from { opacity: 0; transform: translateY(40rpx); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 8: 跑测试看它通过**

Run: `npm test`
Expected: 全绿

- [ ] **Step 9: 提交**

```bash
node --check miniprogram/utils/confetti.js && node --check miniprogram/components/celebrate/celebrate.js
git add miniprogram/utils/confetti.js miniprogram/components/celebrate test/confetti.test.js test/pages.test.js
git commit -m "feat(fx): confetti and the celebration component (burst / milestone card)"
```

---

### Task 7: 结果页（`pages/meal`）：盖章、数字滚动、浮现、庆祝

**Files:**
- Modify: `miniprogram/pages/meal/meal.js`、`.json`、`.wxml`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: Task 3 `clockOf`、`countUp`、`buzz`；Task 4 `gainTitle`、`decorateGain(gain, { fresh })`、`milestoneView`；Task 6 `celebrate`
- Produces: 页面 data 多 `fxSkip`、`celebrate`（`''` / `'burst'` / `'milestone'`）、`milestone`；方法 `playFx(raw)`、`stopFx()`、`skipFx()`、`openMilestone()`、`onCelebrateClose()`、`onUnload()`

- [ ] **Step 1: 改旧测试 + 写新测试（`test/pages.test.js`）**

完整流程测试里第 4 步改成（先注入时钟，等动效播完再看）：

```js
  // 4. 详情页（刚打完卡：盖章、数字滚到位）
  assert.ok(readWxml('meal').includes('回到营地'))
  const meal = loadPage('meal', wx)
  meal.clock = manualClock()
  meal.onLoad({ id: mealId })
  await settle()
  meal.clock.advance(3000)
  assert.equal(meal.data.meal.kcalText, '约 520 千卡')
  assert.equal(meal.data.meal.label, '午餐')
  assert.equal(meal.data.note, '米饭吃了一半')
  assert.equal(meal.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(meal.data.gain.stamps[1].cls, 'stamp-green stamp-on fx-stamp')
  assert.equal(meal.data.gain.bonus, '')
  assert.equal(wx.app.globalData.lastGain, null)
  assert.deepEqual(wx.log.vibrations, ['light'])
```

在 `今日页：下一顿大卡跟着时间走` 测试前面加：

```js
const MEAL_FIXTURE = {
  _id: 'm1', mealType: 'lunch', status: 'done', createdAt: 1, note: '',
  analysis: { isFood: true, rating: 'green', totalKcal: 520, protein: 20, carbs: 60, fat: 15, foods: [], comment: '搭配不错' },
}
const LUNCH_STAMPS = [
  { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
  { mealType: 'lunch', label: '午', state: 'green', onTime: true },
  { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
]

function mealPageWith(gain) {
  const wx = createWx(async (req) => (req.action === 'meal.get' ? { ok: true, data: MEAL_FIXTURE } : { ok: true, data: null }))
  if (gain) wx.app.globalData.lastGain = { mealId: 'm1', gain, arrival: null }
  const page = loadPage('meal', wx)
  page.clock = manualClock()
  return { wx, page }
}

test('结果页：刚打完卡数字从 0 滚到位、盖章时轻震；里程碑等前面播完再弹，点「收下」关掉', async () => {
  const { wx, page } = mealPageWith({
    beans: 20, beansToday: 35, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false,
    milestone: { days: 7, times: 1, tier: 'bronze', glow: false, petId: 'doudou' },
  })
  page.onLoad({ id: 'm1' })
  await settle()
  assert.equal(page.data.gain.title, '午饭准时打卡 +0 暖豆')
  assert.equal(page.data.meal.kcalText, '约 0 千卡')
  page.clock.advance(300)
  assert.deepEqual(wx.log.vibrations, ['light'])
  page.clock.advance(1000)
  assert.equal(page.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(page.data.meal.kcalText, '约 520 千卡')
  assert.equal(page.data.celebrate, '')
  page.clock.advance(200)
  assert.equal(page.data.celebrate, 'milestone')
  assert.equal(page.data.milestone.title, '连续打卡 7 天！')
  assert.equal(page.data.milestone.image, '/images/camp/pets/doudou.png')
  page.onCelebrateClose()
  assert.equal(page.data.celebrate, '')
  assert.equal(page.clock.count(), 0)
})

test('结果页：点一下屏幕跳到结束（里程碑马上弹）；三顿都准时撒彩带；看旧打卡不震动、不滚数字', async () => {
  const skip = mealPageWith({
    beans: 20, beansToday: 20, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false,
    milestone: { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' },
  })
  skip.page.onLoad({ id: 'm1' })
  await settle()
  skip.page.skipFx()
  assert.equal(skip.page.data.fxSkip, true)
  assert.equal(skip.page.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(skip.page.data.meal.kcalText, '约 520 千卡')
  assert.equal(skip.page.data.celebrate, 'milestone')
  assert.equal(skip.page.clock.count(), 0)

  const burst = mealPageWith({ beans: 35, beansToday: 75, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'dinner', timing: 'on', allOnTime: true, milestone: null })
  burst.page.onLoad({ id: 'm1' })
  await settle()
  burst.page.clock.advance(800)
  assert.equal(burst.page.data.celebrate, 'burst')
  burst.page.onCelebrateClose()
  burst.page.onUnload()
  assert.equal(burst.page.clock.count(), 0)

  const old = mealPageWith(null)
  old.page.onLoad({ id: 'm1' })
  await settle()
  assert.equal(old.page.data.meal.kcalText, '约 520 千卡')
  assert.equal(old.page.data.gain, null)
  assert.deepEqual(old.wx.log.vibrations, [])
  assert.equal(old.page.clock.count(), 0)
  old.page.skipFx()
  assert.equal(old.page.data.fxSkip, false)
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`skipFx` 不是函数、标题不是从 0 开始等）

- [ ] **Step 3: 实现**

`miniprogram/pages/meal/meal.json`：

```json
{
  "navigationBarTitleText": "这一餐",
  "usingComponents": {
    "celebrate": "/components/celebrate/celebrate"
  }
}
```

`miniprogram/pages/meal/meal.js` 顶部 require 换成：

```js
const api = require('../../utils/api')
const { decorateMeal, decorateGain, gainTitle, milestoneView } = require('../../utils/view')
const { arrivalCard } = require('../../utils/camp-view')
const { clockOf, countUp, buzz } = require('../../utils/fx')

// 刚打完卡的节奏（毫秒）：盖章落下时轻震，三顿都准时撒彩带，里程碑等前面都播完再弹
const FX = { buzz: 250, beansMs: 600, kcalMs: 800, burst: 700, milestone: 1400 }
```

`data` 里加：

```js
    fxSkip: false,
    celebrate: '',
    milestone: null,
```

`onLoad` 里 `if (last && last.mealId === options.id) {...}` 换成：

```js
    if (last && last.mealId === options.id) {
      this.freshGain = last.gain
      this.setData({ gain: decorateGain(last.gain, { fresh: true }), arrival: arrivalCard(last.arrival) })
      app.globalData.lastGain = null
    }
```

`showMeal` 换成：

```js
  showMeal(meal) {
    this.setData({ loading: false, meal: decorateMeal(meal), note: meal.note || '' })
    if (this.freshGain) {
      const raw = this.freshGain
      this.freshGain = null
      this.playFx(raw)
    }
  },

  // 刚打完卡：暖豆和热量从 0 滚上来，盖章那一下轻震，三顿都准时撒一把彩带，到了里程碑最后弹庆祝
  playFx(raw) {
    const clock = clockOf(this)
    this.fxTimers = []
    this.counters = []
    const later = (fn, ms) => {
      const h = clock.set(() => {
        this.fxTimers = this.fxTimers.filter((x) => x !== h)
        fn()
      }, ms)
      this.fxTimers.push(h)
    }
    later(() => buzz('light'), FX.buzz)
    if (raw && raw.beans > 0 && this.data.gain) {
      this.counters.push(countUp(0, raw.beans, FX.beansMs, (n) => this.setData({ 'gain.title': gainTitle(raw, n) }), clock))
    }
    const meal = this.data.meal
    if (meal.status === 'done' && meal.analysis && meal.analysis.isFood !== false) {
      this.counters.push(countUp(0, meal.analysis.totalKcal, FX.kcalMs, (n) => this.setData({ 'meal.kcalText': `约 ${n} 千卡` }), clock))
    }
    if (raw && raw.milestone) {
      this.pendingMilestone = milestoneView(raw.milestone)
      later(() => this.openMilestone(), FX.milestone)
    } else if (raw && raw.allOnTime) {
      later(() => this.setData({ celebrate: 'burst' }), FX.burst)
    }
  },

  stopFx() {
    const clock = clockOf(this)
    ;(this.fxTimers || []).forEach((h) => clock.clear(h))
    this.fxTimers = []
    ;(this.counters || []).forEach((c) => c.finish())
    this.counters = []
  },

  // 点一下屏幕：动效直接跳到结束，有里程碑就马上弹
  skipFx() {
    const playing = (this.fxTimers || []).length > 0 || (this.counters || []).some((c) => !c.done())
    if (!playing && !this.pendingMilestone) return
    this.stopFx()
    this.setData({ fxSkip: true })
    this.openMilestone()
  },

  openMilestone() {
    if (!this.pendingMilestone) return
    const milestone = this.pendingMilestone
    this.pendingMilestone = null
    this.setData({ celebrate: 'milestone', milestone })
  },

  onCelebrateClose() {
    this.setData({ celebrate: '' })
  },

  onUnload() {
    this.stopFx()
  },
```

`miniprogram/pages/meal/meal.wxml` 改这几处（其余不动）：

```xml
<view class="page {{fxSkip ? 'fx-skip' : ''}}" wx:if="{{meal}}" bindtap="skipFx">
  <view wx:if="{{gain}}" class="card gain-banner fx-rise" hover-class="fx-press" bindtap="goCamp">
    <image class="gain-icon fx-pop fx-d3" src="/images/garden/ui/bean.png" mode="aspectFit" />
```

```xml
  <view wx:if="{{arrival}}" class="card arrival-banner fx-rise fx-d6" hover-class="fx-press" bindtap="goCamp">
```

```xml
  <image wx:if="{{meal.fileID}}" class="hero-photo fx-rise fx-d1" src="{{meal.fileID}}" mode="aspectFill" bindtap="previewPhoto" />

  <view class="card fx-rise fx-d2">
```

```xml
  <view wx:if="{{meal.analysis && meal.analysis.foods.length}}" class="card fx-rise fx-d3">
```

```xml
  <view wx:if="{{meal.analysis}}" class="card coach fx-rise fx-d4">
```

最后 `<button class="btn-plain" bindtap="goCamp">回到营地</button>` 后面、`</view>` 前加：

```xml
  <celebrate wx:if="{{celebrate}}" mode="{{celebrate}}" milestone="{{milestone}}" bindclose="onCelebrateClose" />
```

- [ ] **Step 4: 跑测试看它通过**

Run: `npm test`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/pages/meal/meal.js
git add miniprogram/pages/meal test/pages.test.js
git commit -m "feat(fx): result page stamps, counts up, rises in and celebrates milestones"
```

---

### Task 8: 首页（`pages/today`）和打卡页（`pages/checkin`）

**Files:**
- Modify: `miniprogram/pages/today/today.js`、`.wxml`
- Modify: `miniprogram/pages/checkin/checkin.js`、`.wxml`、`.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: Task 3 `clockOf`、`countUp`；Task 4 `analysisSteps`、app.wxss 的类
- Produces: 首页方法 `playNumbers(kcal, percent)`、`stopNumbers()`；打卡页 data `steps`，方法 `stopSteps()`、`onUnload()`

- [ ] **Step 1: 改旧测试 + 写新测试（`test/pages.test.js`）**

完整流程测试第 6 步 `today.onShow(); await settle()` 后面加一行 `today.clock.advance(1000)`；第 7 步最后 `today.onShow(); await settle()` 后面同样加 `today.clock.advance(1000)`。

在 `今日页：下一顿大卡跟着时间走` 测试后面加：

```js
test('今日页：热量从上次显示的数滚到新数，进度条跟着长；离开页面不留定时器', async (t) => {
  fixDate(t, '2026-10-22T12:10:00+08:00')
  const cloud = createFakeCloud({ replies: [analysisJson({ totalKcal: 520 })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.view.totals.kcal, 0)
  assert.equal(today.data.view.percent, 0)
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭' } })
  today.onShow()
  await settle()
  assert.equal(today.data.view.totals.kcal, 0)
  today.clock.advance(1000)
  assert.equal(today.data.view.totals.kcal, 520)
  assert.ok(today.data.view.percent > 0)
  today.onHide()
  assert.equal(today.clock.count(), 0)
})

test('打卡页：等小暖时三步走到哪打勾（认菜 6 秒后算热量），出错后清掉', async () => {
  let fail
  const wx = createWx(() => new Promise((resolve) => {
    fail = () => resolve({ ok: false, code: 'AI_FAILED', message: '小暖没看清' })
  }))
  const checkin = loadPage('checkin', wx)
  checkin.clock = manualClock()
  checkin.onLoad({ mealType: 'lunch' })
  checkin.choosePhoto()
  checkin.submit()
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['now', 'todo', 'todo'])
  await settle()
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['done', 'now', 'todo'])
  checkin.clock.advance(6000)
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['done', 'done', 'now'])
  fail()
  await settle()
  assert.equal(checkin.data.submitting, false)
  assert.equal(checkin.clock.count(), 0)
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`steps` 是 undefined；首页数字没有从 0 滚）

- [ ] **Step 3: 首页 `miniprogram/pages/today/today.js`**

顶部加：

```js
const { clockOf, countUp } = require('../../utils/fx')
```

`load()` 里 `this.setData({ loading: false, view: buildDayView(day), greeting: ... })` 换成：

```js
        // 热量和进度条从上次显示的数滚到新数（第一次从 0）
        const view = buildDayView(day)
        this.setData({
          loading: false,
          view: { ...view, totals: { ...view.totals, kcal: this.shownKcal || 0 }, percent: this.shownPercent || 0 },
          greeting: greetingText(localHour(), day.profile.nickname),
        })
        this.playNumbers(view.totals.kcal, view.percent)
```

`refresh()` 里取时钟那行换成 `const clock = clockOf(this)`；`stopRefresh()` 换成：

```js
  stopRefresh() {
    if (!this.refreshTimer) return
    clockOf(this).clear(this.refreshTimer)
    this.refreshTimer = null
  },

  playNumbers(kcal, percent) {
    this.stopNumbers()
    const clock = clockOf(this)
    const from = this.shownKcal || 0
    this.shownKcal = kcal
    this.shownPercent = percent
    this.kcalCounter = countUp(from, kcal, 700, (n) => this.setData({ 'view.totals.kcal': n }), clock)
    // 进度条：下一拍再给宽度，CSS 的 transition 才会从旧宽度长过去
    this.barTimer = clock.set(() => {
      this.barTimer = null
      this.setData({ 'view.percent': percent })
    }, 50)
  },

  stopNumbers() {
    if (this.kcalCounter) this.kcalCounter.finish()
    this.kcalCounter = null
    if (this.barTimer) {
      clockOf(this).clear(this.barTimer)
      this.barTimer = null
      this.setData({ 'view.percent': this.shownPercent })
    }
  },
```

`onHide()` 和 `onUnload()` 都改成：

```js
  onHide() {
    this.stopRefresh()
    this.stopNumbers()
  },

  onUnload() {
    this.stopRefresh()
    this.stopNumbers()
  },
```

- [ ] **Step 4: 首页 `miniprogram/pages/today/today.wxml`**

```xml
    <view class="greeting fx-rise">{{greeting}}</view>

    <view wx:if="{{card}}" class="fx-rise fx-d1">
      <view class="card next-card {{card.warn ? 'next-card-warn fx-breathe-warn' : card.state === 'open' ? 'fx-breathe' : ''}}">
        <view class="next-title">{{card.title}}</view>
        <view wx:if="{{card.sub}}" class="next-sub">{{card.sub}}</view>
        <view wx:if="{{!card.small}}" class="{{card.warn || card.state === 'open' ? 'fx-nudge' : ''}}">
          <button class="btn-primary btn-big next-btn" data-meal-type="{{card.mealType}}" bindtap="goCheckin">{{card.button}}</button>
        </view>
        <view wx:else class="next-link" data-meal-type="{{card.mealType}}" bindtap="goCheckin">{{card.button}} ›</view>
      </view>
    </view>

    <view wx:if="{{daily}}" class="card beans-card fx-rise fx-d2" hover-class="fx-press" bindtap="goGarden">
      <image class="beans-card-icon" src="/images/garden/ui/bean.png" mode="aspectFit" />
      <view class="beans-card-body">
        <view class="beans-card-title">{{daily.title}}</view>
        <view class="stamps">
          <view wx:for="{{daily.stamps}}" wx:key="key" class="stamp {{item.cls}} fx-pop" style="animation-delay: {{300 + index * 100}}ms">{{item.label}}</view>
        </view>
```

（`beans-card` 里其余行不动。）

```xml
    <view class="card hero fx-rise fx-d3">
```

```xml
    <view wx:for="{{view.meals}}" wx:key="_id" class="card meal fx-rise" hover-class="fx-press" style="animation-delay: {{400 + index * 80}}ms" data-id="{{item._id}}" bindtap="openMeal">
```

- [ ] **Step 5: 打卡页 `miniprogram/pages/checkin/checkin.js`**

顶部加：

```js
const { clockOf } = require('../../utils/fx')
const { analysisSteps } = require('../../utils/view')

// 认菜和算热量是同一次调用：认菜这步走 6 秒后把「算热量」点亮，让等的人知道还在往前走
const COUNT_AFTER_MS = 6000
```

`data` 里加 `steps: [],`。`submit()` 里从 `this.setData({ submitting: true, ... })` 到结尾换成：

```js
    const hasPhoto = !!photo
    this.setData({ submitting: true, stage: photo ? '正在上传照片…' : '小暖正在看…', steps: analysisSteps(hasPhoto, 0) })
    const upload = photo ? api.uploadMealPhoto(photo) : Promise.resolve('')
    upload
      .then((fileID) => {
        const look = hasPhoto ? 1 : 0
        this.setData({ stage: '小暖正在仔细看你的饭菜…', steps: analysisSteps(hasPhoto, look) })
        this.stepTimer = clockOf(this).set(() => {
          this.stepTimer = null
          this.setData({ steps: analysisSteps(hasPhoto, look + 1) })
        }, COUNT_AFTER_MS)
        return api.call('meal.analyze', { fileID, mealType, note })
      })
      .then((meal) => {
        this.stopSteps()
        getApp().globalData.lastGain = { mealId: meal._id, gain: meal.gain, arrival: meal.arrival }
        // 正餐打卡成功：回营地时全员到篝火边庆祝
        if (meal.gain) getApp().globalData.celebrate = true
        wx.redirectTo({ url: `/pages/meal/meal?id=${meal._id}` })
      })
      .catch((err) => {
        this.stopSteps()
        this.setData({ submitting: false, stage: '' })
        api.showError(err)
      })
  },

  stopSteps() {
    if (!this.stepTimer) return
    clockOf(this).clear(this.stepTimer)
    this.stepTimer = null
  },

  onUnload() {
    this.stopSteps()
  },
```

- [ ] **Step 6: 打卡页 `miniprogram/pages/checkin/checkin.wxml`**

`<view wx:if="{{submitting}}" class="overlay">...</view>` 整块换成：

```xml
  <view wx:if="{{submitting}}" class="overlay">
    <view class="overlay-card fx-pop">
      <!-- 小暖在看：照片（没照片就是写的字）上一道光来回扫 -->
      <view class="scan">
        <image wx:if="{{photo}}" class="scan-photo" src="{{photo}}" mode="aspectFill" />
        <view wx:else class="scan-note">{{note}}</view>
        <view class="scan-light"></view>
      </view>
      <view class="overlay-stage">{{stage}}</view>
      <view class="steps">
        <view wx:for="{{steps}}" wx:key="label" class="step step-{{item.state}}">
          <view class="step-dot">{{item.state === 'done' ? '✓' : ''}}</view>
          <text>{{item.label}}</text>
        </view>
      </view>
      <view class="muted small">一般需要 10～30 秒，请稍等</view>
    </view>
  </view>
```

- [ ] **Step 7: 打卡页 `miniprogram/pages/checkin/checkin.wxss`**

删掉 `.spinner { ... }` 和 `@keyframes spin { ... }` 两块，加：

```css
/* 等小暖：照片缩成一张小卡，一道斜光来回扫 */
.scan {
  position: relative;
  width: 280rpx;
  height: 280rpx;
  margin: 0 auto;
  border-radius: 24rpx;
  overflow: hidden;
  background: var(--gray-soft);
  box-shadow: 0 8rpx 24rpx rgba(80, 60, 30, 0.15);
}

.scan-photo {
  width: 100%;
  height: 100%;
  display: block;
}

.scan-note {
  padding: 24rpx;
  font-size: 28rpx;
  text-align: left;
  color: var(--text);
  overflow: hidden;
  height: 100%;
  box-sizing: border-box;
}

.scan-light {
  position: absolute;
  left: -50%;
  top: -60%;
  width: 200%;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%);
  transform: rotate(-12deg);
  animation: scan 1.6s ease-in-out infinite;
}

@keyframes scan {
  0% { top: -60%; }
  100% { top: 110%; }
}

/* 三步：做完的打勾，正在做的点在跳 */
.steps {
  display: flex;
  justify-content: center;
  gap: 28rpx;
  margin: 8rpx 0 20rpx;
  font-size: 28rpx;
}

.step {
  display: flex;
  align-items: center;
  color: var(--gray);
}

.step-dot {
  width: 36rpx;
  height: 36rpx;
  margin-right: 8rpx;
  border-radius: 50%;
  border: 3rpx solid var(--line);
  box-sizing: border-box;
  font-size: 22rpx;
  line-height: 30rpx;
  text-align: center;
  color: #fff;
}

.step-done {
  color: var(--primary);
}

.step-done .step-dot {
  background: var(--primary);
  border-color: var(--primary);
}

.step-now {
  color: var(--text);
  font-weight: 600;
}

.step-now .step-dot {
  border-color: var(--primary);
  animation: fx-nudge 0.9s ease-in-out infinite;
}
```

- [ ] **Step 8: 跑测试看它通过**

Run: `npm test`
Expected: 全绿

- [ ] **Step 9: 提交**

```bash
node --check miniprogram/pages/today/today.js && node --check miniprogram/pages/checkin/checkin.js
git add miniprogram/pages/today miniprogram/pages/checkin test/pages.test.js
git commit -m "feat(fx): home cards rise and breathe, numbers roll; check-in wait shows a scan and steps"
```

---

### Task 9: 打卡日历（`pages/forest`）：纪念章一排、今天高亮

**Files:**
- Modify: `miniprogram/pages/forest/forest.js`、`.json`、`.wxml`、`.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: Task 2 `forest.get` 的 `badges`、`today.date`；Task 4 `badgesView`、`buildCalendarCells(days, firstWeekday, today)`；Task 5 `medal`
- Produces: 页面 data `badges`，方法 `openBadge(e)`

- [ ] **Step 1: 写测试（`test/pages.test.js`，加在结果页测试后面）**

```js
test('打卡日历：纪念章一排（已拿的、还差几天的），点开看第一次的日子；今天那格标出来', async (t) => {
  const clock = fixDate(t, '2026-10-16T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: Array.from({ length: 3 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  for (const d of [16, 17, 18]) {
    clock.set(`2026-10-${d}T08:00:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥' } })
  }
  const wx = createWx(main)
  const forest = loadPage('forest', wx)
  forest.onShow()
  await settle()
  assert.deepEqual(forest.data.badges.map((b) => [b.days, b.got, b.label]), [[3, true, '3 天'], [7, false, '还差 4 天']])
  assert.equal(forest.data.cells.find((c) => c.isToday).date, '2026-10-18')
  forest.openBadge(event({ days: 3 }))
  assert.equal(wx.log.modals.pop(), '第一次 2026年10月18日 · 共 1 次')
  forest.openBadge(event({ days: 7 }))
  assert.equal(wx.log.modals.pop(), '再连续打卡 4 天就能拿到')
})
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`badges` 是 undefined）

- [ ] **Step 3: 实现**

`miniprogram/pages/forest/forest.json`：

```json
{
  "navigationBarTitleText": "打卡日历",
  "usingComponents": {
    "medal": "/components/medal/medal"
  }
}
```

`miniprogram/pages/forest/forest.js`：require 改成 `const { beansCard, buildCalendarCells, badgesView } = require('../../utils/view')`；`data` 加 `badges: [],`；`load` 的 `setData` 里：

```js
          daily: beansCard(view.today),
          badges: badgesView(view.badges),
          cells: buildCalendarCells(view.days, view.firstWeekday, view.today.date),
```

`openDay` 后面加：

```js
  // 点纪念章：拿到的看第一次是哪天、一共几次；没拿到的说还差几天
  openBadge(e) {
    const days = Number(e.currentTarget.dataset.days)
    const b = this.data.badges.find((x) => x.days === days)
    if (!b) return
    let content = '连续打卡到这一天就能拿到'
    if (b.got) content = `第一次 ${b.firstText} · 共 ${b.times} 次`
    else if (b.left) content = `再连续打卡 ${b.left} 天就能拿到`
    wx.showModal({ title: `连续打卡 ${b.days} 天`, content, showCancel: false, confirmText: '知道了' })
  },
```

`miniprogram/pages/forest/forest.wxml`：`today-card` 里 `today-stats` 那块后面加：

```xml
    <scroll-view wx:if="{{badges.length}}" scroll-x class="medals">
      <view wx:for="{{badges}}" wx:key="days" class="medal-cell" hover-class="fx-press" data-days="{{item.days}}" bindtap="openBadge">
        <medal days="{{item.days}}" tier="{{item.tier}}" glow="{{item.glow}}" locked="{{!item.got}}" size="{{96}}" />
        <view class="medal-label {{item.got ? '' : 'medal-label-off'}}">{{item.label}}</view>
      </view>
    </scroll-view>
```

日历格子那行改成：

```xml
      <view wx:for="{{cells}}" wx:key="key" class="cell {{item.future ? 'cell-future' : ''}} {{item.isToday ? 'cell-today' : ''}}" data-key="{{item.key}}" bindtap="openDay">
```

`miniprogram/pages/forest/forest.wxss` 末尾加：

```css
/* 纪念章一排：横着能滑 */
.medals {
  white-space: nowrap;
  margin-top: 24rpx;
}

.medal-cell {
  display: inline-block;
  width: 140rpx;
  vertical-align: top;
  text-align: center;
  transition: transform 0.15s, opacity 0.15s;
}

.medal-label {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #b8763a;
}

.medal-label-off {
  color: var(--gray);
}

/* 今天那一格 */
.cell-today {
  border-radius: 16rpx;
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 3rpx rgba(78, 125, 91, 0.35);
}
```

- [ ] **Step 4: 跑测试看它通过**

Run: `npm test`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/pages/forest/forest.js
git add miniprogram/pages/forest test/pages.test.js
git commit -m "feat(streak): badge row and today highlight on the check-in calendar"
```

---

### Task 10: 预览录屏、文档、部署、预览码

**Files:**
- Modify: `scripts/preview/wxml-render.js`（渲染自定义组件、带上组件样式、导出 `renderComponent`）
- Create: `scripts/preview/record-checkin.js`
- Modify: `CLAUDE.md`、`README.md`

**Interfaces:**
- Consumes: 前面所有页面、组件；`utils/confetti.js`
- Produces: `node scripts/preview/record-checkin.js [场景]` → `.preview/checkin/<场景>.mp4 / .gif / .png`

- [ ] **Step 1: 渲染器支持自定义组件（`scripts/preview/wxml-render.js`）**

在 `const TAGS = {...}` 前面加：

```js
// 页面 / 组件 json 里的 usingComponents → { 标签: { name, ast, defaults, using } }
function loadComponents(using) {
  const out = {}
  Object.entries(using || {}).forEach(([tag, ref]) => {
    const dir = path.join(MP, ref)
    const name = path.basename(ref)
    const json = JSON.parse(fs.readFileSync(`${dir}.json`, 'utf8'))
    const src = fs.readFileSync(`${dir}.js`, 'utf8')
    const defaults = {}
    // 只认 properties 里 { type, value } 的默认值（我们的组件都这么写）
    for (const m of src.matchAll(/(\w+):\s*\{\s*type:\s*\w+,\s*value:\s*([^}]+?)\s*\}/g)) {
      try {
        defaults[m[1]] = Function(`return (${m[2]})`)()
      } catch (e) {
        defaults[m[1]] = null
      }
    }
    out[tag] = { name, dir, ast: parse(fs.readFileSync(`${dir}.wxml`, 'utf8')), defaults, using: loadComponents(json.usingComponents) }
  })
  return out
}

// 用到的组件的样式（递归），按文件去重
function componentCss(components, seen = new Set()) {
  let css = ''
  Object.values(components).forEach((c) => {
    if (seen.has(c.dir)) return
    seen.add(c.dir)
    css += '\n' + fs.readFileSync(`${c.dir}.wxss`, 'utf8') + componentCss(c.using, seen)
  })
  return css
}
```

`renderNode` 开头（`if (node.tag === 'block') ...` 后面）加：

```js
  const comp = ctx.components && ctx.components[node.tag]
  if (comp) {
    const props = {}
    Object.entries(node.attrs).forEach(([k, v]) => {
      if (!/^(bind|catch|wx:|class$|style$)/.test(k)) props[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = interp(v, scope)
    })
    const inner = renderChildren(comp.ast.children, { ...comp.defaults, ...props }, { ...ctx, components: comp.using })
    return `<div class="wx-comp wx-${node.tag} ${esc(interp(node.attrs.class || '', scope))}">${inner}</div>`
  }
```

`pageCss(name)` 换成（多一个参数，把组件样式拼上）：

```js
function pageCss(name, components = {}) {
  const app = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
  const page = fs.readFileSync(path.join(MP, 'pages', name, `${name}.wxss`), 'utf8')
  return rpx(app + '\n' + page + componentCss(components)).replace(/(^|[\s,}])page(?=\s*[{,])/gm, '$1body')
}
```

`renderPage` 里：

```js
  const components = loadComponents(json.usingComponents)
  const body = renderChildren(parse(wxml).children, data, { mapSrc, components })
```

（`json` 要在 `body` 之前读出来：把 `const json = ...` 那行挪到 `const body` 前面），`<style>` 里的 `${pageCss(name)}` 换成 `${pageCss(name, components)}`。

文件末尾加一个单独渲染组件的函数，并导出：

```js
// 单独渲染一个组件（录屏时等一会儿再插进页面用，比如结果页的庆祝）
function renderComponent(ref, props, mapSrc) {
  const tag = path.basename(ref)
  const components = loadComponents({ [tag]: ref })
  const html = renderChildren([{ tag, attrs: {}, children: [] }], {}, { mapSrc, components: { [tag]: { ...components[tag], defaults: { ...components[tag].defaults, ...props } } } })
  return { html, css: rpx(componentCss(components)) }
}

module.exports = { renderPage, renderComponent }
```

- [ ] **Step 2: 确认营地录屏没坏**

Run: `node scripts/preview/record-camp.js home-phone`
Expected: 正常输出 `.preview/camp/home-phone.mp4`（营地页没用组件，渲染结果不变）

- [ ] **Step 3: 写 `scripts/preview/record-checkin.js`**

```js
// 打卡动效录屏：结果页（普通 / 三顿准时 / 里程碑）、首页（饭点内 / 过点）、打卡页等小暖、打卡日历的纪念章。
// 页面数据用真实页面逻辑（手动时钟快进到数字滚完）算出来渲染成 HTML，CSS 动画在浏览器里真跑；
// 庆祝（彩带 + 卡）按页面里的时间点插进去，彩带用 utils/confetti.js 同一套计算画。数字滚动不在录屏里（直接是最后的数）。
//
//   node scripts/preview/record-checkin.js [场景 ...]   场景：meal meal-allontime meal-milestone today-open today-warn checkin-wait calendar（不写全录）
//   输出到 .preview/checkin/<场景>.mp4、.gif，第一帧 <场景>.png（.preview 不进仓库）
// 需要 Playwright 和 ffmpeg（云端环境里都装好了）
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { chromium } = require('playwright')
const REPO = path.join(__dirname, '..', '..')
const { createFakeCloud, loadCloudFunction } = require(`${REPO}/test/helpers/fake-cloud`)
const { createWx, loadPage, settle } = require(`${REPO}/test/helpers/page-harness`)
const { manualClock } = require(`${REPO}/test/helpers/manual-clock`)
const { fixDate } = require(`${REPO}/test/helpers/fixed-date`)
const { analysisJson } = require(`${REPO}/test/helpers/fake-repo`)
const { renderPage, renderComponent } = require('./wxml-render')

const OUT = path.join(REPO, '.preview', 'checkin')
fs.mkdirSync(OUT, { recursive: true })
const MP = `${REPO}/miniprogram`
const mapSrc = (src) => (String(src).startsWith('/images/') ? `file://${MP}${src}` : String(src))
const snap = (p) => JSON.parse(JSON.stringify(p.data))
// fixDate 要一个带 diagnostic 的 t：录屏里不需要还原，给个空的
const T = { after() {} }

const STAMPS = (dinner) => [
  { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
  { mealType: 'lunch', label: '午', state: 'green', onTime: true },
  { mealType: 'dinner', label: '晚', state: dinner ? 'green' : 'none', onTime: !!dinner },
]
const MEAL = {
  _id: 'm1', mealType: 'lunch', status: 'done', createdAt: Date.parse('2026-10-22T12:10:00+08:00'), note: '', fileID: '/images/camp/family.jpg',
  analysis: { isFood: true, rating: 'green', totalKcal: 520, protein: 22, carbs: 64, fat: 16, comment: '荤素搭配得好，米饭的量也合适。', suggestion: '晚饭多来点绿叶菜。', foods: [{ name: '米饭', portion: '一碗', kcal: 230 }, { name: '青椒肉丝', portion: '半盘', kcal: 210 }, { name: '番茄蛋汤', portion: '一碗', kcal: 80 }] },
}
const GAIN = { beans: 20, beansToday: 35, hint: '下一顿晚饭 17:00～19:00 拍算准时', stamps: STAMPS(false), mealType: 'lunch', timing: 'on', allOnTime: false, milestone: null }

const profileInput = { nickname: '妈妈', sex: 'female', age: 52, heightCm: 158, weightKg: 70, targetWeightKg: 60, activity: 'light' }

async function mealData(gain) {
  const wx = createWx(async (req) => (req.action === 'meal.get' ? { ok: true, data: MEAL } : { ok: true, data: null }))
  wx.app.globalData.lastGain = { mealId: 'm1', gain, arrival: null }
  const page = loadPage('meal', wx)
  page.clock = manualClock()
  page.onLoad({ id: 'm1' })
  await settle()
  page.clock.advance(5000)
  const end = snap(page)
  page.onUnload()
  // 先渲染不带庆祝的页面，庆祝按页面里的时间点再插
  return { data: { ...end, celebrate: '', milestone: null }, later: end.celebrate ? { at: end.celebrate === 'milestone' ? 1400 : 700, mode: end.celebrate, milestone: end.milestone } : null }
}

async function todayData(when, meals) {
  const clock = fixDate(T, `2026-10-22T08:00:00+08:00`)
  const cloud = createFakeCloud({ replies: meals.map(() => analysisJson({ totalKcal: 420 })) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  for (const [mealType, at] of meals) {
    clock.set(`2026-10-22T${at}:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
  }
  clock.set(`2026-10-22T${when}:00+08:00`)
  const page = loadPage('today', createWx(main))
  page.clock = manualClock()
  page.onShow()
  await settle()
  page.clock.advance(1000)
  const data = snap(page)
  page.onHide()
  return { data }
}

async function calendarData() {
  const clock = fixDate(T, '2026-10-16T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: Array.from({ length: 7 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  for (let d = 16; d <= 22; d++) {
    clock.set(`2026-10-${d}T08:00:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥' } })
  }
  const page = loadPage('forest', createWx(main))
  page.onShow()
  await settle()
  return { data: snap(page) }
}

const SCENARIOS = {
  meal: { page: 'meal', seconds: 2.5, build: () => mealData(GAIN) },
  'meal-allontime': { page: 'meal', seconds: 2.5, build: () => mealData({ ...GAIN, beans: 35, beansToday: 75, stamps: STAMPS(true), mealType: 'dinner', allOnTime: true }) },
  'meal-milestone': { page: 'meal', seconds: 4.5, build: () => mealData({ ...GAIN, milestone: { days: 7, times: 1, tier: 'bronze', glow: false, petId: 'doudou' } }) },
  'today-open': { page: 'today', tab: 'today', seconds: 5, build: () => todayData('12:20', [['breakfast', '07:40']]) },
  'today-warn': { page: 'today', tab: 'today', seconds: 4, build: () => todayData('13:30', [['breakfast', '07:40']]) },
  'checkin-wait': {
    page: 'checkin', seconds: 3,
    build: async () => {
      const page = loadPage('checkin', createWx(async () => ({ ok: true, data: null })))
      const { analysisSteps } = require(`${MP}/utils/view`)
      return { data: { ...snap(page), photo: '/images/camp/family.jpg', submitting: true, stage: '小暖正在仔细看你的饭菜…', steps: analysisSteps(true, 1) } }
    },
  },
  calendar: { page: 'forest', seconds: 3, build: calendarData },
}

// 到点把庆祝插进页面，彩带用 confetti.js 同一套计算画
function laterScript(later) {
  if (!later) return ''
  const { html, css } = renderComponent('/components/celebrate/celebrate', { mode: later.mode, milestone: later.milestone }, mapSrc)
  const confetti = fs.readFileSync(`${MP}/utils/confetti.js`, 'utf8')
  return `<style>${css}</style><template id="later">${html}</template><script>
const module = { exports: {} };
(function (module) { ${confetti} })(module);
const C = module.exports;
setTimeout(() => {
  document.body.appendChild(document.getElementById('later').content.cloneNode(true));
  const canvas = document.querySelector('.cel-confetti');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * 2; canvas.height = h * 2;
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  const list = C.makeParticles({ mode: '${later.mode}', width: w, height: h, seed: 7 });
  const t0 = performance.now(); let prev = t0;
  const tick = (now) => {
    const alive = C.step(list, Math.min(0.05, (now - prev) / 1000), h); prev = now;
    ctx.clearRect(0, 0, w, h); C.draw(ctx, list);
    if (alive && now - t0 < C.RUN_MS['${later.mode}']) requestAnimationFrame(tick); else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(tick);
}, ${later.at});
</script>`
}

async function record(name, sc, browser) {
  const { data, later } = await sc.build()
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, renderPage({ name: sc.page, data, mapSrc, tab: sc.tab || null, back: !sc.tab, extraScript: laterScript(later) }))
  const vdir = path.join(OUT, `${name}-video`)
  fs.rmSync(vdir, { recursive: true, force: true })
  const size = { width: 375, height: 812 }
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, recordVideo: { dir: vdir, size } })
  const page = await context.newPage()
  const start = Date.now()
  await page.goto(`file://${file}`)
  const lead = (Date.now() - start) / 1000
  await page.waitForTimeout(sc.seconds * 1000)
  await page.close()
  await context.close()
  const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
  execSync(`ffmpeg -loglevel error -y -ss ${Math.max(0, lead - 0.1).toFixed(2)} -i ${vdir}/${webm} -t ${sc.seconds} -c:v libx264 -pix_fmt yuv420p -r 25 ${OUT}/${name}.mp4`)
  execSync(`ffmpeg -loglevel error -y -i ${OUT}/${name}.mp4 -vf "fps=12,scale=375:-1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" ${OUT}/${name}.gif`)
  execSync(`ffmpeg -loglevel error -y -i ${OUT}/${name}.mp4 -frames:v 1 ${OUT}/${name}.png`)
  console.log(name, 'ok')
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS)
  const browser = await chromium.launch()
  for (const n of names) await record(n, SCENARIOS[n], browser)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 4: 录屏逐帧看**

Run: `node scripts/preview/record-checkin.js`
Expected: 7 个场景都打印 `ok`。用 ffmpeg 每个场景抽 4～6 帧拼成一排看：
- `meal`：印章从大到小落下、墨圈晕开、「准」后跳出来；卡片依次浮上来；没有东西卡在半路
- `meal-allontime`：0.7 秒撒一把彩带，约 1 秒落完、不挡页面
- `meal-milestone`：1.4 秒变暗，卡片弹出、纪念章转着落定、豆豆从左下角探头，彩带 2 秒内落完
- `today-open`：卡片依次浮上来、印章依次弹出、「下一顿」外圈绿光呼吸、按钮一胀一缩
- `today-warn`：琥珀色光圈、呼吸快一点
- `checkin-wait`：一道光从上往下扫过照片，三步里「上传照片」打勾、「认出菜」在跳
- `calendar`：3 天、7 天两枚纪念章彩色，14 天灰色「还差 7 天」；今天那格有底色

有问题就改样式重录，直到都对。

- [ ] **Step 5: 文档**

`CLAUDE.md`：
- 「设计」那条的 specs 列表后面加一句：「打卡动效和连续打卡里程碑见 `2026-10-25-checkin-effects-design.md`（计划 `plans/2026-10-25-checkin-effects.md`）」
- 「开发约定」加一条：「打卡页面的动效：通用动画类在 `app.wxss`（`fx-rise` / `fx-pop` / `fx-stamp` / `fx-breathe` / `fx-d1～8`，结束的样子 = 平时的样子，用 `backwards`），数字滚动和震动在 `utils/fx.js`（时钟走 `this.clock`，测试里注入 `manualClock`），自定义组件在 `miniprogram/components/`（`medal`、`celebrate`，类名带前缀）；改了打卡页面的画面就 `node scripts/preview/record-checkin.js` 录屏看」
- 「当前状态」加一条 `2026-10-25（十二）`：写清这次做了什么（结果页盖章 / 数字滚动 / 浮现 / 三顿准时彩带、首页呼吸、打卡页扫描和三步、按钮按压、连续打卡里程碑 + 纪念章 + 庆祝卡、日历纪念章一排；`streakBadges` 存在营地数据；共用文件 `streak.js` 新增，云函数已重新部署）

`README.md` 的目录说明里 `miniprogram/` 一段加 `components/`（`medal` 纪念章、`celebrate` 庆祝）和 `utils/fx.js`、`utils/confetti.js`；`scripts/preview/` 加 `record-checkin.js`。

- [ ] **Step 6: 全部测试、部署、预览码**

```bash
npm test
for f in miniprogram/utils/fx.js miniprogram/utils/confetti.js miniprogram/utils/view.js miniprogram/utils/milestone-lines.js miniprogram/components/*/*.js miniprogram/pages/{meal,today,checkin,forest}/*.js cloudfunctions/api/services/{forest,meal}.js scripts/preview/*.js; do node --check $f || echo BAD $f; done
git add -A
git commit -m "feat(fx): check-in effects recorder, docs"
git push -u origin claude/mini-program-dev-nzn2n0
npm run wx:function
npm run wx:preview
```

Expected: 测试全绿、`node --check` 没有 BAD、云函数部署成功（共用的 `streak.js` 新增、`forest` / `meal` 服务改了）、生成 `.wechat/preview-qrcode.jpg`，用 SendUserFile 发给用户，同时附一张录屏截图。

---

## Self-Review 记录

- 设计文档各节都有任务：一（结果页 → Task 7；首页 / 打卡页 → Task 8；按钮 → Task 4 的 app.wxss；日历高亮 → Task 9）、二（规则 → Task 1；存储 / 接口 → Task 2；首页文案 → Task 4；日历纪念章 → Task 9；纪念章样子 → Task 5）、三（庆祝 → Task 6、7）、四（结构 → 各任务）、五（测试 → 各任务；录屏 → Task 10）。
- 名字前后一致：`badgeLook`、`nextMilestone`、`milestonesUpTo`、`gainTitle(gain, shown)`、`decorateGain(gain, { fresh })`、`milestoneView`、`badgesView`（`label`、`firstText`）、`analysisSteps(hasPhoto, at)`、`countUp(...).done()`、`celebrate` 的 `bindclose` / `close` 事件、`FX` 时间表、`C.RUN_MS`。
- 组件类名都带前缀（`medal-*`、`cel-*`），预览渲染器里不会和 `app.wxss` 的 `.unit`、`.card` 撞。
