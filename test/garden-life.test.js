const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife } = require('../miniprogram/utils/garden-life')
const { gridLayout, tileCenter } = require('../miniprogram/utils/iso')
const { itemAnchor } = require('../miniprogram/utils/garden-view')
const A = require('../miniprogram/utils/animals')
const { manualClock } = require('./helpers/manual-clock')

const L = gridLayout(12, 6, 40)
const WATER = { c: 8, r: 2 }
const walk = (c, r, swims) => {
  if (c < 0 || r < 0 || c >= 12 || r >= 6) return false
  if (c === 8 && r === 2) return !!swims
  if (c === 5) return r === 2
  return c !== 11
}
const areaOf = (c) => (c <= 4 ? 'main' : c >= 6 && c <= 10 ? 'pond' : '')
const SPOTS = [
  { id: 'eaves', area: 'main', c: 1, r: 1 },
  { id: 'pond_water', area: 'pond', c: 8, r: 2 },
  { id: 'well', area: 'pond', c: 9, r: 4 },
  { id: 'steps', area: 'main', c: 0, r: 3 },
]
const DOOR = { c: 2, r: 6 }

// 可重复的伪随机
function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// sprite 站在哪一格（站在物件上面时返回 null）
function tileOf(s) {
  const x = s.left + s.width / 2
  for (let c = -1; c <= L.cols; c++) {
    for (let r = -1; r <= L.rows; r++) {
      const center = tileCenter(c, r, L)
      if (Math.abs(center.x - x) < 0.01 && Math.abs(L.height - (center.y + L.tileH * 0.18) - s.bottom) < 0.01) return { c, r }
    }
  }
  return null
}

function setup(opts) {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({ L, clock, walk, areaOf, spots: SPOTS, hour: () => 15, onChange: (i, s) => { sprites[i] = s }, ...opts })
  life.sprites().forEach((s, i) => { sprites[i] = s })
  return { clock, life, sprites }
}

// 跑一段时间，记录每只动物到过的格子和做过的动作
function run(life, clock, sprites, ms, step = 500) {
  const tiles = {}
  const actions = {}
  for (let t = 0; t < ms; t += step) {
    clock.advance(step)
    Object.entries(sprites).forEach(([i, s]) => {
      const tile = tileOf(s)
      if (tile) (tiles[i] = tiles[i] || []).push(tile)
      ;(actions[i] = actions[i] || new Set()).add(s.action)
    })
  }
  return { tiles, actions }
}

test('一开始站在家附近的空格，图、大小、影子都对', () => {
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
  assert.ok(Math.abs(panda.shadow.width - panda.width * 0.7) < 0.01)
  assert.ok(Math.abs(panda.shadow.left + panda.shadow.width / 2 - (panda.left + panda.width / 2)) < 0.01)
})

test('逛十分钟：只走能走的地，不踩物件（2×2 的四格都不踩），不挤一格，会穿门去另一个院子', () => {
  const placed = [{ uid: 'p1', itemId: 'pavilion', c: 2, r: 4 }, { uid: 'p2', itemId: 'grass', c: 7, r: 1 }]
  const clock = manualClock()
  const current = {}
  const life = createLife({
    L, placed, residents: ['chick', 'rabbit', 'tabby_cat'], random: lcg(42), clock, walk, areaOf, spots: SPOTS, hour: () => 15,
    onChange: (i, s) => {
      current[i] = s
      const tiles = Object.values(current).map(tileOf).filter(Boolean)
      const keys = tiles.map((t) => `${t.c},${t.r}`)
      assert.equal(new Set(keys).size, keys.length, '两只动物挤在一格')
      tiles.forEach((t) => {
        assert.ok(walk(t.c, t.r, false), `走到了不能走的地 ${t.c},${t.r}`)
        assert.ok(!['2,4', '1,4', '2,3', '1,3', '7,1'].includes(`${t.c},${t.r}`), `踩到物件 ${t.c},${t.r}`)
      })
    },
  })
  life.sprites().forEach((s, i) => { current[i] = s })
  life.start()
  const seen = new Set()
  for (let t = 0; t < 10 * 60 * 1000; t += 500) {
    clock.advance(500)
    Object.values(current).forEach((s) => {
      const tile = tileOf(s)
      if (tile) seen.add(areaOf(tile.c))
    })
  }
  assert.deepEqual([...seen].filter(Boolean).sort(), ['main', 'pond'])
  life.stop()
  assert.equal(clock.count(), 0)
})

