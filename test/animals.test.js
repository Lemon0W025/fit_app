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
    assert.ok(A.GAITS.indexOf(info.gait) !== -1, id)
    assert.ok(info.arrive && info.hello && info.likesText.startsWith('喜欢：'), id)
  }
  assert.equal(A.ANIMAL_INFO.panda.likesText, '喜欢：翠竹')
  assert.equal(A.ANIMAL_INFO.panda_family.likesText, '喜欢：大熊猫 + 3 丛翠竹')
  assert.equal(A.ANIMAL_INFO.panda.arrive, '大熊猫闻着竹子香，搬进花园啦！')
  assert.deepEqual(A.SWIMMERS, ['duck', 'turtle', 'crane'])
  assert.deepEqual([A.ANIMAL_INFO.panda.gait, A.ANIMAL_INFO.tabby_cat.gait, A.ANIMAL_INFO.rabbit.gait, A.ANIMAL_INFO.duck.gait, A.ANIMAL_INFO.turtle.gait, A.ANIMAL_INFO.crane.gait],
    ['pad', 'pad', 'hop', 'waddle', 'crawl', 'stride'])
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
  // allow：只走允许的格子
  const onlyLeft = (t) => t.c <= 2
  for (const v of [0, 0.3, 0.6, 0.99]) {
    const s = A.chooseStep({ c: 2, r: 2 }, { size: 6, blocked: blocked(), home: null, allow: onlyLeft }, always(v))
    assert.ok(s.c <= 2, JSON.stringify(s))
  }
  assert.equal(A.chooseStep({ c: 2, r: 2 }, { size: { cols: 3, rows: 6 }, blocked: blocked(), home: null, allow: (t) => t.c > 5 }, always(0)), null)
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
  assert.equal(A.choosePlay('panda', pos, ctx({ chance: 0.6 }), always(0.5)).uid, 'p1')
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
  assert.equal(A.lineFor('tabby_cat', { action: 'trick', play: null, trick: A.TRICKS[0] }, always(0)), A.TRICKS[0].line)
})

test('periodOf：早上、中午、晚上、其他', () => {
  assert.deepEqual([5, 6, 8, 9, 11, 13, 14, 18, 19, 23].map(A.periodOf), ['night', 'morning', 'morning', 'day', 'noon', 'noon', 'day', 'day', 'night', 'night'])
})

test('小事表：动物、活动点都对得上，每只至少两件', () => {
  const spotIds = require('../miniprogram/utils/shared/estate').SPOTS.map((s) => s.id)
  for (const t of A.TRICKS) {
    t.animals.forEach((id) => assert.ok(ANIMALS.indexOf(id) !== -1, t.id))
    if (t.spot) assert.ok(spotIds.indexOf(t.spot) !== -1, `${t.id} 的活动点 ${t.spot}`)
    assert.ok(t.emoji && t.doing && t.line, t.id)
  }
  for (const id of ANIMALS) assert.ok(A.TRICKS.filter((t) => t.animals.indexOf(id) !== -1).length >= 2, id)
  for (const [id, spot] of Object.entries(A.SLEEP_SPOTS)) assert.ok(ANIMALS.indexOf(id) !== -1 && spotIds.indexOf(spot) !== -1, id)
})

test('chooseTrick：按概率、冷却、活动点有没有修、能不能走到挑一件小事', () => {
  const spots = [{ id: 'well', area: 'veg', c: 3, r: 0 }, { id: 'steps', area: 'main', c: 0, r: 3 }]
  const ctx = (extra = {}) => ({ spots, blocked: blocked([3, 0]), size: 6, busy: new Set(), cooldown: {}, now: 1000, ...extra })
  const pos = { c: 0, r: 0 }
  assert.equal(A.chooseTrick('tabby_cat', pos, ctx(), always(0.5)), null)
  const trick = A.chooseTrick('tabby_cat', pos, ctx(), always(0))
  assert.equal(trick.trick.id, 'mirror')
  assert.deepEqual(trick.target, { c: 3, r: 0 })
  assert.equal(trick.path.length, 3)
  // 井被别的动物占着、冷却中：换别的（always(0) 挑第一件）
  assert.notEqual(A.chooseTrick('tabby_cat', pos, ctx({ busy: new Set(['well']) }), always(0)).trick.id, 'mirror')
  assert.notEqual(A.chooseTrick('tabby_cat', pos, ctx({ cooldown: { 'tabby_cat:mirror': 5000 } }), always(0)).trick.id, 'mirror')
  // 没有活动点的小事在原地做
  const tail = A.chooseTrick('ginger_cat', pos, ctx({ spots: [] }), always(0))
  assert.equal(tail.trick.id, 'tail')
  assert.deepEqual([tail.target, tail.path], [pos, []])
  // 活动点没修（不在 spots 里）就做不了；小花猫的小事都要活动点，就没事可做
  assert.equal(A.chooseTrick('tabby_cat', pos, ctx({ spots: [] }), always(0)), null)
})

