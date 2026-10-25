const test = require('node:test')
const assert = require('node:assert/strict')
const { validateProfile } = require('../cloudfunctions/api/lib/profile')

const valid = {
  nickname: '妈妈',
  sex: 'female',
  age: '50',
  heightCm: '160',
  weightKg: '70.26',
  targetWeightKg: 60,
  activity: 'light',
  avoid: '不吃香菜',
}

test('合法输入：数字字符串转 number，体重保留一位小数', () => {
  const { value, errors } = validateProfile(valid)
  assert.deepEqual(errors, [])
  assert.deepEqual(value, {
    nickname: '妈妈',
    sex: 'female',
    age: 50,
    heightCm: 160,
    weightKg: 70.3,
    targetWeightKg: 60,
    activity: 'light',
    avoid: '不吃香菜',
  })
})

test('昵称缺省为"我"，忌口缺省为空并截断 100 字', () => {
  const { value } = validateProfile({ ...valid, nickname: '  ', avoid: 'a'.repeat(150) })
  assert.equal(value.nickname, '我')
  assert.equal(value.avoid.length, 100)
  assert.equal(validateProfile({ ...valid, avoid: undefined }).value.avoid, '')
})

test('昵称截断 20 字', () => {
  assert.equal(validateProfile({ ...valid, nickname: '长'.repeat(30) }).value.nickname.length, 20)
})

test('越界与非法枚举各给出错误', () => {
  assert.equal(validateProfile({ ...valid, age: 5 }).errors.length, 1)
  assert.equal(validateProfile({ ...valid, heightCm: 300 }).errors.length, 1)
  assert.equal(validateProfile({ ...valid, weightKg: 'abc' }).errors.length, 1)
  assert.equal(validateProfile({ ...valid, targetWeightKg: 10 }).errors.length, 1)
  assert.equal(validateProfile({ ...valid, sex: 'x' }).errors.length, 1)
  assert.equal(validateProfile({ ...valid, activity: 'x' }).errors.length, 1)
})

test('错误信息是中文提示', () => {
  const { errors } = validateProfile({ ...valid, age: 5 })
  assert.match(errors[0], /年龄/)
})

test('空输入不抛异常', () => {
  const { errors } = validateProfile(undefined)
  assert.ok(errors.length >= 5)
})

test('三餐时间：传了才校验，不合法给出错误', () => {
  assert.equal(validateProfile(valid).value.mealTimes, undefined)
  const ok = validateProfile({ ...valid, mealTimes: { breakfast: '07:00', lunch: '12:30', dinner: '18:30' } })
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.value.mealTimes, { breakfast: '07:00', lunch: '12:30', dinner: '18:30' })
  const bad = validateProfile({ ...valid, mealTimes: { breakfast: '11:00' } })
  assert.deepEqual(bad.errors, ['早饭时间要在 05:00～10:00 之间，按半小时选'])
})
