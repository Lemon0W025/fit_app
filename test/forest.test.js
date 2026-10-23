const test = require('node:test')
const assert = require('node:assert/strict')
const {
  STAGES,
  STAGE_LABELS,
  dayTree,
  treeHint,
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
  assert.equal(STAGE_LABELS.bloom, '开花')
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

test('treeHint：每个阶段告诉下一步做什么', () => {
  assert.equal(treeHint(dayTree([])), '打卡一顿正餐，种下今天的树')
  assert.equal(treeHint(dayTree([meal('breakfast')])), '再打卡午餐就能长成小树')
  assert.equal(treeHint(dayTree([meal('breakfast'), meal('lunch')])), '再打卡晚餐就能长成大树')
  assert.match(treeHint(dayTree([meal('breakfast'), meal('lunch'), meal('dinner')])), /开花/)
  assert.match(treeHint(dayTree([meal('breakfast', 'green'), meal('lunch', 'green'), meal('dinner')])), /结果/)
  assert.match(treeHint(dayTree([meal('breakfast', 'green'), meal('lunch', 'green'), meal('dinner', 'green')])), /完美/)
})

test('treeHint：优先提示还没到的下一顿', () => {
  assert.equal(treeHint(dayTree([meal('lunch')])), '再打卡晚餐就能长成小树')
  assert.equal(treeHint(dayTree([meal('dinner')])), '再打卡早餐就能长成小树')
  assert.equal(treeHint(dayTree([meal('breakfast'), meal('dinner')])), '再打卡午餐就能长成大树')
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
