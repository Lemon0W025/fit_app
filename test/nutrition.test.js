const test = require('node:test')
const assert = require('node:assert/strict')
const {
  calcBMR,
  calcDailyKcal,
  sumMeals,
  round1,
  MIN_KCAL,
} = require('../cloudfunctions/api/lib/shared/nutrition')

const mom = { sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' }

test('calcBMR 女性 Mifflin-St Jeor', () => {
  // 10*70 + 6.25*160 - 5*50 - 161 = 1289
  assert.equal(calcBMR(mom), 1289)
})

test('calcBMR 男性 +5', () => {
  assert.equal(calcBMR({ sex: 'male', age: 50, heightCm: 160, weightKg: 70 }), 1455)
})

test('calcDailyKcal 减重时 TDEE - 500 并取整十', () => {
  // 1289 * 1.375 - 500 = 1272.4 -> 1270
  assert.equal(calcDailyKcal(mom), 1270)
})

test('calcDailyKcal 目标体重不低于当前体重时不减 500', () => {
  // 1289 * 1.375 = 1772.4 -> 1770
  assert.equal(calcDailyKcal({ ...mom, targetWeightKg: 70 }), 1770)
})

test('calcDailyKcal 女性不低于 1200', () => {
  const small = { sex: 'female', age: 60, heightCm: 150, weightKg: 45, targetWeightKg: 42, activity: 'sedentary' }
  assert.equal(calcDailyKcal(small), MIN_KCAL.female)
  assert.equal(MIN_KCAL.female, 1200)
})

test('calcDailyKcal 男性不低于 1500', () => {
  const man = { sex: 'male', age: 70, heightCm: 165, weightKg: 60, targetWeightKg: 55, activity: 'sedentary' }
  assert.equal(calcDailyKcal(man), 1500)
})

test('calcDailyKcal 未知活动量按久坐计算', () => {
  assert.equal(calcDailyKcal({ ...mom, activity: 'unknown' }), calcDailyKcal({ ...mom, activity: 'sedentary' }))
})

test('sumMeals 只统计分析成功的餐，营养素保留一位小数', () => {
  const meals = [
    { status: 'done', analysis: { totalKcal: 500, protein: 20.25, carbs: 60, fat: 10.1 } },
    { status: 'failed', analysis: null },
    { status: 'done', analysis: { totalKcal: 300, protein: 10.1, carbs: 30.05, fat: 5 } },
  ]
  assert.deepEqual(sumMeals(meals), { kcal: 800, protein: 30.4, carbs: 90.1, fat: 15.1 })
})

test('sumMeals 空数组', () => {
  assert.deepEqual(sumMeals([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
  assert.deepEqual(sumMeals(undefined), { kcal: 0, protein: 0, carbs: 0, fat: 0 })
})

test('round1', () => {
  assert.equal(round1(1.25), 1.3)
  assert.equal(round1(2), 2)
})
