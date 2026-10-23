const test = require('node:test')
const assert = require('node:assert/strict')
const {
  STAGES,
  dayTree,
  mealStamps,
  beansHint,
  streakFrom,
} = require('../cloudfunctions/api/lib/shared/forest')

let seq = 0
function meal(mealType, rating = 'yellow', overrides = {}) {
  seq += 1
  return {
    mealType,
    status: 'done',
    createdAt: seq,
    analysis: { rating, isFood: true, totalKcal: 300 },
    ...overrides,
  }
}

test('阶段常量', () => {
  assert.deepEqual(STAGES, ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit'])
})

test('dayTree：按正餐数量长大', () => {
  assert.equal(dayTree([]).stage, 'empty')
  assert.equal(dayTree(undefined).stage, 'empty')
  assert.equal(dayTree([meal('breakfast')]).stage, 'sprout')
  assert.equal(dayTree([meal('breakfast'), meal('lunch')]).stage, 'small')
  assert.equal(dayTree([meal('breakfast'), meal('lunch'), meal('dinner')]).stage, 'big')
})

test('dayTree：三顿都打卡后看绿色评级', () => {
  const three = (r1, r2, r3) => dayTree([meal('breakfast', r1), meal('lunch', r2), meal('dinner', r3)])
  assert.equal(three('green', 'yellow', 'red').stage, 'big')
  assert.equal(three('green', 'green', 'red').stage, 'bloom')
  assert.equal(three('green', 'green', 'green').stage, 'fruit')
  assert.equal(three('green', 'green', 'green').greens, 3)
})

test('dayTree：加餐不计入', () => {
  const tree = dayTree([meal('snack', 'green'), meal('snack', 'green')])
  assert.equal(tree.stage, 'empty')
  assert.equal(dayTree([meal('breakfast', 'green'), meal('snack', 'red')]).stage, 'sprout')
})

test('dayTree：同一餐次取最新的一条', () => {
  const meals = [
    meal('breakfast', 'green'), meal('lunch', 'green'), meal('dinner', 'red', { createdAt: 100 }),
    meal('dinner', 'green', { createdAt: 200 }),
  ]
  assert.equal(dayTree(meals).stage, 'fruit')
  assert.equal(dayTree(meals.slice().reverse()).stage, 'fruit')
})

test('dayTree：分析失败的打卡也算打卡，但没有评级', () => {
  const failed = meal('dinner', null, { status: 'failed', analysis: null })
  const tree = dayTree([meal('breakfast', 'green'), meal('lunch', 'green'), failed])
  assert.equal(tree.stage, 'bloom')
  assert.deepEqual(tree.logged, ['breakfast', 'lunch', 'dinner'])
})

test('dayTree：返回已打和没打的正餐', () => {
  const tree = dayTree([meal('lunch')])
  assert.deepEqual(tree.logged, ['lunch'])
  assert.deepEqual(tree.missing, ['breakfast', 'dinner'])
})

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

test('streakFrom：今天有树时从今天往前数', () => {
  const days = { '2026-10-20': 'apple', '2026-10-21': 'apple', '2026-10-22': 'apple' }
  assert.equal(streakFrom(days, '2026-10-22'), 3)
})

test('streakFrom：今天还没打卡时算到昨天', () => {
  const days = { '2026-10-20': 'apple', '2026-10-21': 'apple' }
  assert.equal(streakFrom(days, '2026-10-22'), 2)
})

test('streakFrom：中间断档、跨月、没有记录', () => {
  assert.equal(streakFrom({ '2026-10-18': 'apple', '2026-10-20': 'apple', '2026-10-21': 'apple' }, '2026-10-21'), 2)
  assert.equal(streakFrom({ '2026-09-30': 'apple', '2026-10-01': 'apple' }, '2026-10-01'), 2)
  assert.equal(streakFrom({ '2026-10-19': 'apple' }, '2026-10-22'), 0)
  assert.equal(streakFrom({}, '2026-10-22'), 0)
  assert.equal(streakFrom(undefined, '2026-10-22'), 0)
})
