# 准时打卡 第一块（首页 + 准时）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 妈妈设三个饭点，饭点前后 1 小时内拍算准时；准时的印章是金色的、暖豆多给；首页换成「今日」打卡页，顶上一张「下一顿」大卡。

**Architecture:** 新的共用纯函数模块 `shared/timing.js` 管饭点、窗口、准时判定和首页大卡的状态；`shared/forest.js` 的暖豆和印章改成按准时算（取代 `STAGE_BEANS` 分档）。打卡时云函数算出 `timing` 存在这条打卡上；今日页在小程序里用同一套共用函数按当前时间算大卡和提示，每分钟刷新。

**Tech Stack:** 微信小程序原生（WXML/WXSS/JS）、微信云开发云函数（Node）、`node:test`（零依赖）。

**设计文档：** `docs/superpowers/specs/2026-10-25-on-time-checkin-design.md` 第一节。

## Global Constraints

- `cloudfunctions/api/lib/shared/` 和 `miniprogram/utils/shared/` 必须逐字节一致：改了共用文件就 `cp` 到另一边（`test/shared-sync.test.js` 会查）
- `npm test` 必须全绿；改了 JS 跑 `node --check <文件>`
- 页面面向长辈：字号偏大、文案口语化；云函数 message 用中文
- 窗口 = 饭点 ± 60 分钟（含两端），按东八区本地时间；默认饭点 `07:30 / 12:00 / 18:00`；可设范围：早 05:00～10:00、午 10:30～14:00、晚 16:00～21:00，半小时一档，相邻两顿至少隔 2 小时
- 暖豆：准时 +15、不在饭点 +5、三顿都准时另加 +15、评级绿每顿 +5，最多 75；加餐不算
- 同一顿拍几次：有一次 `timing === 'on'` 就算准时；评级按最新一条
- 老打卡没有 `timing`，算不准时；日历上已经记过的日子按当时得的暖豆（`garden.beans.earned`）显示
- 测试里凡是会按真实时钟算准时的（端到端、页面），都用 `test/helpers/fixed-date.js` 把时间固定住；今日页的定时器用可注入的 `this.clock`（测试里用 `manualClock()`），否则测试进程挂着不退
- 提交信息结尾带：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CX9A8LkVQKcNnTEsxo35Fv
  ```

## 文件结构

| 文件 | 作用 |
|---|---|
| `cloudfunctions/api/lib/shared/timing.js`（新，两边各一份） | 饭点、窗口、`timingFor`、`mealAt`、`loggedMeals`、`mealStatus`、`validateMealTimes` |
| `cloudfunctions/api/lib/shared/date.js`（两边） | 加 `localMinutes` |
| `cloudfunctions/api/lib/shared/forest.js`（两边） | 暖豆 `dayBeans`、印章 `mealStamps`（带 `onTime`）、提示 `beansHint`、`onTimeCount`、`streakFrom` |
| `cloudfunctions/api/lib/shared/garden.js`（两边） | 删掉 `STAGE_BEANS` / `nextStageGain` |
| `cloudfunctions/api/lib/profile.js`、`services/profile.js` | 档案的 `mealTimes` |
| `cloudfunctions/api/services/meal.js` | 打卡存 `timing`、暖豆反馈 |
| `cloudfunctions/api/services/forest.js`、`services/day.js` | 今天 / 日历按新规则、本月准时几顿 |
| `cloudfunctions/api/lib/prompts.js` | 点评带上拍照时间和准不准时 |
| `miniprogram/utils/view.js` | 印章金边、暖豆横幅、今天卡片、首页大卡 `nextMealCard` |
| `miniprogram/app.json`、`app.wxss` | tab 顺序；金色印章样式 |
| `miniprogram/pages/today/*` | 首页：下一顿大卡 + 每分钟刷新 |
| `miniprogram/pages/checkin/*` | 按餐次预选、准不准时的一句话 |
| `miniprogram/pages/profile/*` | 三餐时间 |
| `miniprogram/pages/meal/*`、`pages/forest/*` | 横幅加「三顿都准时」；日历准时统计 |
| `test/helpers/fixed-date.js`（新） | 测试里固定 `new Date()` / `Date.now()` |

---

### Task 1: 饭点和准时的共用规则（`timing.js`）

**Files:**
- Modify: `cloudfunctions/api/lib/shared/date.js`（再复制到 `miniprogram/utils/shared/date.js`）
- Create: `cloudfunctions/api/lib/shared/timing.js`（再复制到 `miniprogram/utils/shared/timing.js`）
- Create: `test/helpers/fixed-date.js`
- Test: `test/date.test.js`、`test/timing.test.js`（新）

**Interfaces:**
- Produces: `localMinutes(date) -> number`（东八区一天中的第几分钟）；
  `timing.js` 导出 `MAIN_MEALS`、`MEAL_WORDS`（`{ breakfast: '早饭', lunch: '午饭', dinner: '晚饭' }`）、`DEFAULT_MEAL_TIMES`、`WINDOW_MINUTES`、`MEAL_TIME_RANGES`、
  `timeOptions(mealType) -> string[]`、`mealTimesOf(profile) -> { breakfast, lunch, dinner }`、`validateMealTimes(input) -> { value, errors }`、
  `windowText(mealType, times) -> '11:00～13:00'`、`timingFor(mealType, at, times) -> 'on'|'early'|'late'|null`、`mealAt(times, at) -> mealType|null`、
  `loggedMeals(meals) -> { [mealType]: { logged, onTime } }`、
  `mealStatus(meals, times, now)` → `{ state: 'open'|'done'|'missed'|'upcoming', mealType, word, time, window, minutesLeft?, onTime?, next? }` 或 `{ state: 'allDone', allOnTime }`；
  `test/helpers/fixed-date.js` 导出 `fixDate(t, when) -> { set(when) }`

- [ ] **Step 1: 写失败的测试**

`test/date.test.js`：在顶部的解构里加上 `localMinutes,`，文件末尾加：

```js
test('localMinutes 返回东八区一天中的第几分钟', () => {
  assert.equal(localMinutes(new Date('2026-10-22T04:10:00Z')), 12 * 60 + 10)
  assert.equal(localMinutes(new Date('2026-10-22T16:30:00Z')), 30)
})
```

新建 `test/timing.test.js`：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../cloudfunctions/api/lib/shared/timing')

const TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
// 北京时间 2026-10-22 的某个钟点
const at = (hhmm) => new Date(`2026-10-22T${hhmm}:00+08:00`)
let seq = 0
const meal = (mealType, timing = 'on') => ({ mealType, timing, createdAt: ++seq })

test('默认饭点和设置选项', () => {
  assert.deepEqual(T.DEFAULT_MEAL_TIMES, TIMES)
  assert.equal(T.WINDOW_MINUTES, 60)
  assert.deepEqual(T.MEAL_WORDS, { breakfast: '早饭', lunch: '午饭', dinner: '晚饭' })
  assert.deepEqual(T.timeOptions('breakfast').slice(0, 3), ['05:00', '05:30', '06:00'])
  assert.equal(T.timeOptions('breakfast').pop(), '10:00')
  assert.deepEqual([T.timeOptions('lunch')[0], T.timeOptions('lunch').pop()], ['10:30', '14:00'])
  assert.deepEqual([T.timeOptions('dinner')[0], T.timeOptions('dinner').pop()], ['16:00', '21:00'])
})

test('mealTimesOf：没设过或不合法的用默认', () => {
  assert.deepEqual(T.mealTimesOf(null), TIMES)
  assert.deepEqual(T.mealTimesOf({}), TIMES)
  assert.deepEqual(
    T.mealTimesOf({ mealTimes: { breakfast: '06:30', lunch: '7:00', dinner: '18:15' } }),
    { breakfast: '06:30', lunch: '12:00', dinner: '18:00' },
  )
})

test('validateMealTimes：范围、半小时一档、相邻至少隔 2 小时', () => {
  assert.deepEqual(T.validateMealTimes(undefined), { value: TIMES, errors: [] })
  assert.deepEqual(T.validateMealTimes({ breakfast: '06:00', lunch: '11:30', dinner: '17:30' }).errors, [])
  assert.deepEqual(T.validateMealTimes({ breakfast: '04:30' }).errors, ['早饭时间要在 05:00～10:00 之间，按半小时选'])
  assert.deepEqual(T.validateMealTimes({ lunch: '12:15' }).errors, ['午饭时间要在 10:30～14:00 之间，按半小时选'])
  assert.deepEqual(T.validateMealTimes({ dinner: 1800 }).errors, ['晚饭时间要在 16:00～21:00 之间，按半小时选'])
  assert.deepEqual(T.validateMealTimes({ breakfast: '10:00', lunch: '11:30' }).errors, ['相邻两顿饭至少隔 2 小时'])
  assert.deepEqual(T.validateMealTimes({ breakfast: '09:00', lunch: '11:00', dinner: '16:00' }).errors, [])
})

test('timingFor：窗口两端都算准时，早了 early、晚了 late，加餐 null', () => {
  assert.equal(T.timingFor('lunch', at('11:00'), TIMES), 'on')
  assert.equal(T.timingFor('lunch', at('13:00'), TIMES), 'on')
  assert.equal(T.timingFor('lunch', at('10:59'), TIMES), 'early')
  assert.equal(T.timingFor('lunch', at('13:01'), TIMES), 'late')
  assert.equal(T.timingFor('breakfast', at('12:00'), TIMES), 'late')
  assert.equal(T.timingFor('dinner', at('12:00'), TIMES), 'early')
  assert.equal(T.timingFor('snack', at('12:00'), TIMES), null)
  // 按东八区算：UTC 23:00 是北京第二天 07:00
  assert.equal(T.timingFor('breakfast', new Date('2026-10-21T23:00:00Z'), TIMES), 'on')
})

test('mealAt 和 windowText', () => {
  assert.equal(T.mealAt(TIMES, at('07:00')), 'breakfast')
  assert.equal(T.mealAt(TIMES, at('10:00')), null)
  assert.equal(T.mealAt(TIMES, at('18:30')), 'dinner')
  assert.equal(T.windowText('breakfast', TIMES), '06:30～08:30')
  assert.equal(T.windowText('dinner', { ...TIMES, dinner: '19:30' }), '18:30～20:30')
})

test('loggedMeals：同一顿拍了几次，只要有一次准时就算准时', () => {
  const r = T.loggedMeals([meal('lunch', 'late'), meal('lunch', 'on'), meal('snack', null), meal('dinner', 'early')])
  assert.deepEqual(r, {
    breakfast: { logged: false, onTime: false },
    lunch: { logged: true, onTime: true },
    dinner: { logged: true, onTime: false },
  })
  assert.deepEqual(T.loggedMeals(undefined).lunch, { logged: false, onTime: false })
})

test('mealStatus：窗口前 / 窗口中 / 拍过了 / 过点没拍 / 都拍完', () => {
  assert.deepEqual(T.mealStatus([], TIMES, at('05:00')), {
    state: 'upcoming', mealType: 'breakfast', word: '早饭', time: '07:30', window: '06:30～08:30',
  })
  assert.deepEqual(T.mealStatus([], TIMES, at('11:20')), {
    state: 'open', mealType: 'lunch', word: '午饭', time: '12:00', window: '11:00～13:00', minutesLeft: 100,
  })
  assert.deepEqual(T.mealStatus([meal('breakfast'), meal('lunch', 'on')], TIMES, at('12:20')), {
    state: 'done', mealType: 'lunch', word: '午饭', time: '12:00', window: '11:00～13:00', onTime: true,
    next: { mealType: 'dinner', word: '晚饭', time: '18:00' },
  })
  // 刚过点 2 小时以内，先提醒补拍这一顿
  const recent = T.mealStatus([meal('breakfast')], TIMES, at('14:30'))
  assert.deepEqual([recent.state, recent.mealType], ['missed', 'lunch'])
  // 过点超过 2 小时：先看下一顿
  const later = T.mealStatus([meal('breakfast')], TIMES, at('15:10'))
  assert.deepEqual([later.state, later.mealType], ['upcoming', 'dinner'])
  // 晚上：最晚那顿没拍的
  const night = T.mealStatus([meal('breakfast'), meal('dinner', 'on')], TIMES, at('22:00'))
  assert.deepEqual([night.state, night.mealType], ['missed', 'lunch'])
  assert.deepEqual(T.mealStatus([meal('breakfast'), meal('lunch'), meal('dinner')], TIMES, at('20:00')), { state: 'allDone', allOnTime: true })
  assert.deepEqual(T.mealStatus([meal('breakfast', 'late'), meal('lunch'), meal('dinner')], TIMES, at('20:00')), { state: 'allDone', allOnTime: false })
  // 窗口里拍过了、后面没有没拍的：next 为 null
  assert.equal(T.mealStatus([meal('breakfast'), meal('lunch'), meal('dinner')], TIMES, at('18:30')).next, null)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/date.test.js test/timing.test.js`
Expected: FAIL（`localMinutes is not a function`、`Cannot find module '../cloudfunctions/api/lib/shared/timing'`）

- [ ] **Step 3: 实现**

`cloudfunctions/api/lib/shared/date.js`：在 `localHour` 后面加

```js
function localMinutes(date = new Date(), offsetMinutes = CN_OFFSET_MINUTES) {
  const d = shifted(date, offsetMinutes)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}
```

并在 `module.exports` 里 `localHour,` 后面加 `localMinutes,`。

新建 `cloudfunctions/api/lib/shared/timing.js`：

```js
// 与 miniprogram/utils/shared/timing.js 保持一致（test/shared-sync.test.js 会检查）
// 饭点和「准时」：三顿饭各有一个饭点，饭点前后 WINDOW_MINUTES 分钟内（含两端）拍算准时。都按东八区本地时间算；
// 饭点能设的范围保证所有窗口都落在 04:00～22:00，不跨午夜

const { localMinutes } = require('./date')

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']
const MEAL_WORDS = { breakfast: '早饭', lunch: '午饭', dinner: '晚饭' }
const DEFAULT_MEAL_TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const WINDOW_MINUTES = 60
// 每顿饭点能设的范围（含两端，半小时一档）；相邻两顿至少隔两个半窗口，窗口不重叠
const MEAL_TIME_RANGES = { breakfast: ['05:00', '10:00'], lunch: ['10:30', '14:00'], dinner: ['16:00', '21:00'] }
const MIN_GAP_MINUTES = 2 * WINDOW_MINUTES
// 过点没拍的那顿，过点多久以内首页大卡还先提醒补拍它
const MISSED_RECENT_MINUTES = 120

function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(typeof hhmm === 'string' ? hhmm : '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`
}

// 设置饭点的选项：范围内每半小时一个
function timeOptions(mealType) {
  const [from, to] = MEAL_TIME_RANGES[mealType].map(toMinutes)
  const out = []
  for (let t = from; t <= to; t += 30) out.push(clockText(t))
  return out
}

function isValidTime(mealType, hhmm) {
  return timeOptions(mealType).indexOf(hhmm) !== -1
}

// 档案里的饭点，没设过或不合法的用默认
function mealTimesOf(profile) {
  const src = (profile && profile.mealTimes) || {}
  const out = {}
  MAIN_MEALS.forEach((t) => {
    out[t] = isValidTime(t, src[t]) ? src[t] : DEFAULT_MEAL_TIMES[t]
  })
  return out
}

// 保存档案时校验：哪顿没传就用默认；每顿在范围内、半小时一档；相邻两顿至少隔 2 小时
function validateMealTimes(input) {
  const src = input && typeof input === 'object' ? input : {}
  const value = {}
  const errors = []
  MAIN_MEALS.forEach((t) => {
    value[t] = src[t] === undefined ? DEFAULT_MEAL_TIMES[t] : src[t]
    if (!isValidTime(t, value[t])) {
      const [from, to] = MEAL_TIME_RANGES[t]
      errors.push(`${MEAL_WORDS[t]}时间要在 ${from}～${to} 之间，按半小时选`)
    }
  })
  if (!errors.length) {
    const tooClose = MAIN_MEALS.slice(1).some((t, i) => toMinutes(value[t]) - toMinutes(value[MAIN_MEALS[i]]) < MIN_GAP_MINUTES)
    if (tooClose) errors.push('相邻两顿饭至少隔 2 小时')
  }
  return { value, errors }
}

function windowOf(mealType, times) {
  const at = toMinutes(times[mealType])
  return { start: at - WINDOW_MINUTES, end: at + WINDOW_MINUTES }
}

function windowText(mealType, times) {
  const w = windowOf(mealType, times)
  return `${clockText(w.start)}～${clockText(w.end)}`
}

// 这一刻拍这顿算不算准时：'on' 窗口内（含两端）/ 'early' 窗口前 / 'late' 窗口后；加餐没有饭点，返回 null
function timingFor(mealType, at, times) {
  if (MAIN_MEALS.indexOf(mealType) === -1) return null
  const m = localMinutes(at)
  const w = windowOf(mealType, times)
  if (m < w.start) return 'early'
  if (m > w.end) return 'late'
  return 'on'
}

// 现在正在哪顿的窗口里（打卡页预选餐次用）；不在任何窗口里返回 null
function mealAt(times, at) {
  const m = localMinutes(at)
  const hit = MAIN_MEALS.find((t) => {
    const w = windowOf(t, times)
    return m >= w.start && m <= w.end
  })
  return hit || null
}

// 今天每顿正餐：拍了没有、有没有一次是准时拍的
function loggedMeals(meals) {
  const out = {}
  MAIN_MEALS.forEach((t) => {
    out[t] = { logged: false, onTime: false }
  })
  ;(meals || []).forEach((m) => {
    const d = out[m.mealType]
    if (!d) return
    d.logged = true
    if (m.timing === 'on') d.onTime = true
  })
  return out
}

// 首页「下一顿」大卡，按顺序取第一条成立的：
//   1. 正在某顿的窗口里：拍了 → done，没拍 → open
//   2. 某顿刚过点不到 2 小时、还没拍 → missed
//   3. 之后还有没拍的 → 最近的那顿 upcoming
//   4. 今天还有过了点没拍的 → 最晚的那顿 missed
//   5. 三顿都拍了 → allDone
function mealStatus(meals, times, now) {
  const logged = loggedMeals(meals)
  const m = localMinutes(now)
  const card = (state, t, extra) => ({ state, mealType: t, word: MEAL_WORDS[t], time: times[t], window: windowText(t, times), ...extra })
  const nextAfter = (t) => {
    const later = MAIN_MEALS.slice(MAIN_MEALS.indexOf(t) + 1).find((x) => !logged[x].logged)
    return later ? { mealType: later, word: MEAL_WORDS[later], time: times[later] } : null
  }

  const current = mealAt(times, now)
  if (current) {
    if (logged[current].logged) return card('done', current, { onTime: logged[current].onTime, next: nextAfter(current) })
    return card('open', current, { minutesLeft: windowOf(current, times).end - m })
  }
  const recent = MAIN_MEALS.find((t) => {
    const end = windowOf(t, times).end
    return !logged[t].logged && m > end && m - end <= MISSED_RECENT_MINUTES
  })
  if (recent) return card('missed', recent)
  const upcoming = MAIN_MEALS.find((t) => !logged[t].logged && windowOf(t, times).start > m)
  if (upcoming) return card('upcoming', upcoming)
  const missed = MAIN_MEALS.filter((t) => !logged[t].logged)
  if (missed.length) return card('missed', missed[missed.length - 1])
  return { state: 'allDone', allOnTime: MAIN_MEALS.every((t) => logged[t].onTime) }
}

module.exports = {
  MAIN_MEALS,
  MEAL_WORDS,
  DEFAULT_MEAL_TIMES,
  WINDOW_MINUTES,
  MEAL_TIME_RANGES,
  timeOptions,
  mealTimesOf,
  validateMealTimes,
  windowText,
  timingFor,
  mealAt,
  loggedMeals,
  mealStatus,
}
```

新建 `test/helpers/fixed-date.js`（后面几块的测试用）：

```js
// 把全局 Date 定在某一刻：new Date() 和 Date.now() 都返回它，带参数的 new Date(...) 照常。
// 准时规则按真实时钟算，端到端和页面测试要固定时间；t.after 时换回真的 Date
function fixDate(t, when) {
  const Real = Date
  let fixed = new Real(when).getTime()
  class FixedDate extends Real {
    constructor(...args) {
      super(...(args.length ? args : [fixed]))
    }

    static now() {
      return fixed
    }
  }
  global.Date = FixedDate
  t.after(() => {
    global.Date = Real
  })
  return {
    set(next) {
      fixed = new Real(next).getTime()
    },
  }
}

module.exports = { fixDate }
```

复制共用文件：

```bash
cp cloudfunctions/api/lib/shared/date.js cloudfunctions/api/lib/shared/timing.js miniprogram/utils/shared/
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/date.test.js test/timing.test.js test/shared-sync.test.js`
Expected: PASS

- [ ] **Step 5: 全量测试 + 提交**

Run: `npm test`（全绿）、`node --check cloudfunctions/api/lib/shared/timing.js`

```bash
git add cloudfunctions/api/lib/shared/date.js cloudfunctions/api/lib/shared/timing.js miniprogram/utils/shared/date.js miniprogram/utils/shared/timing.js test/date.test.js test/timing.test.js test/helpers/fixed-date.js
git commit -m "feat(timing): meal times, one-hour windows and the next-meal status"
```

---

### Task 2: 档案的三餐时间

**Files:**
- Modify: `cloudfunctions/api/lib/profile.js`
- Modify: `cloudfunctions/api/services/profile.js`
- Test: `test/profile.test.js`、`test/services-profile.test.js`

**Interfaces:**
- Consumes: `validateMealTimes`、`mealTimesOf`（Task 1）
- Produces: `validateProfile(input).value.mealTimes`（只有传了 `mealTimes` 才有）；`profile.save` 存的档案一定有 `mealTimes`（没传就沿用旧的，没有旧的用默认）

- [ ] **Step 1: 写失败的测试**

`test/profile.test.js` 末尾加：

```js
test('三餐时间：传了才校验，不合法给出错误', () => {
  assert.equal(validateProfile(valid).value.mealTimes, undefined)
  const ok = validateProfile({ ...valid, mealTimes: { breakfast: '07:00', lunch: '12:30', dinner: '18:30' } })
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.value.mealTimes, { breakfast: '07:00', lunch: '12:30', dinner: '18:30' })
  const bad = validateProfile({ ...valid, mealTimes: { breakfast: '11:00' } })
  assert.deepEqual(bad.errors, ['早饭时间要在 05:00～10:00 之间，按半小时选'])
})
```

`test/services-profile.test.js` 末尾加（文件里已有 `setup()` 和 `input`）：

```js
test('save：三餐时间没传时沿用旧的，没有旧的用默认', async () => {
  const { service } = setup()
  const first = await service.save('u1', input)
  assert.deepEqual(first.mealTimes, { breakfast: '07:30', lunch: '12:00', dinner: '18:00' })
  const changed = await service.save('u1', { ...input, mealTimes: { breakfast: '07:00', lunch: '12:30', dinner: '18:30' } })
  assert.deepEqual(changed.mealTimes, { breakfast: '07:00', lunch: '12:30', dinner: '18:30' })
  const kept = await service.save('u1', input)
  assert.deepEqual(kept.mealTimes, { breakfast: '07:00', lunch: '12:30', dinner: '18:30' })
  await assert.rejects(service.save('u1', { ...input, mealTimes: { lunch: '12:15' } }), { code: 'BAD_REQUEST' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/profile.test.js test/services-profile.test.js`
Expected: FAIL（`mealTimes` 是 undefined）

- [ ] **Step 3: 实现**

`cloudfunctions/api/lib/profile.js`：顶部加 `const { validateMealTimes } = require('./shared/timing')`；在 `NUMBER_FIELDS.forEach(...)` 之后、`return` 之前加：

```js
  // 三餐时间：老版本的小程序不传，就不动（保存时沿用旧的）
  if (src.mealTimes !== undefined) {
    const times = validateMealTimes(src.mealTimes)
    value.mealTimes = times.value
    errors.push(...times.errors)
  }
```

`cloudfunctions/api/services/profile.js`：顶部加 `const { mealTimesOf } = require('../lib/shared/timing')`；`profile` 对象改成：

```js
      const profile = {
        ...value,
        mealTimes: value.mealTimes || mealTimesOf(existing),
        dailyKcal: calcDailyKcal(value),
        createdAt: existing ? existing.createdAt : at.getTime(),
        updatedAt: at.getTime(),
      }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/profile.test.js test/services-profile.test.js`，再 `npm test`
Expected: PASS（`test/profile.test.js` 里原来 `deepEqual(value, {...})` 那条不传 `mealTimes`，所以不受影响）

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api/lib/profile.js cloudfunctions/api/services/profile.js test/profile.test.js test/services-profile.test.js
git commit -m "feat(profile): meal times in the profile"
```

---

### Task 3: 暖豆和印章按准时算（共用规则 + 云函数）

**Files:**
- Modify: `cloudfunctions/api/lib/shared/forest.js`（整个换掉，再复制到 `miniprogram/utils/shared/forest.js`）
- Modify: `cloudfunctions/api/lib/shared/garden.js`（删 `STAGE_BEANS` / `STAGE_ORDER` / `nextStageGain`，再复制）
- Modify: `cloudfunctions/api/services/forest.js`、`services/meal.js`、`services/day.js`
- Test: `test/forest.test.js`（重写）、`test/garden.test.js`、`test/services-forest.test.js`（重写）、`test/services-day.test.js`、`test/services-meal.test.js`、`test/cloud-e2e.test.js`、`test/pages.test.js`

**Interfaces:**
- Consumes: `MAIN_MEALS`、`MEAL_WORDS`、`loggedMeals`、`mealStatus`、`windowText`、`mealTimesOf`、`timingFor`（Task 1）；`fixDate`（Task 1）
- Produces:
  - `forest.js`：`MAIN_MEALS`（转出）、`BEANS = { onTime: 15, offTime: 5, allOnTime: 15, green: 5 }`、
    `dayBeans(meals) -> { beans, logged: mealType[], onTime: mealType[], allOnTime }`、
    `mealStamps(meals) -> [{ mealType, label, state, onTime }]`、`beansHint(meals, times, now) -> string`、`onTimeCount(meals) -> number`、`streakFrom(days, today)`
  - 打卡（`meals` 文档）多一个字段 `timing: 'on'|'early'|'late'|null`
  - `meal.analyze` / `meal.reanalyze` 返回的 `gain`：`{ beans, beansToday, hint, stamps, mealType, timing, allOnTime }`（`allOnTime` = 这次让三顿都准时了）
  - `forest.today(openid, date, meals, profile?)` 和 `day.get().daily`：`{ date, stamps, beansToday, hint, streak, beans, monthOnTime, mealTimes }`（不再有 `nextGain`）
  - `forest.syncDay` 返回 `{ beans }`
  - `forest.get().days[i]` 多 `onTime`（这天准时几顿）；`stats` 多 `onTime`；已记过的日子 `beans` 用 `garden.beans.earned[date]`

- [ ] **Step 1: 写失败的测试（共用规则）**

把 `test/forest.test.js` 整个换成：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { BEANS, dayBeans, mealStamps, beansHint, onTimeCount, streakFrom } = require('../cloudfunctions/api/lib/shared/forest')

const TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const at = (hhmm) => new Date(`2026-10-22T${hhmm}:00+08:00`)
let seq = 0
function meal(mealType, timing = 'on', rating = 'yellow', overrides = {}) {
  seq += 1
  return { mealType, timing, status: 'done', createdAt: seq, date: '2026-10-22', analysis: { rating, isFood: true, totalKcal: 300 }, ...overrides }
}

test('暖豆数额', () => {
  assert.deepEqual(BEANS, { onTime: 15, offTime: 5, allOnTime: 15, green: 5 })
})

test('dayBeans：准时 15、不在饭点 5、绿色每顿 5、三顿准时再 15', () => {
  assert.deepEqual(dayBeans([]), { beans: 0, logged: [], onTime: [], allOnTime: false })
  assert.equal(dayBeans(undefined).beans, 0)
  assert.equal(dayBeans([meal('lunch')]).beans, 15)
  assert.equal(dayBeans([meal('lunch', 'late')]).beans, 5)
  assert.equal(dayBeans([meal('lunch', 'early', 'green')]).beans, 10)
  assert.deepEqual(dayBeans([meal('breakfast', 'on', 'green'), meal('lunch', 'on', 'green'), meal('dinner', 'on', 'green')]), {
    beans: 75, logged: ['breakfast', 'lunch', 'dinner'], onTime: ['breakfast', 'lunch', 'dinner'], allOnTime: true,
  })
  assert.equal(dayBeans([meal('breakfast'), meal('lunch'), meal('dinner', 'late')]).beans, 35)
})

test('dayBeans：加餐不算；老打卡没有 timing 算不准时；失败的打卡也算拍了', () => {
  assert.equal(dayBeans([meal('snack', null, 'green')]).beans, 0)
  assert.equal(dayBeans([meal('lunch', 'on', 'yellow', { timing: undefined })]).beans, 5)
  assert.equal(dayBeans([meal('lunch', 'on', null, { status: 'failed', analysis: null })]).beans, 15)
})

test('dayBeans：同一顿拍几次，有一次准时就算准时，评级看最新一条', () => {
  const meals = [meal('lunch', 'on', 'green', { createdAt: 100 }), meal('lunch', 'late', 'red', { createdAt: 200 })]
  assert.equal(dayBeans(meals).beans, 15)
  assert.equal(dayBeans(meals.slice().reverse()).beans, 15)
})

test('mealStamps：三个印章，评级颜色 + 有没有准时', () => {
  assert.deepEqual(mealStamps([]).map((s) => [s.label, s.state, s.onTime]), [['早', 'none', false], ['午', 'none', false], ['晚', 'none', false]])
  assert.equal(mealStamps(undefined).length, 3)
  assert.deepEqual(mealStamps([
    meal('breakfast', 'late', 'red'),
    meal('breakfast', 'late', 'green'),
    meal('lunch', 'on', null, { status: 'failed', analysis: null }),
    meal('snack', null, 'red'),
  ]), [
    { mealType: 'breakfast', label: '早', state: 'green', onTime: false },
    { mealType: 'lunch', label: '午', state: 'done', onTime: true },
    { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
  ])
})

test('beansHint：围绕下一顿准时拍', () => {
  assert.equal(beansHint([], TIMES, at('05:00')), '早饭 06:30～08:30 拍算准时，能得 15 暖豆')
  assert.equal(beansHint([], TIMES, at('09:00')), '早饭过点了，现在补拍也有 5 暖豆')
  assert.equal(beansHint([meal('breakfast'), meal('lunch')], TIMES, at('12:30')), '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(beansHint([meal('breakfast'), meal('lunch')], TIMES, at('17:10')), '晚饭 17:00～19:00 拍算准时，能得 15 暖豆，三顿都准时再加 15')
  assert.equal(beansHint([meal('breakfast'), meal('lunch'), meal('dinner')], TIMES, at('20:00')), '三顿都准时拍了，真棒！')
  assert.equal(beansHint([meal('breakfast', 'late'), meal('lunch'), meal('dinner')], TIMES, at('20:00')), '三顿都拍完啦！明天按饭点拍，暖豆更多')
  assert.equal(beansHint([meal('lunch'), meal('dinner')], TIMES, at('18:30')), '早饭还没拍，补拍也有 5 暖豆')
})

test('onTimeCount：一段日子里准时拍的正餐顿数，每天每顿最多算一次', () => {
  assert.equal(onTimeCount([]), 0)
  assert.equal(onTimeCount(undefined), 0)
  assert.equal(onTimeCount([
    meal('breakfast', 'on', 'green', { date: '2026-10-20' }),
    meal('breakfast', 'on', 'green', { date: '2026-10-20' }),
    meal('lunch', 'late', 'green', { date: '2026-10-20' }),
    meal('lunch', 'on', 'green', { date: '2026-10-21' }),
    meal('snack', null, 'green', { date: '2026-10-21' }),
  ]), 2)
})

test('streakFrom：今天有打卡时从今天往前数', () => {
  const days = { '2026-10-20': true, '2026-10-21': true, '2026-10-22': true }
  assert.equal(streakFrom(days, '2026-10-22'), 3)
})

test('streakFrom：今天还没打卡时算到昨天', () => {
  assert.equal(streakFrom({ '2026-10-20': true, '2026-10-21': true }, '2026-10-22'), 2)
})

test('streakFrom：中间断档、跨月、没有记录', () => {
  assert.equal(streakFrom({ '2026-10-18': true, '2026-10-20': true, '2026-10-21': true }, '2026-10-21'), 2)
  assert.equal(streakFrom({ '2026-09-30': true, '2026-10-01': true }, '2026-10-01'), 2)
  assert.equal(streakFrom({ '2026-10-19': true }, '2026-10-22'), 0)
  assert.equal(streakFrom({}, '2026-10-22'), 0)
  assert.equal(streakFrom(undefined, '2026-10-22'), 0)
})
```

`test/garden.test.js`：删掉 `assert.deepEqual(G.STAGE_BEANS, ...)` 那一行；`beanBalance / nextStageGain` 那个测试改名成 `'beanBalance'`，删掉三行 `nextStageGain` 断言，再加一行 `assert.equal(G.nextStageGain, undefined)`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/forest.test.js test/garden.test.js`
Expected: FAIL（`BEANS` / `dayBeans` 不存在）

- [ ] **Step 3: 实现共用规则**

把 `cloudfunctions/api/lib/shared/forest.js` 整个换成：

```js
// 与 miniprogram/utils/shared/forest.js 保持一致（test/shared-sync.test.js 会检查）
// 每天的暖豆和早 / 午 / 晚三个印章：看三顿正餐拍了没有、是不是准时拍的（饭点规则在 timing.js）、吃得好不好

const { addDays } = require('./date')
const { MAIN_MEALS, MEAL_WORDS, loggedMeals, mealStatus, windowText } = require('./timing')

// 准时拍一顿 15、不在饭点拍 5、三顿都准时再加 15、评级「吃得好」（绿）每顿 5；加餐照常点评但不算暖豆
const BEANS = { onTime: 15, offTime: 5, allOnTime: 15, green: 5 }
const STAMP_LABELS = { breakfast: '早', lunch: '午', dinner: '晚' }

// 每种正餐最新的一条（重拍以最后一次的评级为准）
function latestMainMeals(meals) {
  const latest = {}
  ;(meals || []).forEach((m) => {
    if (MAIN_MEALS.indexOf(m.mealType) === -1) return
    if (!latest[m.mealType] || m.createdAt > latest[m.mealType].createdAt) latest[m.mealType] = m
  })
  return latest
}

function ratingOf(m) {
  return m && m.status === 'done' && m.analysis && m.analysis.rating ? m.analysis.rating : null
}

// 这一天的暖豆；logged / onTime 是拍了的、准时拍了的正餐
function dayBeans(meals) {
  const logged = loggedMeals(meals)
  const latest = latestMainMeals(meals)
  let beans = 0
  MAIN_MEALS.forEach((t) => {
    if (!logged[t].logged) return
    beans += logged[t].onTime ? BEANS.onTime : BEANS.offTime
    if (ratingOf(latest[t]) === 'green') beans += BEANS.green
  })
  const onTime = MAIN_MEALS.filter((t) => logged[t].onTime)
  const allOnTime = onTime.length === MAIN_MEALS.length
  if (allOnTime) beans += BEANS.allOnTime
  return { beans, logged: MAIN_MEALS.filter((t) => logged[t].logged), onTime, allOnTime }
}

// 早 / 午 / 晚三个印章：state 是评级的颜色（分析失败但打了卡是 done，没打卡是 none），onTime 是有没有准时拍的一次
function mealStamps(meals) {
  const logged = loggedMeals(meals)
  const latest = latestMainMeals(meals)
  return MAIN_MEALS.map((t) => ({
    mealType: t,
    label: STAMP_LABELS[t],
    state: logged[t].logged ? ratingOf(latest[t]) || 'done' : 'none',
    onTime: logged[t].onTime,
  }))
}

// 卡片上的一句话：围绕「下一顿准时拍」说能得多少暖豆
function beansHint(meals, times, now) {
  const s = mealStatus(meals, times, now)
  const day = dayBeans(meals)
  if (s.state === 'open' || s.state === 'upcoming') {
    const last = day.onTime.length === MAIN_MEALS.length - 1 ? `，三顿都准时再加 ${BEANS.allOnTime}` : ''
    return `${s.word} ${s.window} 拍算准时，能得 ${BEANS.onTime} 暖豆${last}`
  }
  if (s.state === 'missed') return `${s.word}过点了，现在补拍也有 ${BEANS.offTime} 暖豆`
  if (s.state === 'done' && s.next) return `下一顿${s.next.word} ${windowText(s.next.mealType, times)} 拍算准时`
  const missing = MAIN_MEALS.filter((t) => day.logged.indexOf(t) === -1)
  if (missing.length) return `${missing.map((t) => MEAL_WORDS[t]).join('、')}还没拍，补拍也有 ${BEANS.offTime} 暖豆`
  return day.allOnTime ? '三顿都准时拍了，真棒！' : '三顿都拍完啦！明天按饭点拍，暖豆更多'
}

// 一段日子里准时拍的正餐顿数（每天每顿最多算一次）
function onTimeCount(meals) {
  const byDate = {}
  ;(meals || []).forEach((m) => {
    ;(byDate[m.date] = byDate[m.date] || []).push(m)
  })
  return Object.keys(byDate).reduce((sum, d) => sum + dayBeans(byDate[d]).onTime.length, 0)
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
  MAIN_MEALS,
  BEANS,
  dayBeans,
  mealStamps,
  beansHint,
  onTimeCount,
  streakFrom,
}
```

`cloudfunctions/api/lib/shared/garden.js`：删掉这三段

```js
// 每天的树长到哪个阶段，当天就给多少暖豆（见 shared/forest.js 的 dayTree）
const STAGE_BEANS = { empty: 0, sprout: 10, small: 20, big: 40, bloom: 50, fruit: 60 }
const STAGE_ORDER = ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit']
```

```js
function nextStageGain(stage) {
  const i = STAGE_ORDER.indexOf(stage)
  if (i === -1 || i === STAGE_ORDER.length - 1) return 0
  return STAGE_BEANS[STAGE_ORDER[i + 1]] - STAGE_BEANS[stage]
}
```

以及 `module.exports` 里的 `STAGE_BEANS,` 和 `nextStageGain,`。然后：

```bash
cp cloudfunctions/api/lib/shared/forest.js cloudfunctions/api/lib/shared/garden.js miniprogram/utils/shared/
```

- [ ] **Step 4: 跑共用规则的测试**

Run: `node --test test/forest.test.js test/garden.test.js test/shared-sync.test.js`
Expected: PASS（service 的测试这时还是红的，下一步改）

- [ ] **Step 5: 改云函数 services**

`cloudfunctions/api/services/forest.js` 整个换成：

```js
const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp } = require('../lib/camp-state')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey, addDays } = require('../lib/shared/date')
const { dayBeans, mealStamps, beansHint, onTimeCount, streakFrom } = require('../lib/shared/forest')
const { mealTimesOf } = require('../lib/shared/timing')
const { beanBalance } = require('../lib/shared/garden')

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function createForestService({ repo, now }) {
  async function load(openid) {
    return normalizeCamp(await repo.getGarden(openid))
  }

  // 月初到这一天的打卡（算「本月准时几顿」）
  function monthSoFar(openid, date) {
    return repo.listMealsBetween(openid, `${date.slice(0, 7)}-01`, date)
  }

  // 今天的印章、暖豆、一句提示、连续天数、余额、本月准时几顿、饭点
  function todayView(date, meals, garden, profile, monthMeals) {
    const times = mealTimesOf(profile)
    return {
      date,
      stamps: mealStamps(meals),
      beansToday: dayBeans(meals).beans,
      hint: beansHint(meals, times, now()),
      streak: streakFrom(garden.days, dateKey(now())),
      beans: Math.max(0, beanBalance(garden)),
      monthOnTime: onTimeCount(monthMeals),
      mealTimes: times,
    }
  }

  return {
    // 打卡新增、重新分析、删除之后调用：按这一天的正餐重算当天的暖豆，重复调用结果不变
    async syncDay(openid, date) {
      const { beans, logged } = dayBeans(await repo.listMeals(openid, date))
      const garden = await load(openid)
      const days = { ...garden.days }
      const earned = { ...garden.beans.earned }
      if (!logged.length) {
        delete days[date]
        delete earned[date]
      } else {
        days[date] = true
        earned[date] = beans
      }
      await repo.saveGarden(openid, { ...garden, days, beans: { ...garden.beans, earned } })
      return { beans }
    },

    // profile 不传就自己读（营地页调用时手上没有档案）
    async today(openid, date, meals, profile) {
      const [garden, prof, monthMeals] = await Promise.all([
        load(openid),
        profile === undefined ? repo.getProfile(openid) : profile,
        monthSoFar(openid, date),
      ])
      return todayView(date, meals, garden, prof, monthMeals)
    },

    // 打卡日历：按月显示每天的印章、暖豆、准时几顿
    async get(openid, input) {
      const today = dateKey(now())
      const currentMonth = today.slice(0, 7)
      const month = (input || {}).month || currentMonth
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth) {
        throw new AppError(CODES.BAD_REQUEST, '月份不对')
      }

      const start = `${month}-01`
      const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
      const [garden, monthMeals, profile] = await Promise.all([
        load(openid),
        repo.listMealsBetween(openid, start, end),
        repo.getProfile(openid),
      ])
      const earned = garden.beans.earned || {}
      const byDate = {}
      monthMeals.forEach((m) => {
        ;(byDate[m.date] = byDate[m.date] || []).push(m)
      })

      const days = []
      for (let date = start; date <= end; date = addDays(date, 1)) {
        const meals = byDate[date] || []
        const future = date > today
        const day = dayBeans(meals)
        days.push({
          date,
          day: Number(date.slice(8)),
          future,
          stamps: future ? [] : mealStamps(meals),
          // 记过的日子按当时得的（规则改过以前的日子不变），没记过的按现在的规则算
          beans: future ? 0 : date in earned ? earned[date] : day.beans,
          onTime: future ? 0 : day.onTime.length,
          mealsCount: meals.length,
          kcal: sumMeals(meals).kcal,
        })
      }

      const current = month === currentMonth
      const todayMeals = current ? byDate[today] || [] : await repo.listMeals(openid, today)
      const todayMonth = current ? monthMeals.filter((m) => m.date <= today) : await monthSoFar(openid, today)
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
          onTime: days.reduce((sum, d) => sum + d.onTime, 0),
        },
        today: todayView(today, todayMeals, garden, profile, todayMonth),
        totalDays: Object.keys(garden.days).length,
      }
    },
  }
}

module.exports = { createForestService }
```

`cloudfunctions/api/services/meal.js`：

1. 顶部的 import 换成：

```js
const { AppError, CODES } = require('../lib/errors')
const { parseMealAnalysis } = require('../lib/parse')
const { buildMealMessages } = require('../lib/prompts')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey } = require('../lib/shared/date')
const { isMealType } = require('../lib/shared/meal-types')
const { MAIN_MEALS, dayBeans, mealStamps, beansHint } = require('../lib/shared/forest')
const { mealTimesOf, timingFor } = require('../lib/shared/timing')
```

2. `beansChange` 换成：

```js
// 这次打卡前后今天的暖豆变了多少，给打卡结果页做即时反馈
function beansChange(beforeMeals, afterMeals, meal, times, at) {
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
  }
}
```

3. `runAnalysis` 的参数和 `base` 换成（把拍照时间带给提示词，Task 4 用）：

```js
  async function runAnalysis({ profile, mealType, note, fileID, consumed, timing, at, times }) {
    const base = { profile, mealType, note, consumedKcal: consumed, timing, at, times }
```

4. `analyze` 里从 `const profile = await requireProfile(openid)` 到 `const saved = ...` 换成：

```js
      const profile = await requireProfile(openid)
      const at = now()
      const date = dateKey(at)
      const times = mealTimesOf(profile)
      const timing = timingFor(src.mealType, at, times)
      const meals = await repo.listMeals(openid, date)
      const result = await runAnalysis({ profile, mealType: src.mealType, note, fileID, consumed: consumedKcal(meals), timing, at, times })

      const meal = {
        _openid: openid,
        date,
        mealType: src.mealType,
        timing,
        fileID,
        note,
        ...result,
        createdAt: at.getTime(),
        updatedAt: at.getTime(),
      }
      const saved = { _id: await repo.addMeal(meal), ...meal }
```

   同一个函数里 `gain = beansChange(meals, meals.concat(saved))` 改成 `gain = beansChange(meals, meals.concat(saved), saved, times, at)`。

5. `reanalyze` 里：`const meals = await repo.listMeals(openid, meal.date)` 前面加 `const times = mealTimesOf(profile)`；`runAnalysis({...})` 的参数对象里加 `timing: meal.timing || null, at: new Date(meal.createdAt), times`；
   `gain = beansChange(meals, meals.map((m) => (m._id === meal._id ? updated : m)))` 改成 `gain = beansChange(meals, meals.map((m) => (m._id === meal._id ? updated : m)), updated, times, now())`。

`cloudfunctions/api/services/day.js` 的 `get` 里 `daily: await forest.today(openid, date, meals),` 改成 `daily: await forest.today(openid, date, meals, profile),`。

- [ ] **Step 6: 改 service、端到端和页面测试的期望值**

测试里的 `NOW` 是北京时间 2026-10-22 12:00：这时拍午饭准时、拍早饭算晚（late）、拍晚饭算早（early）；直接用 `repo.addMeal` 塞的打卡没有 `timing`，算不准时。

`test/services-forest.test.js` 整个换成：

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createForestService } = require('../cloudfunctions/api/services/forest')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')
const { addDays } = require('../cloudfunctions/api/lib/shared/date')

function setup() {
  const repo = createFakeRepo()
  const forest = createForestService({ repo, now: () => NOW })
  return { repo, forest }
}

let seq = 0
async function addMeal(repo, date, mealType, { rating = 'yellow', kcal = 300, timing = 'on' } = {}) {
  seq += 1
  return repo.addMeal({ _openid: 'u1', date, mealType, timing, status: 'done', analysis: { rating, totalKcal: kcal }, createdAt: seq })
}

test('syncDay：按当天打卡记下暖豆（准时 15、不在饭点 5）', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast', { timing: 'late' })
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 5 })
  let garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 5 })

  await addMeal(repo, TODAY, 'lunch')
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 20 })
  garden = await repo.getGarden('u1')
  assert.deepEqual(garden.beans.earned, { [TODAY]: 20 })
})

test('syncDay：重复同步不会重复记豆', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast')
  await forest.syncDay('u1', TODAY)
  await forest.syncDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 15 })
})

test('syncDay：只剩加餐时这天不算打卡，暖豆收回', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'lunch')
  await forest.syncDay('u1', TODAY)
  repo.state.meals = []
  await addMeal(repo, TODAY, 'snack', { timing: null })
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 0 })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, {})
  assert.deepEqual(garden.beans.earned, {})
})

test('syncDay：旧档先迁成营地再记豆；营地文档里其他字段保留', async () => {
  const { repo, forest } = setup()
  await repo.saveGarden('u1', { currentSpecies: 'peach', unlocked: ['apple'], unseen: [], days: { '2026-10-20': 'apple' }, inventory: { daisy: 2 }, beans: { spent: 30, bonus: 60, earned: {} } })
  await addMeal(repo, TODAY, 'lunch')
  await forest.syncDay('u1', TODAY)
  const garden = await repo.getGarden('u1')
  assert.equal(garden.camp, 1)
  assert.equal(garden.inventory, undefined)
  assert.deepEqual(garden.beans, { spent: 0, bonus: 0, earned: { [TODAY]: 15 } })
  assert.deepEqual(garden.days, { '2026-10-20': 'apple', [TODAY]: true })
  assert.equal(garden.currentSpecies, undefined)
  assert.equal(garden.unlocked, undefined)
  await repo.saveGarden('u1', { ...garden, foods: { xiaomi: 2 }, beans: { ...garden.beans, bonus: 60, spent: 30 } })
  await forest.syncDay('u1', TODAY)
  const again = await repo.getGarden('u1')
  assert.deepEqual(again.foods, { xiaomi: 2 })
  assert.deepEqual(again.beans, { spent: 30, bonus: 60, earned: { [TODAY]: 15 } })
})

test('today：今天的印章、暖豆、提示、连续天数、本月准时几顿', async () => {
  const { repo, forest } = setup()
  for (let i = 3; i >= 1; i--) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
  await addMeal(repo, TODAY, 'breakfast', { rating: 'green', timing: 'late' })
  await addMeal(repo, TODAY, 'lunch', { rating: 'green' })
  await forest.syncDay('u1', TODAY)
  const view = await forest.today('u1', TODAY, await repo.listMeals('u1', TODAY))
  assert.deepEqual(view.stamps.map((s) => [s.state, s.onTime]), [['green', false], ['green', true], ['none', false]])
  // 12:00 午饭已经拍了，提示看下一顿
  assert.equal(view.hint, '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(view.beansToday, 30)
  assert.equal(view.streak, 4)
  assert.equal(view.beans, 75)
  assert.equal(view.monthOnTime, 4)
  assert.deepEqual(view.mealTimes, { breakfast: '07:30', lunch: '12:00', dinner: '18:00' })
  assert.equal(view.nextGain, undefined)
})

test('today：按档案里的饭点算', async () => {
  const { repo, forest } = setup()
  const view = await forest.today('u1', TODAY, [], { mealTimes: { breakfast: '07:30', lunch: '11:00', dinner: '18:00' } })
  assert.equal(view.hint, '午饭 10:00～12:00 拍算准时，能得 15 暖豆')
})

test('today：还没有营地时也能返回，余额不显示负数', async () => {
  const { repo, forest } = setup()
  const empty = await forest.today('u1', TODAY, [])
  assert.equal(empty.beansToday, 0)
  assert.deepEqual(empty.stamps.map((s) => s.state), ['none', 'none', 'none'])
  assert.equal(empty.streak, 0)
  assert.equal(empty.beans, 0)
  assert.equal(empty.monthOnTime, 0)
  await repo.saveGarden('u1', { beans: { earned: {}, bonus: 0, spent: 30 } })
  assert.equal((await forest.today('u1', TODAY, [])).beans, 0)
})

test('get：本月日历，每天的印章、暖豆、准时几顿，未来日期标 future', async () => {
  const { repo, forest } = setup()
  for (const t of ['breakfast', 'lunch', 'dinner']) await addMeal(repo, '2026-10-20', t, { rating: 'green', kcal: 400 })
  await addMeal(repo, '2026-10-21', 'lunch')
  await addMeal(repo, '2026-10-21', 'snack', { rating: 'red', kcal: 200, timing: null })
  await addMeal(repo, TODAY, 'breakfast', { timing: 'late' })
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
      { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
      { mealType: 'lunch', label: '午', state: 'green', onTime: true },
      { mealType: 'dinner', label: '晚', state: 'green', onTime: true },
    ],
    beans: 75,
    onTime: 3,
    mealsCount: 3,
    kcal: 1200,
  })
  assert.deepEqual(view.days[20].stamps.map((s) => s.state), ['none', 'yellow', 'none'])
  assert.equal(view.days[20].beans, 15)
  assert.equal(view.days[20].mealsCount, 2)
  assert.equal(view.days[21].beans, 20)
  assert.equal(view.days[21].onTime, 1)
  assert.equal(view.days[0].beans, 0)
  assert.equal(view.days[0].future, false)
  assert.equal(view.days[22].future, true)
  assert.deepEqual(view.days[22].stamps, [])
  assert.deepEqual(view.stats, { days: 3, beans: 110, onTime: 5 })
  assert.equal(view.prevMonth, '2026-09')
  assert.equal(view.nextMonth, null)
  assert.equal(view.today.beansToday, 20)
  assert.equal(view.today.streak, 3)
  assert.equal(view.today.monthOnTime, 5)
  assert.equal(view.totalDays, 3)
})

test('get：规则改过以前记下的日子，按当时得的暖豆显示', async () => {
  const { repo, forest } = setup()
  await repo.addMeal({ _openid: 'u1', date: '2026-10-19', mealType: 'lunch', status: 'done', analysis: { rating: 'green', totalKcal: 300 }, createdAt: 1 })
  await repo.saveGarden('u1', { camp: 1, days: { '2026-10-19': true }, beans: { earned: { '2026-10-19': 40 }, bonus: 0, spent: 0 } })
  const view = await forest.get('u1', {})
  assert.equal(view.days[18].beans, 40)
  assert.equal(view.days[18].onTime, 0)
})

test('get：查看过去的月份', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, '2026-09-30', 'lunch')
  await forest.syncDay('u1', '2026-09-30')
  const view = await forest.get('u1', { month: '2026-09' })
  assert.equal(view.days.length, 30)
  assert.equal(view.days[29].beans, 15)
  assert.equal(view.firstWeekday, 2)
  assert.equal(view.nextMonth, '2026-10')
  assert.equal(view.today.date, TODAY)
})

test('get：月份不合法或在未来时 BAD_REQUEST', async () => {
  const { forest } = setup()
  await assert.rejects(forest.get('u1', { month: '2026-13' }), { code: 'BAD_REQUEST' })
  await assert.rejects(forest.get('u1', { month: '10/2026' }), { code: 'BAD_REQUEST' })
  await assert.rejects(forest.get('u1', { month: '2026-11' }), { code: 'BAD_REQUEST' })
})
```

`test/services-day.test.js`：`get：带上今天的暖豆和印章` 这个测试的断言换成（`seedMeals` 塞的早餐绿、午餐黄都没有 `timing`，各算 5，早餐绿再 +5）：

```js
  assert.deepEqual(day.daily.stamps.map((s) => s.state), ['green', 'yellow', 'none'])
  assert.equal(day.daily.hint, '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(day.daily.beansToday, 15)
  assert.equal(day.daily.monthOnTime, 0)
  assert.equal(day.daily.nextGain, undefined)
```

`test/services-meal.test.js`：

- `analyze：有照片时调用视觉模型并保存`：`assert.equal(gain.beans, 10)` 改成 `assert.equal(gain.beans, 20)`，并在它前面加 `assert.equal(meal.timing, 'on')`（午饭 12:00 准时 15 + 绿 5）。
- `analyze 正餐：返回这次多得的暖豆和今天的印章，并记下当天暖豆` 的 `deepEqual(meal.gain, …)` 换成（早饭 12:00 拍算晚：5 + 绿 5）：

```js
  assert.equal(meal.timing, 'late')
  assert.deepEqual(meal.gain, {
    beans: 10,
    beansToday: 10,
    hint: '午饭 11:00～13:00 拍算准时，能得 15 暖豆',
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green', onTime: false },
      { mealType: 'lunch', label: '午', state: 'none', onTime: false },
      { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
    ],
    mealType: 'breakfast',
    timing: 'late',
    allOnTime: false,
  })
```

  `earned` 那行保持 `{ [TODAY]: 10 }`。
- `analyze 加餐：不算暖豆`：在 `assert.equal(meal.gain, null)` 后面加 `assert.equal(meal.timing, null)`。
- `analyze：失败的打卡也算打卡，印章是灰的`：`assert.equal(meal.gain.beans, 10)` 改成 `assert.equal(meal.gain.beans, 15)`，再加 `assert.equal(meal.gain.stamps[1].onTime, true)`。
- `reanalyze：评级变绿后暖豆拿满` 改名 `reanalyze：评级变绿后多 5 暖豆`，断言换成（早、午两条是塞的老打卡，各 5 + 绿 5；晚饭 12:00 拍算早，失败 5，重新分析变绿再 +5）：

```js
  assert.equal(failed.gain.beans, 5)
  assert.equal(failed.gain.beansToday, 25)

  const meal = await service.reanalyze('u1', { mealId: failed._id, note: '清蒸鱼和青菜' })
  assert.equal(meal.timing, 'early')
  assert.equal(meal.gain.beans, 5)
  assert.equal(meal.gain.beansToday, 30)
  assert.equal(meal.gain.hint, '三顿都拍完啦！明天按饭点拍，暖豆更多')
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 30 })
```

`test/cloud-e2e.test.js`：

- 顶部加 `const { fixDate } = require('./helpers/fixed-date')`。
- `每日暖豆：三顿全绿拿满、日历印章、删除后回退` 改成 `async (t) => {`，开头 `const clock = fixDate(t, '2026-10-22T07:40:00+08:00')`；循环换成每顿在自己的饭点拍：

```js
  const times = { breakfast: '07:40', lunch: '12:10', dinner: '18:10' }
  for (const mealType of ['breakfast', 'lunch', 'dinner']) {
    clock.set(`2026-10-22T${times[mealType]}:00+08:00`)
    const res = await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
    assert.equal(res.ok, true, res.message)
    beans.push(res.data.gain.beans)
    ids.push(res.data._id)
  }
  assert.deepEqual(beans, [20, 20, 35])
```

  后面的 `60` 全部换成 `75`；`assert.deepEqual(forest.data.stats, { days: 1, beans: 60 })` 换成 `assert.deepEqual(forest.data.stats, { days: 1, beans: 75, onTime: 3 })`；
  stamps 那行后面加 `assert.deepEqual(day.data.daily.stamps.map((s) => s.onTime), [true, true, true])`。
- `暖暖营地：…` 那个测试改成 `async (t) => {`，开头 `fixDate(t, '2026-10-22T12:10:00+08:00')`；
  `assert.equal(after.data.beans, 40) // …` 换成 `assert.equal(after.data.beans, 50) // 30 + 午饭准时 15 + 绿 5`；
  `assert.equal(buy.data.beans, 0) // 40 − 滚球 40` 换成 `assert.equal(buy.data.beans, 10) // 50 − 滚球 40`。

`test/pages.test.js`：

- 顶部加 `const { fixDate } = require('./helpers/fixed-date')`。
- `完整使用流程：…` 改成 `async (t) => {`，第一行 `fixDate(t, '2026-10-22T12:10:00+08:00')`。
- 详情页那段：`assert.equal(meal.data.gain.title, '+10 暖豆')` 改成 `'+20 暖豆'`（午饭准时 15 + 绿 5；Task 5 会再改标题格式）。
- 今日页那段：`'今天得了 10 暖豆'` 改成 `'今天得了 20 暖豆'`；`'再打卡晚餐还能得 10 暖豆'` 改成 `'下一顿晚饭 17:00～19:00 拍算准时'`。
- 打卡日历那段（午饭删了，只剩 12:10 拍的晚饭：算早 5 + 绿 5）：`'今天得了 10 暖豆'`、`'+10'`、`得了 10 暖豆` 都不用改。

- [ ] **Step 7: 跑全量测试**

Run: `npm test`
Expected: PASS（`test/services-camp.test.js` 用的是存好的 `earned`、没注入 `forest`，不受影响）。

- [ ] **Step 8: 提交**

```bash
node --check cloudfunctions/api/services/forest.js && node --check cloudfunctions/api/services/meal.js
git add cloudfunctions/api miniprogram/utils/shared test
git commit -m "feat(beans): on-time stamps and beans — 15 on time, 5 otherwise, +15 for all three, +5 green"
```

---

### Task 4: 小暖的点评带上准时

**Files:**
- Modify: `cloudfunctions/api/lib/prompts.js`
- Test: `test/prompts.test.js`、`test/services-meal.test.js`

**Interfaces:**
- Consumes: `buildMealMessages` 现在会收到 `timing`、`at`（Date）、`times`（Task 3 已经传了）
- Produces: 用户消息里多一行 `【拍照时间】12:10，准时（午餐饭点 12:00）` / `…，不在饭点（…）` / 加餐只有 `【拍照时间】12:10`；没传 `at` 就没有这一行

- [ ] **Step 1: 写失败的测试**

`test/prompts.test.js` 末尾加：

```js
test('打卡消息：带上拍照时间和准不准时', () => {
  const at = new Date('2026-10-22T04:10:00Z')
  const times = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  const build = (mealType, timing) => buildMealMessages({ profile, mealType, note: '', imageUrl: null, consumedKcal: 0, timing, at, times })
  assert.match(build('lunch', 'on')[1].content, /【拍照时间】12:10，准时（午餐饭点 12:00）/)
  assert.match(build('breakfast', 'late')[1].content, /【拍照时间】12:10，不在饭点（早餐饭点 07:30）/)
  assert.match(build('snack', null)[1].content, /【拍照时间】12:10\n/)
  assert.match(build('lunch', 'on')[0].content, /准时/)
  const none = buildMealMessages({ profile, mealType: 'lunch', note: 'x', imageUrl: null, consumedKcal: 0 })
  assert.doesNotMatch(none[1].content, /拍照时间/)
})
```

`test/services-meal.test.js` 的第一个测试末尾加：

```js
  assert.match(lastUserText(chat.calls[0].messages), /【拍照时间】12:00，准时（午餐饭点 12:00）/)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/prompts.test.js test/services-meal.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

`cloudfunctions/api/lib/prompts.js`：

1. 顶部加 `const { timeText } = require('./shared/date')`。
2. `MEAL_SYSTEM` 里「估算方法」那段的最后一条后面加一条：

```
- 【拍照时间】写着「准时」的，顺口夸一句按时吃饭；写着「不在饭点」的，温和提醒下顿按时吃、吃之前先拍，不要批评。
```

3. `budgetText` 后面加：

```js
// 什么时候拍的、算不算准时（饭点规则在 shared/timing.js）
function timingText(mealType, timing, at, times) {
  if (!at) return ''
  const clock = timeText(at.getTime())
  if (!timing || !times) return `【拍照时间】${clock}`
  const status = timing === 'on' ? '准时' : '不在饭点'
  return `【拍照时间】${clock}，${status}（${MEAL_LABELS[mealType]}饭点 ${times[mealType]}）`
}
```

4. `buildMealMessages` 的参数加上 `timing, at, times`，`lines` 改成：

```js
function buildMealMessages({ profile, mealType, note, imageUrl, consumedKcal, timing, at, times }) {
  const lines = [
    profileText(profile),
    budgetText(profile.dailyKcal, consumedKcal),
    `【本餐】${MEAL_LABELS[mealType] || '加餐'}`,
    timingText(mealType, timing, at, times),
    `【用户备注】${note || '无'}`,
    imageUrl
      ? '请看图片估算这一餐。'
      : '用户这次没有拍照，请根据上面的文字描述估算，并在点评里说明是按描述估算的。',
  ].filter(Boolean)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/prompts.test.js test/services-meal.test.js`，再 `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api/lib/prompts.js test/prompts.test.js test/services-meal.test.js
git commit -m "feat(coach): comments know whether the meal was shot on time"
```

---

### Task 5: 印章金边、暖豆横幅、日历准时统计（小程序展示）

**Files:**
- Modify: `miniprogram/utils/view.js`
- Modify: `miniprogram/app.wxss`、`miniprogram/pages/camp/camp.wxss`
- Modify: `miniprogram/pages/meal/meal.wxml`、`meal.wxss`
- Modify: `miniprogram/pages/forest/forest.wxml`
- Test: `test/view.test.js`、`test/pages.test.js`

**Interfaces:**
- Consumes: `gain` / `daily` / 日历 `days` 的新字段（Task 3）；`MEAL_WORDS`（Task 1）、`BEANS`（Task 3）
- Produces:
  - `stampsView(stamps)`：准时的 `cls` 多一个 ` stamp-on`
  - `decorateGain(gain) -> { title, bonus, hint, stamps }`：准时 `'午饭准时打卡 +20 暖豆'`，不准时 `'+10 暖豆'`，没多得 `'这顿记下啦'`；`bonus` 是 `'三顿都准时，再加 15！'` 或 `''`
  - `beansCard(daily)` 多 `onTimeText`（`'本月准时 4 顿'` 或 `''`）
  - `nextMealCard(status) -> { state, title, sub, button, mealType, small, warn }`（Task 6 用）

- [ ] **Step 1: 写失败的测试**

`test/view.test.js`：

- 引入那行改成 `const { stampsView, decorateGain, beansCard, buildCalendarCells, nextMealCard } = require('../miniprogram/utils/view')`。
- `STAMPS` 换成：

```js
const STAMPS = [
  { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
  { mealType: 'lunch', label: '午', state: 'done', onTime: false },
  { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
]
```

- `stampsView：印章的样式` 的期望改成第一条 `cls: 'stamp-green stamp-on'`，其余不变；`buildCalendarCells` 那个测试也用 `STAMPS`，`cells[3].stamps[0].cls` 同样改成 `'stamp-green stamp-on'`。
- `decorateGain` 那个测试换成：

```js
test('decorateGain：准时的写清楚是哪顿准时，三顿都准时额外庆祝', () => {
  const gain = decorateGain({ beans: 20, beansToday: 20, hint: '下一顿晚饭 17:00～19:00 拍算准时', stamps: STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false })
  assert.equal(gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(gain.bonus, '')
  assert.equal(gain.hint, '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(gain.stamps.length, 3)
  assert.equal(decorateGain({ beans: 35, stamps: STAMPS, mealType: 'dinner', timing: 'on', allOnTime: true }).bonus, '三顿都准时，再加 15！')
  assert.equal(decorateGain({ beans: 10, stamps: STAMPS, mealType: 'dinner', timing: 'late', allOnTime: false }).title, '+10 暖豆')
  assert.equal(decorateGain({ beans: 0, beansToday: 20, hint: 'x', stamps: STAMPS }).title, '这顿记下啦')
  assert.equal(decorateGain({ beans: -10, beansToday: 10, hint: 'x', stamps: STAMPS }).title, '这顿记下啦')
  assert.equal(decorateGain(null), null)
})
```

- `beansCard` 那个测试：第一个 `beansCard({...})` 的入参加 `monthOnTime: 4`，加断言 `assert.equal(card.onTimeText, '本月准时 4 顿')`；`empty` 的入参加 `monthOnTime: 0`，加 `assert.equal(empty.onTimeText, '')`。
- 末尾加：

```js
test('nextMealCard：首页下一顿大卡', () => {
  const base = { mealType: 'lunch', word: '午饭', time: '12:00', window: '11:00～13:00' }
  assert.deepEqual(nextMealCard({ state: 'upcoming', ...base }), {
    state: 'upcoming', title: '午饭 · 12:00', sub: '11:00～13:00 拍算准时', button: '📷 拍午饭', mealType: 'lunch', small: false, warn: false,
  })
  assert.equal(nextMealCard({ state: 'open', ...base, minutesLeft: 40 }).sub, '11:00～13:00 拍算准时，还剩 40 分钟')
  assert.equal(nextMealCard({ state: 'open', ...base, minutesLeft: 100 }).sub, '11:00～13:00 拍算准时，还剩 1 小时 40 分')
  assert.equal(nextMealCard({ state: 'open', ...base, minutesLeft: 60 }).sub, '11:00～13:00 拍算准时，还剩 1 小时')
  assert.deepEqual(nextMealCard({ state: 'missed', ...base }), {
    state: 'missed', title: '午饭还没拍', sub: '现在补拍也算数', button: '📷 补拍午饭', mealType: 'lunch', small: false, warn: true,
  })
  assert.deepEqual(nextMealCard({ state: 'done', ...base, onTime: true, next: { mealType: 'dinner', word: '晚饭', time: '18:00' } }), {
    state: 'done', title: '午饭准时拍了 ✓', sub: '下一顿：晚饭 18:00', button: '拍加餐', mealType: 'snack', small: true, warn: false,
  })
  assert.equal(nextMealCard({ state: 'done', ...base, onTime: false, next: null }).title, '午饭拍了 ✓')
  assert.equal(nextMealCard({ state: 'done', ...base, onTime: false, next: null }).sub, '')
  assert.deepEqual(nextMealCard({ state: 'allDone', allOnTime: true }), {
    state: 'allDone', title: '今天三顿都准时拍了 ✓', sub: '', button: '加餐也可以拍', mealType: 'snack', small: true, warn: false,
  })
  assert.equal(nextMealCard({ state: 'allDone', allOnTime: false }).title, '今天三顿都拍完啦 ✓')
  assert.equal(nextMealCard(null), null)
})
```

`test/pages.test.js` 完整流程里详情页那段：`'+20 暖豆'` 改成 `'午饭准时打卡 +20 暖豆'`，`'stamp-green'` 改成 `'stamp-green stamp-on'`，后面加 `assert.equal(meal.data.gain.bonus, '')`；
打卡日历那段在 `todayCell.stamps` 断言后加 `assert.match(readWxml('forest'), /准时 \{\{view.stats.onTime\}\} 顿/)`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/view.test.js test/pages.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

`miniprogram/utils/view.js`：

1. 顶部 require 后面加：

```js
const { MEAL_WORDS } = require('./shared/timing')
const { BEANS } = require('./shared/forest')
```

2. `stampsView`、`decorateGain`、`beansCard` 换成：

```js
// 早 / 午 / 晚三个印章：cls 对应 app.wxss 里的颜色，准时拍的再加金边 stamp-on
function stampsView(stamps) {
  return (stamps || []).map((s) => ({ key: s.mealType, label: s.label, cls: `stamp-${s.state}${s.onTime ? ' stamp-on' : ''}` }))
}

// 打卡结果页：这次打卡多得了多少暖豆，准时的写清楚是哪顿准时
function decorateGain(gain) {
  if (!gain) return null
  let title = '这顿记下啦'
  if (gain.beans > 0) title = gain.timing === 'on' ? `${MEAL_WORDS[gain.mealType]}准时打卡 +${gain.beans} 暖豆` : `+${gain.beans} 暖豆`
  return {
    title,
    bonus: gain.allOnTime ? `三顿都准时，再加 ${BEANS.allOnTime}！` : '',
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
    onTimeText: daily.monthOnTime > 0 ? `本月准时 ${daily.monthOnTime} 顿` : '',
  }
}

// 「40 分钟」「1 小时 40 分」「1 小时」
function leftText(minutes) {
  if (minutes < 60) return `${minutes} 分钟`
  const m = minutes % 60
  return `${Math.floor(minutes / 60)} 小时${m ? ` ${m} 分` : ''}`
}

// 首页「下一顿」大卡：shared/timing.js 的 mealStatus → 页面字段。mealType 是按钮带去打卡页的餐次，small 是只给一个小链接
function nextMealCard(s) {
  if (!s) return null
  if (s.state === 'allDone') {
    return { state: 'allDone', title: s.allOnTime ? '今天三顿都准时拍了 ✓' : '今天三顿都拍完啦 ✓', sub: '', button: '加餐也可以拍', mealType: 'snack', small: true, warn: false }
  }
  const card = { state: s.state, title: `${s.word} · ${s.time}`, sub: `${s.window} 拍算准时`, button: `📷 拍${s.word}`, mealType: s.mealType, small: false, warn: false }
  if (s.state === 'open') card.sub = `${s.window} 拍算准时，还剩 ${leftText(s.minutesLeft)}`
  if (s.state === 'missed') Object.assign(card, { title: `${s.word}还没拍`, sub: '现在补拍也算数', button: `📷 补拍${s.word}`, warn: true })
  if (s.state === 'done') {
    Object.assign(card, {
      title: s.onTime ? `${s.word}准时拍了 ✓` : `${s.word}拍了 ✓`,
      sub: s.next ? `下一顿：${s.next.word} ${s.next.time}` : '',
      button: '拍加餐',
      mealType: 'snack',
      small: true,
    })
  }
  return card
}
```

3. `module.exports` 里加 `nextMealCard,`。

`miniprogram/app.wxss`：在 `.stamp-none { … }` 后面加：

```css
/* 准时拍的那顿：金边 + 角上一个「准」 */
.stamp-on {
  position: relative;
  box-shadow: 0 0 0 5rpx #f0b429;
}