test('鸭子能下水，别的不下：下水时半身入水、没有影子', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['duck', 'chick'], random: lcg(5) })
  life.start()
  const { tiles } = run(life, clock, sprites, 10 * 60 * 1000)
  const duckInWater = tiles[0].some((t) => t.c === WATER.c && t.r === WATER.r)
  assert.ok(duckInWater, '鸭子没下过水')
  assert.ok(!tiles[1].some((t) => t.c === WATER.c && t.r === WATER.r))
  life.stop()
})

test('站到物件上玩：猫趴小板凳，落脚点按物件的图算；2×2 的池子鸭子也能下', () => {
  const placed = [{ uid: 'p1', itemId: 'stool', c: 3, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['tabby_cat'], random: () => 0.25 })
  life.start()
  let perch = null
  for (let i = 0; i < 120 && !perch; i++) {
    clock.advance(500)
    if (sprites[0].action === 'perch') perch = { ...sprites[0] }
  }
  assert.ok(perch, '没上板凳')
  assert.equal(tileOf(perch), null)
  const a = itemAnchor(placed[0], L)
  assert.ok(Math.abs(perch.left + perch.width / 2 - (a.x - a.width / 2 + A.PLAYS.stool.spot.x * a.width)) < 0.01)
  assert.ok(Math.abs(perch.bottom - (L.height - a.y + A.PLAYS.stool.spot.y * a.width)) < 0.01)
  assert.equal(perch.emoji, '💤')
  life.stop()

  const pond = [{ uid: 'p1', itemId: 'koi_pond', c: 3, r: 3 }]
  const d = setup({ placed: pond, residents: ['duck'], random: () => 0.25 })
  d.life.start()
  let swim = null
  for (let i = 0; i < 120 && !swim; i++) {
    d.clock.advance(500)
    if (d.sprites[0].action === 'swim') swim = { ...d.sprites[0] }
  }
  assert.ok(swim, '没下池子')
  const b = itemAnchor(pond[0], L)
  assert.ok(Math.abs(swim.left + swim.width / 2 - (b.x - b.width / 2 + A.PLAYS.koi_pond.spot.x * b.width)) < 0.01)
  assert.ok(swim.bodyHeight < swim.width)
  assert.equal(swim.shadow, null)
  assert.ok(Math.abs(swim.bubbleBottom - (swim.bodyHeight - swim.width * A.ANIMAL_INFO.duck.top + 4)) < 0.01)
  d.life.stop()
})

test('晚上回窝睡：猫到屋檐下，鸭子睡在水里；白天醒来', () => {
  let hour = 22
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat', 'duck'], random: lcg(3), hour: () => hour })
  life.start()
  clock.advance(3 * 60 * 1000)
  assert.deepEqual(tileOf(sprites[0]), { c: 1, r: 1 })
  assert.equal(sprites[0].action, 'sleep')
  assert.equal(sprites[0].emoji, '💤')
  assert.deepEqual(tileOf(sprites[1]), WATER)
  assert.equal(sprites[1].action, 'sleep')
  assert.ok(sprites[1].bodyHeight < sprites[1].width)
  assert.equal(sprites[1].shadow, null)
  // 一直睡到天亮
  clock.advance(5 * 60 * 1000)
  assert.equal(sprites[0].action, 'sleep')
  hour = 8
  clock.advance(3 * 60 * 1000)
  assert.notEqual(sprites[0].action, 'sleep')
  life.stop()
})

test('早上 6～9 点：都往正院凑，不乱跑', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick', 'rabbit', 'duck'], random: lcg(21), hour: () => 7 })
  life.start()
  clock.advance(2 * 60 * 1000)
  const { tiles, actions } = run(life, clock, sprites, 3 * 60 * 1000)
  Object.values(tiles).forEach((list) => list.forEach((t) => assert.equal(areaOf(t.c), 'main', JSON.stringify(t))))
  Object.values(actions).forEach((set) => assert.ok(!set.has('sleep')))
  life.stop()
})

