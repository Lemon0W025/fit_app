// test/pets-lines.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../miniprogram/utils/pets')
const { PETS } = require('../miniprogram/utils/shared/pets')

test('时段', () => {
  assert.deepEqual([4, 5, 7, 8, 12, 16, 17, 18, 19, 23].map(P.periodOf), ['night', 'morning', 'morning', 'day', 'day', 'day', 'dusk', 'dusk', 'night', 'night'])
})

test('台词：早上、晚上、睡着、吃东西各有专门的；白天从 tap 里随机', () => {
  const dd = PETS[0]
  assert.equal(P.lineFor('doudou', { period: 'morning', action: 'idle' }, 0), dd.lines.morning)
  assert.equal(P.lineFor('doudou', { period: 'night', action: 'sleep' }, 0), dd.lines.night)
  assert.equal(P.lineFor('doudou', { period: 'day', action: 'eat' }, 0), dd.lines.fed)
  assert.equal(P.lineFor('doudou', { period: 'day', action: 'idle' }, 0), dd.lines.tap[0])
  assert.equal(P.lineFor('doudou', { period: 'day', action: 'walk' }, 0.999), dd.lines.tap[dd.lines.tap.length - 1])
  assert.equal(P.lineFor('nope', { period: 'day', action: 'idle' }, 0), '')
})

test('找它的文案', () => {
  assert.equal(P.describe({ action: 'sleep' }), '在睡觉')
  assert.equal(P.describe({ action: 'walk' }), '在溜达')
  assert.equal(P.describe({ action: 'play', decorName: '秋千' }), '在玩秋千')
  assert.equal(P.describe({ action: 'sit', decorName: '野餐垫' }), '坐在野餐垫上')
  assert.equal(P.describe({ action: 'sit' }), '围着篝火坐着')
  assert.equal(P.describe({ action: 'sun' }), '在晒太阳')
  assert.equal(P.describe({ action: 'eat' }), '在吃东西')
  assert.equal(P.describe({ action: 'away' }), '要清晨才来')
  assert.equal(P.describe({ action: 'idle' }), '在发呆')
  assert.equal(P.CSS_ACTIONS.sleep, 'act-sleep')
})