.stamp-on::after {
  content: '准';
  position: absolute;
  right: -16rpx;
  top: -16rpx;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: #f0b429;
  color: #fff;
  font-size: 20rpx;
  line-height: 30rpx;
  text-align: center;
}
```

在 `.stamps-small .stamp { … }` 后面加：

```css
.stamps-small .stamp-on {
  box-shadow: 0 0 0 3rpx #f0b429;
}

.stamps-small .stamp-on::after {
  display: none;
}
```

`miniprogram/pages/camp/camp.wxss`：在 `.stamps-mini .stamp { … }` 后面加：

```css
.stamps-mini .stamp-on {
  box-shadow: 0 0 0 4rpx #f0b429;
}

.stamps-mini .stamp-on::after {
  display: none;
}
```

`miniprogram/pages/meal/meal.wxml`：`<view class="gain-title">{{gain.title}}</view>` 后面加一行：

```xml
      <view wx:if="{{gain.bonus}}" class="gain-bonus">{{gain.bonus}}</view>
```

`miniprogram/pages/meal/meal.wxss`：`.gain-hint { … }` 后面加：

```css
.gain-bonus {
  font-size: 30rpx;
  font-weight: 700;
  color: #c98a12;
}
```

`miniprogram/pages/forest/forest.wxml`：

- `<text wx:if="{{daily.streakText}}" …>` 那行后面加 `<text wx:if="{{daily.onTimeText}}" class="today-stat">⏰ {{daily.onTimeText}}</text>`
- 最后的 `month-stats` 换成 `<view class="month-stats">这个月打卡 {{view.stats.days}} 天，准时 {{view.stats.onTime}} 顿，得了 {{view.stats.beans}} 暖豆</view>`

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/view.test.js test/pages.test.js`，再 `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/utils/view.js
git add miniprogram/utils/view.js miniprogram/app.wxss miniprogram/pages/camp/camp.wxss miniprogram/pages/meal miniprogram/pages/forest test/view.test.js test/pages.test.js
git commit -m "feat(stamps): gold on-time stamps, on-time banner, monthly on-time count"
```