test('中午 11～14 点：爱打盹', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['chick'], random: lcg(8), hour: () => 12 })
  life.start()
  const { actions } = run(life, clock, sprites, 2 * 60 * 1000)
  assert.ok(actions[0].has('sleep'))
  life.stop()
})

test('白天会做小事：小花猫去井边照镜子，头上冒表情和话', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat'], random: lcg(13) })
  life.start()
  let tricked = null
  for (let i = 0; i < 20 * 60 * 2 && !tricked; i++) {
    clock.advance(500)
    if (sprites[0].action === 'trick' && sprites[0].emoji === '✨') tricked = { ...sprites[0] }
  }
  assert.ok(tricked, '没去照镜子')
  assert.deepEqual(tileOf(tricked), { c: 9, r: 4 })
  assert.equal(tricked.bubble, '井里有只猫在看我，喵')
  life.stop()
})

test('新住户从大门走进来，头上说自我介绍，走到家旁边', () => {
  const placed = [{ uid: 'p1', itemId: 'grass', c: 1, r: 2 }]
  const { clock, life, sprites } = setup({ placed, residents: ['chick'], arrivals: ['chick'], door: DOOR, random: lcg(3) })
  assert.deepEqual(tileOf(sprites[0]), DOOR)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.chick.hello)
  life.start()
  clock.advance(20000)
  const t = tileOf(sprites[0])
  assert.ok(t && walk(t.c, t.r, false), JSON.stringify(t))
  assert.ok(Math.abs(t.c - 1) + Math.abs(t.r - 2) <= 2)
  assert.equal(sprites[0].bubble, '')
  life.stop()
})

test('whereIs / focus：告诉你每只在哪在干嘛，找它时冒爱心', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['tabby_cat', 'duck'], random: lcg(2) })
  const list = life.whereIs()
  assert.equal(list.length, 2)
  assert.deepEqual([list[0].index, list[0].id, list[0].name, list[0].image], [0, 'tabby_cat', '小花猫', '/images/garden/items/tabby_cat.png'])
  assert.ok(['main', 'pond'].indexOf(list[0].area) !== -1)
  assert.deepEqual(list[0].state, { action: 'idle', play: null, trick: null })
  assert.deepEqual({ c: list[0].c, r: list[0].r }, tileOf(sprites[0]))
  const where = life.focus(0)
  assert.deepEqual(where, { c: list[0].c, r: list[0].r })
  assert.equal(sprites[0].tapping, true)
  assert.equal(sprites[0].bubble, '')
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  assert.equal(life.focus(9), null)
  life.stop()
})

test('点一下：蹦一下、说一句，3 秒后气泡消失；睡觉时说梦话；气泡不超出花园', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['ginger_cat'], random: () => 0 })
  life.tap(0)
  assert.equal(sprites[0].tapping, true)
  assert.ok(A.ANIMAL_INFO.ginger_cat.lines.indexOf(sprites[0].bubble) !== -1)
  assert.equal(sprites[0].bubbleWidth, L.tileW * 5)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft >= -0.01)
  assert.ok(sprites[0].left + sprites[0].bubbleLeft + sprites[0].bubbleWidth <= L.width + 0.01)
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  clock.advance(2500)
  assert.equal(sprites[0].bubble, '')
  life.start()
  clock.advance(2500)
  assert.equal(sprites[0].action, 'sleep')
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

test('东西摆到动物脚下（含 2×2 盖住的格子），它跳到旁边的空格', () => {
  const { life, sprites } = setup({ placed: [], residents: ['rabbit'], random: () => 0.5 })
  const t = tileOf(sprites[0])
  life.updatePlaced([{ uid: 'p1', itemId: 'pavilion', c: t.c + 1, r: t.r + 1 }])
  const now = tileOf(sprites[0])
  assert.ok(now && !(now.c === t.c && now.r === t.r))
  assert.equal(sprites[0].action, 'walk')
})