test('sleepTarget / gatherTarget / wanderTarget', () => {
  const free = []
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) free.push({ c, r })
  const areaOf = (c) => (c < 3 ? 'main' : 'pond')
  const spots = [{ id: 'eaves', area: 'main', c: 1, r: 1 }, { id: 'pond_water', area: 'pond', c: 5, r: 5 }]
  const sleep = A.sleepTarget('tabby_cat', { c: 4, r: 4 }, { spots, blocked: blocked(), size: 6, areaOf, free })
  assert.deepEqual(sleep.target, { c: 1, r: 1 })
  assert.equal(sleep.path.length, 6)
  // 窝被占了：睡旁边
  const beside = A.sleepTarget('tabby_cat', { c: 4, r: 4 }, { spots, blocked: blocked([1, 1]), size: 6, areaOf, free })
  assert.equal(Math.abs(beside.target.c - 1) + Math.abs(beside.target.r - 1), 1)
  // 没有窝（院子没修）：正院里最近的空格
  const fallback = A.sleepTarget('chick', { c: 4, r: 0 }, { spots, blocked: blocked(), size: 6, areaOf, free })
  assert.deepEqual(fallback.target, { c: 2, r: 0 })
  // 已经在窝里：不用走
  assert.deepEqual(A.sleepTarget('tabby_cat', { c: 1, r: 1 }, { spots, blocked: blocked(), size: 6, areaOf, free }).path, [])
  const gather = A.gatherTarget({ c: 5, r: 2 }, { blocked: blocked(), size: 6, areaOf, free })
  assert.equal(gather.target.c, 2)
  assert.equal(gather.path.length, 3)
  assert.equal(A.gatherTarget({ c: 1, r: 2 }, { blocked: blocked(), size: 6, areaOf, free }), null)
  const wander = A.wanderTarget({ c: 0, r: 0 }, { blocked: blocked(), size: 6, free }, always(0.5))
  assert.ok(wander && wander.path.length >= 3)
  assert.equal(A.wanderTarget({ c: 0, r: 0 }, { blocked: blocked(), size: 6, free: [{ c: 0, r: 1 }] }, always(0.5)), null)
})

test('describe：告诉你它在哪在干嘛', () => {
  assert.equal(A.describe({ action: 'sleep', play: null, trick: null }, '正院', ''), '在正院睡觉')
  assert.equal(A.describe({ action: 'trick', play: null, trick: A.TRICKS[0] }, '菜园', ''), '在菜园照镜子')
  assert.equal(A.describe({ action: 'eat', play: { play: A.PLAYS.bamboo }, trick: null }, '竹林院', ''), '在竹林院吃东西')
  assert.equal(A.describe({ action: 'swim', play: { play: A.PLAYS.koi_pond }, trick: null }, '荷塘院', ''), '在荷塘院玩水')
  assert.equal(A.describe({ action: 'walk', play: null, trick: null }, '正院', '荷塘院'), '正往荷塘院走')
  assert.equal(A.describe({ action: 'walk', play: null, trick: null }, '正院', ''), '正往那边走')
  assert.equal(A.describe({ action: 'idle', play: null, trick: null }, '前院', ''), '在前院溜达')
  assert.equal(A.describe({ action: 'idle', play: null, trick: null }, '', ''), '溜达')
})

test('strollTarget：一次走 2～4 格的小段路，只走允许的格子，离家远了往家走', () => {
  const free = []
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) free.push({ c, r })
  const ctx = { size: 8, blocked: blocked(), free, home: null, allow: null }
  for (const v of [0.1, 0.5, 0.9]) {
    const s = A.strollTarget({ c: 3, r: 3 }, ctx, always(v))
    assert.ok(s && s.path.length >= 2 && s.path.length <= 4, JSON.stringify(s))
    assert.deepEqual(s.path[s.path.length - 1], s.target)
  }
  const left = A.strollTarget({ c: 3, r: 3 }, { ...ctx, allow: (t) => t.c <= 3 }, always(0.3))
  assert.ok(left.target.c <= 3 && left.path.every((t) => t.c <= 3))
  // 离家远：目标比现在离家近
  const home = { c: 0, r: 0 }
  for (const v of [0.1, 0.5, 0.9]) {
    const s = A.strollTarget({ c: 6, r: 6 }, { ...ctx, home }, always(v))
    assert.ok(Math.abs(s.target.c) + Math.abs(s.target.r) < 12, JSON.stringify(s.target))
  }
  // 被围住：null
  assert.equal(A.strollTarget({ c: 0, r: 0 }, { ...ctx, blocked: blocked([1, 0], [0, 1]) }, always(0.5)), null)
})
