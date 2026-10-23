const test = require('node:test')
const assert = require('node:assert/strict')
const { decorateMeal, buildDayView, greetingText } = require('../miniprogram/utils/view')

const done = (overrides = {}) => ({
  _id: 'm1',
  mealType: 'lunch',
  status: 'done',
  mode: 'vision',
  createdAt: Date.UTC(2026, 9, 22, 4, 30),
  analysis: {
    isFood: true,
    foods: [{ name: '米饭', kcal: 230 }, { name: '青菜', kcal: 80 }],
    totalKcal: 520,
    rating: 'green',
    comment: '搭配不错',
  },
  ...overrides,
})

test('decorateMeal：成功的打卡', () => {
  const m = decorateMeal(done())
  assert.equal(m.label, '午餐')
  assert.equal(m.kcalText, '约 520 千卡')
  assert.equal(m.ratingClass, 'green')
  assert.equal(m.ratingText, '吃得好')
  assert.equal(m.commentText, '搭配不错')
  assert.equal(m.timeText, '12:30')
  assert.equal(m.foodsText, '米饭、青菜')
  assert.equal(m._id, 'm1')
})

test('decorateMeal：失败的打卡', () => {
  const m = decorateMeal(done({ status: 'failed', analysis: null, error: '照片没认出来' }))
  assert.equal(m.ratingClass, 'failed')
  assert.equal(m.kcalText, '分析失败')
  assert.equal(m.commentText, '照片没认出来')
  assert.equal(m.foodsText, '')
})

test('decorateMeal：不是食物', () => {
  const m = decorateMeal(done({ analysis: { isFood: false, foods: [], totalKcal: 0, rating: null, comment: '这是一只猫' } }))
  assert.equal(m.ratingClass, 'none')
  assert.equal(m.kcalText, '不计热量')
  assert.equal(m.commentText, '这是一只猫')
})

test('buildDayView：按餐次排序、计算进度', () => {
  const day = {
    date: '2026-10-22',
    profile: { nickname: '妈妈' },
    dailyKcal: 1270,
    totals: { kcal: 700, protein: 25, carbs: 110, fat: 11 },
    meals: [
      done({ _id: 'd', mealType: 'dinner', createdAt: 3 }),
      done({ _id: 's2', mealType: 'snack', createdAt: 5 }),
      done({ _id: 'b', mealType: 'breakfast', createdAt: 1 }),
      done({ _id: 's1', mealType: 'snack', createdAt: 2 }),
    ],
    summary: null,
  }
  const v = buildDayView(day)
  assert.deepEqual(v.meals.map((m) => m._id), ['b', 'd', 's1', 's2'])
  assert.equal(v.dateLabel, '10月22日 周四')
  assert.equal(v.percent, 55)
  assert.equal(v.over, false)
  assert.equal(v.statusText, '还可以吃 570 千卡')
  assert.equal(v.hasProfile, true)
})

test('buildDayView：超出预算', () => {
  const v = buildDayView({ date: '2026-10-22', profile: {}, dailyKcal: 1270, totals: { kcal: 1500 }, meals: [], summary: null })
  assert.equal(v.over, true)
  assert.equal(v.percent, 100)
  assert.match(v.statusText, /超出 230 千卡/)
})

test('buildDayView：还没吃东西', () => {
  const v = buildDayView({ date: '2026-10-22', profile: {}, dailyKcal: 1270, totals: { kcal: 0 }, meals: [], summary: null })
  assert.equal(v.percent, 0)
  assert.equal(v.statusText, '今天的预算是 1270 千卡')
})

test('buildDayView：没有档案时用 1500 兜底', () => {
  const v = buildDayView({ date: '2026-10-22', profile: null, dailyKcal: null, totals: { kcal: 300 }, meals: [], summary: null })
  assert.equal(v.dailyKcal, 1500)
  assert.equal(v.hasProfile, false)
})

test('greetingText 按时段问候', () => {
  assert.equal(greetingText(7, '妈妈'), '早上好，妈妈')
  assert.equal(greetingText(12, '妈妈'), '中午好，妈妈')
  assert.equal(greetingText(15, '妈妈'), '下午好，妈妈')
  assert.equal(greetingText(22, ''), '晚上好')
})

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
