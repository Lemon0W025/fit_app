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
      if (Math.abs(center.x - x) < 0.01 && Math.abs(L.height - (center.y + L.tileH * 0.35) - s.bottom) < 0.01) return { c, r }
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
  assert.ok(Math.abs(panda.shadow.width - panda.width * 0.55) < 0.01)
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
  assert.deepEqual(list[0].state, { action: 'idle', play: null, trick: null, flyer: '' })
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

test('走路带步态，而且一次走一小段，不是一格一停', () => {
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], random: lcg(17) })
  life.start()
  let longest = 0
  let run = 0
  let gait = ''
  for (let t = 0; t < 3 * 60 * 1000; t += 100) {
    clock.advance(100)
    if (sprites[0].action === 'walk') {
      gait = sprites[0].gait
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }
  assert.equal(gait, 'pad')
  // 熊猫一步 1800ms：连续走 2 格以上就是 ≥ 36 个 100ms 采样
  assert.ok(longest >= 36, `最长连续走 ${longest}`)
  life.stop()
})

// 会飞的停在哪：身子底边在物件落点上方 perchY 个图宽
function perchPoints(placed, id) {
  return placed.filter((p) => A.FLYERS[id].perches.indexOf(p.itemId) !== -1).map((p) => {
    const a = itemAnchor(p, L)
    return { x: a.x, bottom: L.height - (a.y - a.width * A.FLYERS[id].perchY) }
  })
}
const onPerch = (s, points) => points.some((p) => Math.abs(s.left + s.width / 2 - p.x) < 0.01 && Math.abs(s.bottom - p.bottom) < 0.01)

test('小鸟在树和喂鸟台之间飞、停在树冠上，不占格；晚上藏在树里，早上再出来', () => {
  const placed = [{ uid: 't1', itemId: 'osmanthus', c: 1, r: 1 }, { uid: 't2', itemId: 'orange_tree', c: 3, r: 4 }, { uid: 'f1', itemId: 'bird_feeder', c: 8, r: 4 }]
  let hour = 10
  const { clock, life, sprites } = setup({ placed, residents: ['bird', 'chick'], random: lcg(4), hour: () => hour })
  const points = perchPoints(placed, 'bird')
  const bird = sprites[0]
  assert.deepEqual([bird.id, bird.gait, bird.shadow, bird.hidden, bird.action], ['bird', 'fly', null, false, 'perch'])
  assert.ok(onPerch(bird, points), '一开始没停在树上')
  life.start()
  const seen = new Set()
  let flew = false
  for (let t = 0; t < 5 * 60 * 1000; t += 200) {
    clock.advance(200)
    const s = sprites[0]
    if (s.action === 'fly') flew = true
    if (s.action === 'perch') {
      assert.ok(onPerch(s, points), `停错地方 ${s.left},${s.bottom}`)
      points.forEach((p, i) => { if (Math.abs(s.left + s.width / 2 - p.x) < 0.01) seen.add(i) })
    }
  }
  assert.ok(flew, '没飞过')
  assert.ok(seen.size >= 2, '只停过一个地方')
  // 小鸡照样能走到树下那格（小鸟不占格）
  assert.ok(sprites[1].action !== undefined)
  hour = 21
  clock.advance(60 * 1000)
  assert.deepEqual([sprites[0].hidden, sprites[0].action], [true, 'sleep'])
  hour = 9
  clock.advance(120 * 1000)
  assert.equal(sprites[0].hidden, false)
  life.stop()
})

test('蝴蝶只在 8～18 点出现，停在花上；没有花就在院子上空盘旋', () => {
  const placed = [{ uid: 'f1', itemId: 'daisy', c: 2, r: 2 }, { uid: 'f2', itemId: 'sunflower', c: 7, r: 3 }]
  let hour = 20
  const { clock, life, sprites } = setup({ placed, residents: ['butterfly'], random: lcg(6), hour: () => hour })
  life.start()
  clock.advance(5000)
  assert.deepEqual([sprites[0].hidden, sprites[0].action, sprites[0].gait], [true, 'away', 'flutter'])
  hour = 10
  clock.advance(120 * 1000)
  assert.equal(sprites[0].hidden, false)
  const points = perchPoints(placed, 'butterfly')
  let perched = false
  for (let t = 0; t < 2 * 60 * 1000 && !perched; t += 200) {
    clock.advance(200)
    if (sprites[0].action === 'perch') perched = onPerch(sprites[0], points)
  }
  assert.ok(perched, '没停到花上')
  life.stop()

  const bare = setup({ placed: [], residents: ['butterfly'], random: lcg(6), hour: () => 10 })
  bare.life.start()
  bare.clock.advance(30000)
  assert.equal(bare.sprites[0].hidden, false)
  assert.ok(Number.isFinite(bare.sprites[0].left) && Number.isFinite(bare.sprites[0].bottom))
  bare.life.stop()
})

