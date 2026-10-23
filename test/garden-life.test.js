const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife } = require('../miniprogram/utils/garden-life')
const { isoLayout, tileCenter } = require('../miniprogram/utils/iso')
const A = require('../miniprogram/utils/animals')
const { manualClock } = require('./helpers/manual-clock')

const L = isoLayout(6, 360)

// 可重复的伪随机
function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// sprite 站在哪一格（站在物件上面时返回 null）
function tileOf(s) {
  const x = s.left + s.width / 2
  for (let c = -1; c <= L.size; c++) {
    for (let r = 0; r < L.size; r++) {
      const center = tileCenter(c, r, L)
      if (Math.abs(center.x - x) < 0.01 && Math.abs(L.height - (center.y + L.tileH * 0.18) - s.bottom) < 0.01) return { c, r }
    }
  }
  return null
}

function setup(opts) {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({ L, clock, onChange: (i, s) => { sprites[i] = s }, ...opts })
  life.sprites().forEach((s, i) => { sprites[i] = s })
  return { clock, life, sprites }
}

test('一开始站在家附近的空格，图和大小对', () => {
  const placed = [{ uid: 'p1', itemId: 'bamboo', c: 2, r: 2 }, { uid: 'p2', itemId: 'starter_tree', c: 0, r: 0 }]
  const { sprites } = setup({ placed, residents: ['panda', 'chick'], random: lcg(7) })
  const panda = sprites[0]
  assert.equal(panda.id, 'panda')
  assert.equal(panda.image, '/images/garden/items/panda.png')
  assert.equal(panda.width, L.tileW * 0.8)
  assert.equal(panda.bodyHeight, panda.width)
  const t = tileOf(panda)
  assert.ok(Math.abs(t.c - 2) + Math.abs(t.r - 2) <= 2)
  assert.ok(!(t.c === 2 && t.r === 2) && !(t.c === 0 && t.r === 0))
  assert.notDeepEqual(tileOf(sprites[1]), t)
  assert.equal(panda.action, 'idle')
})

test('逛五分钟：不踩物件、不和别人挤一格，会走会停', () => {
  const placed = [
    { uid: 'p1', itemId: 'bamboo', c: 2, r: 2 },
    { uid: 'p2', itemId: 'starter_tree', c: 4, r: 1 },
    { uid: 'p3', itemId: 'grass', c: 1, r: 4 },
  ]
  const clock = manualClock()
  const current = {}
  const actions = new Set()
  const life = createLife({
    L, placed, residents: ['panda', 'chick', 'rabbit'], random: lcg(42), clock,
    onChange: (i, s) => {
      current[i] = s
      actions.add(s.action)
      const tiles = Object.values(current).map(tileOf).filter(Boolean).map((t) => `${t.c},${t.r}`)
      assert.equal(new Set(tiles).size, tiles.length, '两只动物挤在一格')
      tiles.forEach((k) => assert.ok(!placed.some((p) => `${p.c},${p.r}` === k), `踩到物件 ${k}`))
    },
  })
  life.sprites().forEach((s, i) => { current[i] = s })
  life.start()
  clock.advance(5 * 60 * 1000)
  assert.ok(actions.has('walk') && actions.has('idle'))
  life.stop()
  assert.equal(clock.count(), 0)
})

test('熊猫走到竹子旁边吃竹子，吃完一阵子不再吃同一丛', () => {
  const placed = [{ uid: 'p1', itemId: 'bamboo', c: 2, r: 2 }]
  // 0.2：不打盹（熊猫 0.1）、要去玩（0.3）
  const { clock, life, sprites } = setup({ placed, residents: ['panda'], random: () => 0.2 })
  life.start()
  let ate = null
  for (let i = 0; i < 60 && !ate; i++) {
    clock.advance(500)
    if (sprites[0].action === 'eat') ate = { ...sprites[0] }
  }
  assert.ok(ate, '没吃上竹子')
  assert.equal(ate.emoji, '🎋')
  const t = tileOf(ate)
  assert.equal(Math.abs(t.c - 2) + Math.abs(t.r - 2), 1)
  clock.advance(10000)
  assert.notEqual(sprites[0].action, 'eat')
  // 冷却 1 分钟内不再吃
  for (let i = 0; i < 40; i++) {
    clock.advance(1000)
    assert.notEqual(sprites[0].action, 'eat')
  }
})

