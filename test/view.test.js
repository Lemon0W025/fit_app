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

const { treeImage, decorateTree, treeCard, buildForestCells } = require('../miniprogram/utils/view')

test('treeImage：按阶段取图片', () => {
  assert.equal(treeImage('empty'), '/images/forest/empty.png')
  assert.equal(treeImage('sprout'), '/images/forest/sprout.png')
  assert.equal(treeImage('bloom'), '/images/forest/bloom.png')
  assert.equal(treeImage('fruit'), '/images/forest/fruit.png')
  assert.equal(treeImage('future'), '')
  assert.equal(treeImage(undefined), '')
})

test('decorateTree：长大了用庆祝的标题，并显示暖豆', () => {
  const grew = decorateTree({ before: 'sprout', after: 'small', grew: true, stageLabel: '小树', hint: '再打卡晚餐就能长成大树', beans: 10 })
  assert.equal(grew.title, '🎉 今天的树长成小树了')
  assert.equal(grew.image, '/images/forest/small.png')
  assert.equal(grew.beansText, '+10 暖豆')
  assert.equal(decorateTree({ after: 'sprout', grew: true, stageLabel: '树苗', beans: 10 }).title, '🌱 种下了今天的树苗')
  assert.equal(decorateTree({ after: 'bloom', grew: true, stageLabel: '开花', beans: 10 }).title, '🌸 今天的树开花了')
  assert.equal(decorateTree({ after: 'fruit', grew: true, stageLabel: '结果', beans: 10 }).title, '🍎 今天的树结果了！')
  const same = decorateTree({ after: 'big', grew: false, stageLabel: '大树', beans: 0 })
  assert.equal(same.title, '今天的树：大树')
  assert.equal(same.beansText, '')
  assert.equal(decorateTree({ after: 'bloom', grew: false, stageLabel: '开花', beans: -10 }).beansText, '')
  assert.equal(decorateTree(null), null)
})

test('treeCard：今日页的小树卡片', () => {
  const card = treeCard({ stage: 'small', stageLabel: '小树', hint: '再打卡晚餐就能长成大树', streak: 3, beansToday: 20, nextGain: 20, beans: 85 })
  assert.equal(card.image, '/images/forest/small.png')
  assert.equal(card.title, '今天的树：小树')
  assert.equal(card.streakText, '🔥 已连续 3 天')
  assert.equal(card.beansText, '今天已得 20 暖豆')
  assert.equal(card.hintText, '再打卡晚餐就能长成大树，再得 20 暖豆')
  const empty = treeCard({ stage: 'empty', stageLabel: '空地', hint: '打卡一顿正餐，种下今天的树', streak: 0, beansToday: 0, nextGain: 10, beans: 0 })
  assert.equal(empty.title, '今天还没种树')
  assert.equal(empty.streakText, '')
  assert.equal(empty.beansText, '')
  assert.equal(empty.hintText, '打卡一顿正餐，种下今天的树，再得 10 暖豆')
  assert.equal(treeCard({ stage: 'fruit', stageLabel: '结果', hint: '完美', streak: 1, beansToday: 60, nextGain: 0, beans: 60 }).hintText, '完美')
  assert.equal(treeCard(null), null)
})

test('buildForestCells：周一开头的日历，前面补空格', () => {
  const days = [
    { date: '2026-10-01', day: 1, stage: 'fruit', mealsCount: 3, kcal: 1200 },
    { date: '2026-10-02', day: 2, stage: 'empty', mealsCount: 0, kcal: 0 },
    { date: '2026-10-03', day: 3, stage: 'future', mealsCount: 0, kcal: 0 },
  ]
  // 2026-10-01 是周四（firstWeekday = 4），周一开头前面补 3 个空格
  const cells = buildForestCells(days, 4)
  assert.equal(cells.length, 6)
  assert.deepEqual(cells.slice(0, 3).map((c) => c.blank), [true, true, true])
  assert.equal(cells[3].image, '/images/forest/fruit.png')
  assert.equal(cells[3].day, 1)
  assert.equal(cells[4].image, '/images/forest/empty.png')
  assert.equal(cells[5].future, true)
  assert.equal(cells[5].image, '')
  assert.ok(cells.every((c) => c.key))
  // 周日开头的月份补 6 个
  assert.equal(buildForestCells(days, 0).filter((c) => c.blank).length, 6)
  assert.equal(buildForestCells(days, 1).filter((c) => c.blank).length, 0)
})
