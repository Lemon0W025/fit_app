const test = require('node:test')
const assert = require('node:assert/strict')
const A = require('../miniprogram/utils/animals')
const { ANIMALS, itemById } = require('../miniprogram/utils/shared/garden')

const always = (v) => () => v
const blocked = (...tiles) => new Set(tiles.map(([c, r]) => `${c},${r}`))

test('每只动物都有脾气、台词和搬家的话', () => {
  assert.deepEqual(Object.keys(A.ANIMAL_INFO).sort(), [...ANIMALS].sort())
  for (const id of ANIMALS) {
    const info = A.ANIMAL_INFO[id]
    assert.ok(info.scale > 0 && info.scale <= 1.2, id)
    assert.ok(info.stepMs > 0 && info.pauseMs[0] <= info.pauseMs[1], id)
    assert.ok(['left', 'right', 'front'].indexOf(info.faces) !== -1, id)
    assert.ok(info.top >= 0 && info.top < 0.5, id)
    assert.ok(info.lines.length >= 4, id)
    assert.ok(info.arrive && info.hello && info.likesText.startsWith('喜欢：'), id)
  }
  assert.equal(A.ANIMAL_INFO.panda.likesText, '喜欢：翠竹')
  assert.equal(A.ANIMAL_INFO.panda_family.likesText, '喜欢：大熊猫 + 3 丛翠竹')
  assert.equal(A.ANIMAL_INFO.panda.arrive, '大熊猫闻着竹子香，搬进庭院啦！')
})

test('互动表里的物件和动物都存在，上面的物件有落脚点', () => {
  for (const [itemId, play] of Object.entries(A.PLAYS)) {
    assert.ok(itemById(itemId) && itemById(itemId).kind !== 'animal', itemId)
    if (play.animals !== 'all') play.animals.forEach((id) => assert.ok(ANIMALS.indexOf(id) !== -1, id))
    assert.ok(play.at === 'beside' || play.at === 'on', itemId)
    if (play.at === 'on') assert.ok(play.spot.x >= 0 && play.spot.x <= 1 && play.spot.y >= 0 && play.spot.y <= 1, itemId)
    assert.ok(play.emoji && play.line, itemId)
  }
  assert.equal(A.PLAYS.bamboo.action, 'eat')
  assert.equal(A.PLAYS.koi_pond.at, 'on')
  assert.equal(A.PLAYS.sweet_potato_stove.animals, 'all')
})

test('freeNeighbors：不出界、不进被占的格子', () => {
  assert.deepEqual(A.freeNeighbors({ c: 0, r: 0 }, 6, blocked([1, 0])), [{ c: 0, r: 1 }])
  assert.deepEqual(A.freeNeighbors({ c: 5, r: 5 }, 6, blocked()).length, 2)
})

test('homeOf：最早摆的那件喜欢的东西；没有就是 null', () => {
  const placed = [{ uid: 'p7', itemId: 'bamboo', c: 4, r: 4 }, { uid: 'p3', itemId: 'bamboo', c: 1, r: 2 }, { uid: 'p1', itemId: 'daisy', c: 0, r: 0 }]
  assert.deepEqual(A.homeOf('panda', placed), { c: 1, r: 2 })
  assert.equal(A.homeOf('duck', placed), null)
})

test('chooseStep：离家远了往回走；被围住就不动', () => {
  const ctx = { size: 6, blocked: blocked(), home: { c: 0, r: 0 } }
  for (const v of [0, 0.3, 0.6, 0.99]) {
    const step = A.chooseStep({ c: 4, r: 4 }, ctx, always(v))
    assert.ok(step.c + step.r < 8, JSON.stringify(step))
  }
  assert.equal(A.chooseStep({ c: 0, r: 0 }, { size: 6, blocked: blocked([1, 0], [0, 1]), home: null }, always(0)), null)
  // 没有家：四个方向都可能
  const seen = new Set([0, 0.26, 0.51, 0.76].map((v) => JSON.stringify(A.chooseStep({ c: 2, r: 2 }, { size: 6, blocked: blocked(), home: null }, always(v)))))
  assert.equal(seen.size, 4)
})

