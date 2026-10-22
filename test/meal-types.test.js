const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MEAL_ORDER,
  MEAL_LABELS,
  isMealType,
  guessMealType,
} = require('../cloudfunctions/api/lib/shared/meal-types')

test('餐次顺序与中文名', () => {
  assert.deepEqual(MEAL_ORDER, ['breakfast', 'lunch', 'dinner', 'snack'])
  assert.equal(MEAL_LABELS.breakfast, '早餐')
  assert.equal(MEAL_LABELS.snack, '加餐')
})

test('isMealType', () => {
  assert.equal(isMealType('lunch'), true)
  assert.equal(isMealType('tea'), false)
  assert.equal(isMealType(undefined), false)
})

test('guessMealType 按小时预选餐次', () => {
  assert.equal(guessMealType(7), 'breakfast')
  assert.equal(guessMealType(12), 'lunch')
  assert.equal(guessMealType(15), 'snack')
  assert.equal(guessMealType(19), 'dinner')
  assert.equal(guessMealType(23), 'snack')
  assert.equal(guessMealType(3), 'snack')
})
