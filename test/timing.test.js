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