test('鸭子下水：站到池子的落脚点上，半身入水', () => {
  const placed = [{ uid: 'p1', itemId: 'koi_pond', c: 3, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['duck'], random: () => 0.2 })
  life.start()
  let swim = null
  for (let i = 0; i < 60 && !swim; i++) {
    clock.advance(500)
    if (sprites[0].action === 'swim') swim = { ...sprites[0] }
  }
  assert.ok(swim, '没下水')
  assert.equal(tileOf(swim), null)
  const iw = L.tileW * 1.0
  const center = tileCenter(3, 3, L)
  assert.ok(Math.abs(swim.left + swim.width / 2 - (center.x - iw / 2 + A.PLAYS.koi_pond.spot.x * iw)) < 0.01)
  assert.ok(swim.bodyHeight < swim.width)
  assert.equal(swim.emoji, '💧')
  assert.ok(Math.abs(swim.bubbleBottom - (swim.bodyHeight - swim.width * A.ANIMAL_INFO.duck.top + 4)) < 0.01)
})

test('小乌龟下水：按它本身的高度算水面，不算图里头顶的空白', () => {
  const placed = [{ uid: 'p1', itemId: 'lotus_pond', c: 3, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['turtle'], random: () => 0.2 })
  life.start()
  let swim = null
  for (let i = 0; i < 120 && !swim; i++) {
    clock.advance(500)
    if (sprites[0].action === 'swim') swim = { ...sprites[0] }
  }
  assert.ok(swim, '没下水')
  const headroom = swim.width * A.ANIMAL_INFO.turtle.top
  assert.ok(Math.abs(swim.bodyHeight - (headroom + (swim.width - headroom) * 0.62)) < 0.01)
  life.stop()
})

test('新住户从院子边上走进来，头上说自我介绍', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], arrivals: ['panda'], random: lcg(3) })
  assert.equal(tileOf(sprites[0]).c, L.size)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.panda.hello)
  life.start()
  clock.advance(5000)
  const t = tileOf(sprites[0])
  assert.ok(t && t.c < L.size)
  assert.equal(sprites[0].bubble, '')
})

test('点一下：蹦一下、说一句，3 秒后气泡消失；睡觉时说梦话', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['ginger_cat'], random: () => 0 })
  life.tap(0)
  assert.equal(sprites[0].tapping, true)
  assert.ok(A.ANIMAL_INFO.ginger_cat.lines.indexOf(sprites[0].bubble) !== -1)
  assert.ok(sprites[0].bubbleWidth > 0)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft >= -0.01)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft + sprites[0].bubbleWidth <= L.width + 0.01)
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  clock.advance(2500)
  assert.equal(sprites[0].bubble, '')
  // random 0 < sleepy：轮到它就打盹
  life.start()
  clock.advance(2500)
  assert.equal(sprites[0].action, 'sleep')
  assert.equal(sprites[0].emoji, '💤')
  life.tap(0)
  assert.equal(sprites[0].bubble, A.SLEEP_LINE)
  life.stop()
})

test('暂停时不动，恢复后继续；stop 清掉所有定时器', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick'], random: lcg(9) })
  life.start()
  clock.advance(3000)
  life.pause()
  const frozen = JSON.stringify(sprites[0])
  clock.advance(30000)
  assert.equal(JSON.stringify(sprites[0]), frozen)
  life.resume()
  clock.advance(30000)
  assert.notEqual(JSON.stringify(sprites[0]), frozen)
  life.tap(0)
  life.stop()
  assert.equal(clock.count(), 0)
})

test('东西摆到动物脚下，它跳到旁边的空格', () => {
  const { life, sprites } = setup({ placed: [], residents: ['rabbit'], random: () => 0.5 })
  const t = tileOf(sprites[0])
  life.updatePlaced([{ uid: 'p1', itemId: 'daisy', c: t.c, r: t.r }])
  const now = tileOf(sprites[0])
  assert.ok(now && !(now.c === t.c && now.r === t.r))
  assert.equal(sprites[0].action, 'walk')
})