---

### Task 6: 首页换成「今日」，顶上下一顿大卡

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/today/today.js`、`today.wxml`、`today.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: `mealTimesOf`、`mealStatus`（Task 1）、`beansHint`（Task 3）、`nextMealCard`、`beansCard`（Task 5）
- Produces: 今日页 `data.card`（`nextMealCard` 的结果）；`goCheckin` 带 `data-meal-type` 去 `/pages/checkin/checkin?mealType=lunch`；
  `getApp().globalData.mealTimes`（打卡页用，Task 7）；每 60 秒按当前时间重算大卡和提示，定时器走 `this.clock`（测试注入 `manualClock()`），`onHide` / `onUnload` 清掉

- [ ] **Step 1: 写失败的测试**

`test/pages.test.js`：

- `app.json 里的页面文件和 tabBar 图标都存在` 末尾加：

```js
  assert.equal(app.pages[0], 'pages/today/today')
  assert.deepEqual(app.tabBar.list.map((t) => t.text), ['今日', '营地', '体重', '我的'])
```

- 完整流程里 `const today = loadPage('today', wx)` 下一行加 `today.clock = manualClock()`；今日页展示那段（`today.onShow()` 之后）加：

```js
  assert.equal(today.data.card.title, '午饭准时拍了 ✓')
  assert.equal(today.data.card.sub, '下一顿：晚饭 18:00')
  assert.equal(wx.app.globalData.mealTimes.lunch, '12:00')
```

