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
