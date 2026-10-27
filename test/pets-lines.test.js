// test/pets-lines.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../miniprogram/utils/pets')
const { PETS } = require('../miniprogram/utils/shared/pets')

test('时段', () => {
  assert.deepEqual([4, 5, 7, 8, 12, 16, 17, 18, 19, 23].map(P.periodOf), ['night', 'morning', 'morning', 'day', 'day', 'day', 'dusk', 'dusk', 'night', 'night'])
})

test('找它的文案', () => {
  assert.equal(P.describe({ action: 'sleep' }), '在睡觉')
  assert.equal(P.describe({ action: 'walk' }), '在溜达')
  assert.equal(P.describe({ action: 'play', decorName: '秋千' }), '在玩秋千')
  assert.equal(P.describe({ action: 'sit', decorName: '野餐垫' }), '坐在野餐垫上')
  assert.equal(P.describe({ action: 'sit' }), '围着暖暖锅坐着')
  assert.equal(P.describe({ action: 'sun' }), '在晒太阳')
  assert.equal(P.describe({ action: 'eat' }), '在吃东西')
  assert.equal(P.describe({ action: 'away' }), '要清晨才来')
  assert.equal(P.describe({ action: 'idle' }), '在发呆')
  assert.equal(PETS.length, 12)
  assert.equal(P.CSS_ACTIONS.sleep, 'act-sleep')
})