- 在 `云函数报错时页面给出提示…` 测试之前加一个新测试：

```js
test('今日页：下一顿大卡跟着时间走，按钮带着餐次去打卡', async (t) => {
  const clock = fixDate(t, '2026-10-22T11:20:00+08:00')
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.card.title, '午饭 · 12:00')
  assert.equal(today.data.card.sub, '11:00～13:00 拍算准时，还剩 1 小时 40 分')
  assert.equal(today.data.daily.hint, '午饭 11:00～13:00 拍算准时，能得 15 暖豆')
  today.goCheckin(event({ mealType: 'lunch' }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin?mealType=lunch'])

  // 过了午饭点：一分钟后自己刷新成「还没拍」
  clock.set('2026-10-22T13:30:00+08:00')
  today.clock.advance(60000)
  assert.equal(today.data.card.title, '午饭还没拍')
  assert.equal(today.data.card.warn, true)
  assert.equal(today.data.daily.hint, '午饭过点了，现在补拍也有 5 暖豆')

  today.onHide()
  assert.equal(today.clock.count(), 0)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pages.test.js`
Expected: FAIL（`pages[0]` 是 camp、`today.data.card` 不存在）

- [ ] **Step 3: 实现**

`miniprogram/app.json`：`pages` 数组把 `"pages/today/today"` 挪到第一个、`"pages/camp/camp"` 第二个；`tabBar.list` 改成今日、营地、体重、我的的顺序（四项内容不变，只换顺序）。