test('新来的小鸟从大门飞进来，先说你好；whereIs 说它在树上', () => {
  const placed = [{ uid: 't1', itemId: 'osmanthus', c: 1, r: 1 }]
  const { clock, life, sprites } = setup({ placed, residents: ['bird'], arrivals: ['bird'], door: DOOR, random: lcg(3) })
  const doorCenter = tileCenter(DOOR.c, DOOR.r, L)
  assert.ok(Math.abs(sprites[0].left + sprites[0].width / 2 - doorCenter.x) < 0.01)
  assert.equal(sprites[0].bubble, A.ANIMAL_INFO.bird.hello)
  assert.equal(sprites[0].action, 'fly')
  life.start()
  clock.advance(10000)
  assert.ok(onPerch(sprites[0], perchPoints(placed, 'bird')))
  const w = life.whereIs()[0]
  assert.deepEqual([w.c, w.r, w.area, w.state.flyer], [1, 1, 'main', 'bird'])
  assert.equal(A.describe(w.state, '正院', ''), '在正院的树上歇着')
  // 树收走了：换个地方（没别的地方就在上空盘旋）
  life.updatePlaced([])
  assert.equal(sprites[0].hidden, false)
  life.tap(0)
  assert.ok(sprites[0].bubble)
  life.stop()
})

test('有动画拼图时：往下走正面、往上走背面，往左走镜像；发呆睡觉各取各的格；拼图坏了退回单张图', () => {
  const sheets = { panda: { special: 'eat', top: 0.1 } }
  const { clock, life, sprites } = setup({ placed: [], residents: ['panda'], random: lcg(21), sheets, animBase: 'cloud://a/' })
  assert.equal(sprites[0].sheet, 'cloud://a/panda.png')
  assert.deepEqual(sprites[0].anim, { row: 2, col: 0, frames: 2, ms: 1200, cols: 6, rows: 4 })
  assert.equal(sprites[0].flip, false, '拼图朝右，一开始不镜像')
  life.start()
  let prev = tileOf(sprites[0])
  const seen = { front: 0, back: 0, left: 0, right: 0 }
  for (let t = 0; t < 5 * 60 * 1000; t += 100) {
    clock.advance(100)
    const s = sprites[0]
    const now = tileOf(s)
    if (s.action === 'walk' && now && prev && (now.c !== prev.c || now.r !== prev.r)) {
      const down = now.c + now.r > prev.c + prev.r
      assert.equal(s.anim.row, down ? 0 : 1, `往${down ? '下' : '上'}走该用第 ${down ? 1 : 2} 行`)
      assert.equal(s.anim.frames, 6)
      const right = now.c - now.r > prev.c - prev.r
      assert.equal(s.flip, !right)
      seen[down ? 'front' : 'back'] += 1
      seen[right ? 'right' : 'left'] += 1
    } else if (s.action === 'sleep') {
      assert.deepEqual([s.anim.row, s.anim.col], [2, 2])
    }
    if (now) prev = now
  }
  assert.ok(seen.front && seen.back && seen.left && seen.right, JSON.stringify(seen))
  life.noSheet('panda')
  assert.equal(sprites[0].sheet, '')
  assert.equal(sprites[0].anim, null)
  life.stop()
})

test('没有拼图前缀就都用单张图；猫趴板凳是睡觉帧（除非它的专属动作就是趴着）、小黄鸡啄米是专属帧、被点到是第 4 行开头', () => {
  const sheets = { chick: { special: 'peck', top: 0.1 }, tabby_cat: { special: 'soak', top: 0.1 } }
  const plain = setup({ placed: [], residents: ['chick'], random: lcg(3), sheets })
  assert.equal(plain.sprites[0].sheet, '')
  const placed = [{ uid: 'g', itemId: 'grass', c: 3, r: 3 }, { uid: 's', itemId: 'stool', c: 1, r: 3 }]
  const { clock, life, sprites } = setup({ placed, residents: ['chick', 'tabby_cat'], random: lcg(9), sheets, animBase: 'cloud://a/' })
  life.start()
  const frames = { peck: null, perch: null }
  for (let t = 0; t < 10 * 60 * 1000 && !(frames.peck && frames.perch); t += 200) {
    clock.advance(200)
    if (sprites[0].action === 'peck') frames.peck = sprites[0].anim
    if (sprites[1].action === 'perch') frames.perch = sprites[1].anim
  }
  assert.deepEqual([frames.peck.row, frames.peck.col, frames.peck.frames], [2, 4, 2])
  assert.deepEqual([frames.perch.row, frames.perch.col], [2, 2])
  life.tap(0)
  assert.deepEqual([sprites[0].anim.row, sprites[0].anim.col, sprites[0].anim.frames], [3, 0, 2])
  life.stop()
})
