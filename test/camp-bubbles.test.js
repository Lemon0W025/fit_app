// test/camp-bubbles.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createBubbles, lineMs, AUTO_GAP_MS } = require('../miniprogram/utils/camp-bubbles')
const { manualClock } = require('./helpers/manual-clock')

function make(n = 3) {
  const clock = manualClock()
  const animals = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, bubble: '', hidden: false }))
  const emitted = []
  const bubbles = createBubbles({ animals, clock, emit: (a) => emitted.push(a.id) })
  const shown = () => animals.filter((a) => a.bubble && !a.hidden).map((a) => a.bubble)
  return { clock, animals, bubbles, emitted, shown }
}

test('一句：说 ms 毫秒就收起，收起时发一次', () => {
  const { clock, animals: [a], bubbles, emitted } = make()
  assert.equal(bubbles.event(a, '你好呀', 4000), true)
  assert.equal(a.bubble, '你好呀')
  assert.deepEqual(emitted, [], '开口时不发（调用的接着换动作一起发）')
  clock.advance(3999)
  assert.equal(a.bubble, '你好呀')
  clock.advance(1)
  assert.equal(a.bubble, '')
  assert.deepEqual(emitted, ['p0'])
  assert.equal(clock.count(), 0)
})

test('take：别的气泡收起来，它说；一段按字数一句一句换，next 跳到下一句，说完收起', () => {
  const { clock, animals: [a, b], bubbles, emitted, shown } = make()
  bubbles.event(b, '我先说')
  const lines = ['第一句', '第二句话长一点点', '第三句']
  const total = bubbles.take(a, lines)
  assert.equal(total, lines.reduce((t, l) => t + lineMs(l), 0))
  assert.deepEqual(shown(), ['第一句'])
  assert.deepEqual(emitted, ['p1'], '收起的那只发一次')
  clock.advance(lineMs('第一句'))
  assert.equal(a.bubble, '第二句话长一点点')
  assert.equal(bubbles.next(a), true)
  assert.equal(a.bubble, '第三句')
  assert.equal(bubbles.next(a), false, '最后一句了')
  clock.advance(lineMs('第三句'))
  assert.equal(a.bubble, '')
  // 换句时气泡位置清掉，页面重新夹
  bubbles.take(a, ['一', '二'])
  a.bubbleDx = 12
  clock.advance(lineMs('一'))
  assert.equal(a.bubbleDx, null)
  // 空的一段：什么都不说
  bubbles.stop()
  const { animals: [c], bubbles: other } = make()
  assert.equal(other.take(c, ['', null]), 0)
  assert.equal(c.bubble, '')
})

test('屏幕上同一时间最多一个气泡：有人在说，auto 和 event 都不说', () => {
  const { animals: [a, b, c], bubbles, shown } = make()
  assert.equal(bubbles.event(a, '我来啦'), true)
  assert.equal(bubbles.event(b, '我也来'), false)
  assert.equal(bubbles.auto(c, '好香'), false)
  assert.deepEqual(shown(), ['我来啦'])
  // 藏起来的不算在说
  a.hidden = true
  assert.equal(bubbles.event(b, '我也来'), true)
})

test('auto：上一个气泡收起两分钟内不说，event 照说；没话说不说', () => {
  const { clock, animals: [a, b], bubbles } = make()
  assert.equal(bubbles.auto(a, ''), false)
  assert.equal(bubbles.auto(a, '无聊'), true)
  clock.advance(3000)
  assert.equal(a.bubble, '')
  assert.equal(bubbles.auto(b, '我也无聊'), false)
  clock.advance(AUTO_GAP_MS - 1)
  assert.equal(bubbles.auto(b, '我也无聊'), false)
  assert.equal(bubbles.event(b, '新住户你好'), true)
  clock.advance(3000)
  clock.advance(AUTO_GAP_MS)
  assert.equal(bubbles.auto(a, '还是无聊'), true)
})

test('drop：走开藏起来的气泡马上收起、不再换下一句，之后两分钟不自己开口', () => {
  const { clock, animals: [a, b], bubbles, emitted } = make()
  bubbles.take(a, ['我去找吃的', '一会儿回来'])
  bubbles.drop(a)
  assert.equal(a.bubble, '')
  assert.equal(clock.count(), 0)
  clock.advance(10000)
  assert.equal(a.bubble, '')
  assert.deepEqual(emitted, [])
  assert.equal(bubbles.auto(b, '人呢'), false)
  clock.advance(AUTO_GAP_MS)
  assert.equal(bubbles.auto(b, '人呢'), true)
})

test('recent 记最近 12 句；stop 清掉所有定时器', () => {
  const { clock, animals: [a, b], bubbles } = make()
  for (let i = 0; i < 15; i++) {
    bubbles.take(a, `第${i}句`)
    clock.advance(3000)
  }
  assert.equal(a.recent.length, 12)
  assert.equal(a.recent[11], '第14句')
  bubbles.take(a, ['一', '二'])
  bubbles.take(b, '我')
  bubbles.take(a, ['三', '四'])
  bubbles.stop()
  assert.equal(clock.count(), 0)
  assert.equal(a.speech, null)
})