`miniprogram/pages/today/today.js` 换成：

```js
const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard, nextMealCard } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')
const { mealTimesOf, mealStatus } = require('../../utils/shared/timing')
const { beansHint } = require('../../utils/shared/forest')

// 下一顿大卡和提示跟着时间走（倒计时、过点），每分钟按现在的时间重算一次
const REFRESH_MS = 60000

Page({
  data: {
    loading: true,
    view: null,
    daily: null,
    card: null,
    greeting: '',
    summarizing: false,
  },

  onShow() {
    this.load()
  },

  onHide() {
    this.stopRefresh()
  },

  onUnload() {
    this.stopRefresh()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('day.get')
      .then((day) => {
        // 第一次使用先去建档
        if (!day.profile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.day = day
        this.times = mealTimesOf(day.profile)
        getApp().globalData.mealTimes = this.times
        this.setData({
          loading: false,
          view: buildDayView(day),
          greeting: greetingText(localHour(), day.profile.nickname),
        })
        this.refresh()
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  refresh() {
    const now = new Date()
    const meals = this.day.meals || []
    this.setData({
      card: nextMealCard(mealStatus(meals, this.times, now)),
      daily: beansCard({ ...this.day.daily, hint: beansHint(meals, this.times, now) }),
    })
    this.stopRefresh()
    const clock = this.clock || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
    this.refreshTimer = clock.set(() => this.refresh(), REFRESH_MS)
  },

  stopRefresh() {
    if (!this.refreshTimer) return
    const clock = this.clock || { clear: (h) => clearTimeout(h) }
    clock.clear(this.refreshTimer)
    this.refreshTimer = null
  },

  goGarden() {
    wx.switchTab({ url: '/pages/camp/camp' })
  },

  goCheckin(e) {
    const mealType = e && e.currentTarget.dataset.mealType
    wx.navigateTo({ url: mealType ? `/pages/checkin/checkin?mealType=${mealType}` : '/pages/checkin/checkin' })
  },

  openMeal(e) {
    wx.navigateTo({ url: `/pages/meal/meal?id=${e.currentTarget.dataset.id}` })
  },

  generateSummary() {
    if (this.data.summarizing) return
    this.setData({ summarizing: true })
    api.call('summary.generate')
      .then((summary) => this.setData({ summarizing: false, 'view.summary': summary }))
      .catch((err) => {
        this.setData({ summarizing: false })
        api.showError(err)
      })
  },
})
```

