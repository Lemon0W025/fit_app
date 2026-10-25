const test = require('node:test')
const assert = require('node:assert/strict')
const { manualClock } = require('./helpers/manual-clock')
const { countUp, buzz, clockOf, REAL_CLOCK } = require('../miniprogram/utils/fx')

test('countUp：从 from 滚到 to，中途单调不超过，最后一步正好是 to', () => {
  const clock = manualClock()
  const seen = []
  const c = countUp(0, 520, 800, (n) => seen.push(n), clock)
  assert.equal(seen[0], 0)
  clock.advance(400)
  assert.ok(seen.length > 3)
  clock.advance(1000)
  assert.equal(seen[seen.length - 1], 520)
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && seen[i] <= 520)
  assert.equal(c.done(), true)
  assert.equal(clock.count(), 0)
})

test('countUp：finish 直接到目标值，cancel 停在原地；一样的数不留定时器', () => {
  const clock = manualClock()
  const seen = []
  const c = countUp(10, 30, 600, (n) => seen.push(n), clock)
  c.finish()
  assert.equal(seen[seen.length - 1], 30)
  assert.equal(clock.count(), 0)
  c.finish()
  assert.equal(seen.filter((n) => n === 30).length, 1)

  const stay = []
  const s = countUp(0, 100, 600, (n) => stay.push(n), clock)
  clock.advance(80)
  s.cancel()
  assert.equal(clock.count(), 0)
  assert.ok(stay[stay.length - 1] < 100)

  const same = []
  countUp(7, 7, 600, (n) => same.push(n), clock)
  assert.deepEqual(same, [7])
  assert.equal(clock.count(), 0)
})

test('buzz：有 wx.vibrateShort 就震，没有就跳过；clockOf 用注入的时钟', () => {
  const calls = []
  global.wx = { vibrateShort: (o) => calls.push(o.type) }
  buzz('medium')
  buzz()
  assert.deepEqual(calls, ['medium', 'light'])
  global.wx = {}
  assert.doesNotThrow(() => buzz('light'))
  const clock = manualClock()
  assert.equal(clockOf({ clock }), clock)
  assert.equal(clockOf({}), REAL_CLOCK)
})