test('pathTo：最短路，绕开被占的格子，目标本身可以被占', () => {
  assert.deepEqual(A.pathTo({ c: 0, r: 0 }, { c: 0, r: 0 }, 6, blocked()), [])
  const path = A.pathTo({ c: 0, r: 0 }, { c: 2, r: 0 }, 6, blocked([1, 0], [2, 0]))
  assert.equal(path.length, 4)
  assert.deepEqual(path[path.length - 1], { c: 2, r: 0 })
  assert.ok(!path.slice(0, -1).some((t) => t.c === 1 && t.r === 0))
  assert.equal(A.pathTo({ c: 0, r: 0 }, { c: 3, r: 3 }, 6, blocked([1, 0], [0, 1])), null)
})

test('choosePlay：按概率、距离、冷却、占用挑最近能玩的物件', () => {
  const placed = [
    { uid: 'p1', itemId: 'bamboo', c: 2, r: 0 },
    { uid: 'p2', itemId: 'bamboo', c: 5, r: 5 },
    { uid: 'p3', itemId: 'koi_pond', c: 0, r: 2 },
  ]
  const ctx = (extra = {}) => ({ size: 6, blocked: blocked([2, 0], [5, 5], [0, 2]), placed, busy: new Set(), cooldown: {}, now: 1000, ...extra })
  const pos = { c: 0, r: 0 }
  assert.equal(A.choosePlay('panda', pos, ctx(), always(0.5)), null)
  const play = A.choosePlay('panda', pos, ctx(), always(0.1))
  assert.equal(play.uid, 'p1')
  assert.equal(play.play.action, 'eat')
  assert.deepEqual(play.item, { c: 2, r: 0 })
  assert.deepEqual(play.target, { c: 1, r: 0 })
  assert.deepEqual(play.path, [{ c: 1, r: 0 }])
  // 冷却中、被别的动物占着、太远都不选
  assert.equal(A.choosePlay('panda', pos, ctx({ cooldown: { p1: 5000 } }), always(0.1)), null)
  assert.equal(A.choosePlay('panda', pos, ctx({ busy: new Set(['p1']) }), always(0.1)), null)
  // 鸭子去池子上面
  const swim = A.choosePlay('duck', pos, ctx(), always(0.1))
  assert.equal(swim.uid, 'p3')
  assert.deepEqual(swim.target, { c: 0, r: 2 })
  assert.equal(swim.path.length, 2)
  // 熊猫不玩池子，鸭子不吃竹子
  assert.equal(A.choosePlay('crane', { c: 5, r: 0 }, ctx(), always(0.1)), null)
})

test('choosePlay：烤红薯炉谁都能去', () => {
  const placed = [{ uid: 'p1', itemId: 'sweet_potato_stove', c: 1, r: 1 }]
  const ctx = { size: 6, blocked: blocked([1, 1]), placed, busy: new Set(), cooldown: {}, now: 0 }
  for (const id of ANIMALS) assert.equal(A.choosePlay(id, { c: 0, r: 0 }, ctx, always(0.1)).play.action, 'warm', id)
})

test('flipFor：按图的朝向和屏幕上的左右决定镜像', () => {
  const a = { c: 2, r: 2 }
  const right = { c: 3, r: 2 } // 屏幕上往右
  const left = { c: 1, r: 2 }
  assert.equal(A.flipFor('right', a, right, true), false)
  assert.equal(A.flipFor('right', a, left, false), true)
  assert.equal(A.flipFor('front', a, left, false), true)
  assert.equal(A.flipFor('left', a, right, false), true)
  assert.equal(A.flipFor('left', a, left, true), false)
  assert.equal(A.flipFor('right', a, { c: 2, r: 2 }, true), true)
})

test('lineFor：玩的时候说玩的话，睡觉说梦话，平常随机一句', () => {
  const play = { play: A.PLAYS.bamboo }
  assert.equal(A.lineFor('panda', { action: 'eat', play }, always(0)), A.PLAYS.bamboo.line)
  assert.equal(A.lineFor('panda', { action: 'sleep', play: null }, always(0)), A.SLEEP_LINE)
  assert.equal(A.lineFor('panda', { action: 'idle', play: null }, always(0)), A.ANIMAL_INFO.panda.lines[0])
  // 在去玩的路上还是平常的话
  assert.equal(A.lineFor('panda', { action: 'walk', play }, always(0.99)), A.ANIMAL_INFO.panda.lines[A.ANIMAL_INFO.panda.lines.length - 1])
})