`miniprogram/pages/today/today.wxml`：

1. `<view class="greeting">{{greeting}}</view>` 后面加大卡：

```xml
    <view wx:if="{{card}}" class="card next-card {{card.warn ? 'next-card-warn' : ''}}">
      <view class="next-title">{{card.title}}</view>
      <view wx:if="{{card.sub}}" class="next-sub">{{card.sub}}</view>
      <button wx:if="{{!card.small}}" class="btn-primary btn-big next-btn" data-meal-type="{{card.mealType}}" bindtap="goCheckin">{{card.button}}</button>
      <view wx:else class="next-link" data-meal-type="{{card.mealType}}" bindtap="goCheckin">{{card.button}} ›</view>
    </view>
```

2. 暖豆卡片里 `<view wx:if="{{daily.streakText}}" class="beans-card-streak">{{daily.streakText}}</view>` 后面加 `<view wx:if="{{daily.onTimeText}}" class="beans-card-streak">⏰ {{daily.onTimeText}}</view>`。
3. 删掉 `<button class="btn-primary btn-big" bindtap="goCheckin">📷 拍一拍这一餐</button>` 这一行（并进大卡了）。

`miniprogram/pages/today/today.wxss` 末尾加：

```css
/* 首页「下一顿」大卡 */
.next-card {
  padding: 32rpx 28rpx;
  background: linear-gradient(135deg, #eaf5ec 0%, #ffffff 85%);
}

.next-card-warn {
  background: linear-gradient(135deg, #fff1e0 0%, #ffffff 85%);
}

.next-title {
  font-size: 48rpx;
  font-weight: 700;
}

.next-card-warn .next-title {
  color: #d9822b;
}

.next-sub {
  font-size: 32rpx;
  margin-top: 8rpx;
  color: var(--muted);
}

.next-btn {
  margin-top: 24rpx;
}

.next-link {
  margin-top: 16rpx;
  font-size: 30rpx;
  color: var(--primary);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/pages.test.js`，再 `npm test`
Expected: PASS（测试结束时进程能正常退出：所有 `today` 都注入了 `manualClock()`）

- [ ] **Step 5: 提交**

```bash
node --check miniprogram/pages/today/today.js
git add miniprogram/app.json miniprogram/pages/today test/pages.test.js
git commit -m "feat(today): home page first — next-meal card that follows the clock"
```

---

### Task 7: 打卡页按餐次预选、说清楚准不准时；我的页设三餐时间

**Files:**
- Modify: `miniprogram/pages/checkin/checkin.js`、`checkin.wxml`、`checkin.wxss`
- Modify: `miniprogram/pages/profile/profile.js`、`profile.wxml`、`profile.wxss`
- Test: `test/pages.test.js`

**Interfaces:**
- Consumes: `mealTimesOf`、`mealAt`、`timingFor`、`windowText`、`MEAL_WORDS`、`MAIN_MEALS`、`DEFAULT_MEAL_TIMES`、`timeOptions`（Task 1）；`getApp().globalData.mealTimes`（Task 6）；`profile.save` 接受 `mealTimes`（Task 2）
- Produces: 打卡页 `onLoad({ mealType })` 预选；`data.timingText` / `data.timingOn`；我的页 `data.form.mealTimes`、`data.mealRows`、`onMealTime`

- [ ] **Step 1: 写失败的测试**

`test/pages.test.js`：

- 完整流程第 3 步（打卡）`checkin.pickMealType(event({ value: 'lunch' }))` 后面加：

```js
  assert.equal(checkin.data.timingText, '现在拍午饭：准时 ✓')
  assert.equal(checkin.data.timingOn, true)
```

  第 7 步 `checkin2.pickMealType(event({ value: 'dinner' }))` 后面加：

```js
  assert.equal(checkin2.data.timingText, '还没到晚饭时间（17:00～19:00），提前拍也算数')
```

- 第 2 步建档的 `profile.save()` 前面加：

```js
  assert.deepEqual(profile.data.form.mealTimes, { breakfast: '07:30', lunch: '12:00', dinner: '18:00' })
  profile.onMealTime(event({ mealType: 'breakfast' }, { value: profile.data.mealRows[0].options.indexOf('07:00') }))
  assert.equal(profile.data.form.mealTimes.breakfast, '07:00')
  assert.equal(profile.data.mealRows[0].value, '07:00')
```

  并在 `assert.ok(wx.log.toasts.includes('保存好了'))` 后面加：

```js
  assert.equal(wx.app.globalData.mealTimes.breakfast, '07:00')
```

- `打卡页：没拍照也没写字时不提交` 后面加：

```js
test('打卡页：从首页带着餐次进来就选好；不在任何饭点时按钟点猜', (t) => {
  fixDate(t, '2026-10-22T15:00:00+08:00')
  const wx = createWx(async () => ({ ok: true, data: null }))
  const fromCard = loadPage('checkin', wx)
  fromCard.onLoad({ mealType: 'lunch' })
  assert.equal(fromCard.data.mealType, 'lunch')
  assert.equal(fromCard.data.timingText, '现在不在午饭时间，补拍也算数')
  const plain = loadPage('checkin', wx)
  plain.onLoad({})
  assert.equal(plain.data.mealType, 'snack')
  assert.equal(plain.data.timingText, '')
  const bad = loadPage('checkin', wx)
  bad.onLoad({ mealType: 'supper' })
  assert.equal(bad.data.mealType, 'snack')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/pages.test.js`
Expected: FAIL

- [ ] **Step 3: 实现打卡页**

`miniprogram/pages/checkin/checkin.js`：

1. require 换成：

```js
const api = require('../../utils/api')
const { MEAL_ORDER, MEAL_LABELS, guessMealType, isMealType } = require('../../utils/shared/meal-types')
const { localHour } = require('../../utils/shared/date')
const { MEAL_WORDS, mealTimesOf, mealAt, timingFor, windowText } = require('../../utils/shared/timing')
```

2. `data` 里加 `timingText: ''`、`timingOn: false`。
3. `onLoad` 和 `pickMealType` 换成：

```js
  // 首页大卡带着餐次进来就用它；不然按饭点窗口猜，都不在窗口里按钟点猜
  onLoad(options) {
    this.times = getApp().globalData.mealTimes || mealTimesOf(null)
    const want = options && options.mealType
    const mealType = isMealType(want) ? want : mealAt(this.times, new Date()) || guessMealType(localHour())
    this.setData({ mealType })
    this.updateTiming()
  },

  pickMealType(e) {
    this.setData({ mealType: e.currentTarget.dataset.value })
    this.updateTiming()
  },

  // 餐次下面那句：现在拍这顿算不算准时（加餐不说）
  updateTiming() {
    const { mealType } = this.data
    const timing = timingFor(mealType, new Date(), this.times)
    const word = MEAL_WORDS[mealType]
    let text = ''
    if (timing === 'on') text = `现在拍${word}：准时 ✓`
    else if (timing === 'early') text = `还没到${word}时间（${windowText(mealType, this.times)}），提前拍也算数`
    else if (timing === 'late') text = `现在不在${word}时间，补拍也算数`
    this.setData({ timingText: text, timingOn: timing === 'on' })
  },
```

`miniprogram/pages/checkin/checkin.wxml`：餐次 `chips` 那个 `</view>` 后面加：

```xml
  <view wx:if="{{timingText}}" class="timing {{timingOn ? 'timing-on' : ''}}">{{timingText}}</view>
```

`miniprogram/pages/checkin/checkin.wxss` 末尾加：

```css
.timing {
  font-size: 30rpx;
  margin: 12rpx 8rpx 0;
  color: #d9822b;
}

.timing-on {
  color: var(--primary);
  font-weight: 700;
}
```

- [ ] **Step 4: 实现我的页**

`miniprogram/pages/profile/profile.js`：

1. require 后面加：

```js
const { MAIN_MEALS, MEAL_WORDS, DEFAULT_MEAL_TIMES, timeOptions, mealTimesOf } = require('../../utils/shared/timing')
```

2. `EMPTY_FORM` 末尾加 `mealTimes: { ...DEFAULT_MEAL_TIMES }`（写成 `const EMPTY_FORM = { nickname: '', …, avoid: '', mealTimes: { ...DEFAULT_MEAL_TIMES } }`）。
3. `pickForm` 的 `return form` 前面加 `form.mealTimes = mealTimesOf(profile)`。
4. 在 `previewKcal` 函数后面加：

```js
// 三餐时间的三行：每行的选项和当前选中的是第几个（picker 要下标）
function mealRows(form) {
  return MAIN_MEALS.map((t) => {
    const options = timeOptions(t)
    const value = form.mealTimes[t]
    return { mealType: t, word: MEAL_WORDS[t], options, value, index: Math.max(0, options.indexOf(value)) }
  })
}
```

5. `data` 里加 `mealRows: mealRows(EMPTY_FORM),`。
6. `onShow` 的 `this.setData({ loading: false, isNew: !profile, form, previewKcal: previewKcal(form) })` 改成 `this.setData({ loading: false, isNew: !profile, form, previewKcal: previewKcal(form), mealRows: mealRows(form) })`。
7. `update` 的 `this.setData({ form, previewKcal: previewKcal(form) })` 改成 `this.setData({ form, previewKcal: previewKcal(form), mealRows: mealRows(form) })`。
8. `onPick` 后面加：

```js
  onMealTime(e) {
    const { mealType } = e.currentTarget.dataset
    const options = timeOptions(mealType)
    const value = options[Number(e.detail.value)]
    if (!value) return
    this.update('mealTimes', { ...this.data.form.mealTimes, [mealType]: value })
  },
```

9. `save` 成功回调里 `const form = pickForm(profile)` 后面加 `getApp().globalData.mealTimes = mealTimesOf(profile)`，`this.setData({ saving: false, isNew: false, form, previewKcal: profile.dailyKcal })` 改成 `this.setData({ saving: false, isNew: false, form, previewKcal: profile.dailyKcal, mealRows: mealRows(form) })`。

`miniprogram/pages/profile/profile.wxml`：在「忌口 / 饮食习惯」那个 `field field-last` 前面加：

```xml
    <view class="field">
      <view class="field-label">三餐时间（前后 1 小时内拍算准时）</view>
      <view wx:for="{{mealRows}}" wx:key="mealType" class="meal-time-row">
        <text class="meal-time-word">{{item.word}}</text>
        <picker mode="selector" range="{{item.options}}" value="{{item.index}}" data-meal-type="{{item.mealType}}" bindchange="onMealTime">
          <view class="meal-time-value">{{item.value}} ›</view>
        </picker>
      </view>
    </view>
```

`miniprogram/pages/profile/profile.wxss` 末尾加：

```css
.meal-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.meal-time-word {
  font-size: 32rpx;
}

.meal-time-value {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--primary);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test test/pages.test.js`，再 `npm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
node --check miniprogram/pages/checkin/checkin.js && node --check miniprogram/pages/profile/profile.js
git add miniprogram/pages/checkin miniprogram/pages/profile test/pages.test.js
git commit -m "feat(checkin): preselect the meal from the home card, say whether it's on time; meal times in 我的"
```

---

### Task 8: 文档、部署、预览

**Files:**
- Modify: `README.md`（「每天打卡 → 暖豆」一节、tab 那行、shared 说明）
- Modify: `CLAUDE.md`（当前状态加一条）

- [ ] **Step 1: README**

- 「每天打卡 → 暖豆」那张表换成：

```markdown
| 今天的正餐 | 暖豆 |
|---|---|
| 每顿准时拍（饭点前后 1 小时内） | +15 |
| 每顿不在饭点拍（补拍也算） | +5 |
| 三顿都准时 | 另加 +15 |
| 每顿评级「吃得好」（绿） | +5 |
| 一天最多 | 75 |
```

- 印章那条改成：「早 / 午 / 晚三个印章：绿色吃得好、黄色一般、红色要注意、灰色打了卡但没分析出来、虚线没打卡；准时拍的那顿金边带个『准』字」。
- 加一条：「饭点在『我的』里设（默认 7:30 / 12:00 / 18:00，半小时一档）；首页是『今日』，顶上一张大卡告诉你下一顿是什么、几点前拍算准时」。
- 目录说明那行 `pages/camp|today|weight|profile  四个 tab：营地（首页）、今日、体重、我的` 改成 `pages/today|camp|weight|profile  四个 tab：今日（首页）、营地、体重、我的`；`utils/shared/` 那行补上「饭点和准时 timing.js」。

- [ ] **Step 2: CLAUDE.md 当前状态加一条**

在 `- 2026-10-25（五）：` 那条前面加：

```markdown
- 2026-10-25（六）：**准时打卡第一块上线**（计划 `plans/2026-10-25-on-time-part1.md`）：`shared/timing.js`（饭点、±1 小时窗口、`timingFor`、`mealStatus`）；档案 `mealTimes`（我的页设，半小时一档）；打卡存 `timing`；暖豆改成准时 15 / 不在饭点 5 / 三顿准时 +15 / 绿 +5（`shared/forest.js` 的 `dayBeans`，`STAGE_BEANS` 删了；日历上以前的日子按当时得的显示）；印章金边带「准」；首页换成今日（tab：今日 · 营地 · 体重 · 我的），顶上「下一顿」大卡每分钟按时间刷新；打卡页按餐次预选、说准不准时；点评带拍照时间；本月准时 N 顿。**下一步**：第二块提醒（等用户的订阅消息模板 ID）或第三块份量
```

- [ ] **Step 3: 全量验证**

Run: `npm test` → 全绿；`git diff --name-only HEAD~7 -- '*.js' | xargs -n1 node --check`（有删除的文件就跳过）

- [ ] **Step 4: 部署和预览**

```bash
npm run wx:function       # 共用文件和 services 改了
npm run wx:preview        # 生成 .wechat/preview-qrcode.jpg
```

用 SendUserFile 把 `.wechat/preview-qrcode.jpg` 发给用户，请用户扫码看：首页大卡、三餐时间设置、拍一顿后的金色印章和「准时打卡 +N 暖豆」。

- [ ] **Step 5: 提交推送**

```bash
git add README.md CLAUDE.md
git commit -m "docs: on-time check-in part one"
git push -u origin claude/mini-program-dev-nzn2n0
```
