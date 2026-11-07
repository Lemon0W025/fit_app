// test/camp-life.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife, PET_ZOOM } = require('../miniprogram/utils/camp-life')
const { campLayout, cutoutStrips, zOf } = require('../miniprogram/utils/camp-view')
const { SCENE, inGrass, pointInPoly, hiddenAt, nogoPolys, segmentHitsPoly, scaleAt } = require('../miniprogram/utils/shared/camp')
const { petById } = require('../miniprogram/utils/shared/pets')
const { FOOT } = require('../miniprogram/utils/anim')
const { manualClock } = require('./helpers/manual-clock')

const L = campLayout({ width: 375, height: 736 })

function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function make(opts = {}) {
  const clock = opts.clock || manualClock()
  const sprites = {}
  const life = createLife({
    // 豆豆住下了、糯糯是常客；默认锅里煮着东西（锅空着时常客会回去，单独测）
    L, pets: opts.pets || [{ id: 'doudou', level: 1, home: true }, { id: 'nuonuo', level: 2 }], decor: opts.decor || [],
    saved: opts.saved || null, pot: () => opts.pot || ['xiaomi'],
    hour: () => (opts.hour === undefined ? 12 : opts.hour), lit: () => opts.lit !== false, random: lcg(opts.seed || 7), clock: opts.clock || clock,
    onChange: (i, s) => { sprites[i] = s }, sheets: opts.sheets || {}, animBase: opts.animBase || '', sheetSrc: opts.sheetSrc, bad: new Set(),
    sways: opts.sways, today: opts.today, visible: opts.visible,
  })
  return { life, clock, sprites }
}

// 精灵在画里的横坐标（画的像素）
const centerX = (sp) => (sp.left + sp.width / 2) / L.k
// 在画的左右边上（测试里没有屏幕，就是画的两边往里 120）
const atSideEdge = (sp) => Math.abs(centerX(sp) - 120) < 1 || Math.abs(centerX(sp) - (SCENE.width - 120)) < 1

test('住户一开始站在草地上；精灵有尺寸、远近缩放、z、单张图', () => {
  const { life } = make()
  const sp = life.sprites()
  assert.equal(sp.length, 2)
  sp.forEach((s) => {
    assert.ok(s.width > 0 && s.left >= 0 && s.bottom >= 0 && s.z > 0, s.id)
    assert.equal(s.image, `/images/camp/pets/${s.id}.png`)
    assert.equal(s.sheet, '')
    assert.equal(s.anim, null)
    assert.ok(s.cssAction)
    assert.ok(s.shadow.width > 0)
  })
  const where = life.whereIs()
  where.forEach((w) => assert.ok(inGrass(w.x, w.y), `${w.id} ${w.x},${w.y}`))
  assert.deepEqual(where.map((w) => w.name), ['豆豆', '糯糯'])
  assert.ok(where[0].face.endsWith('doudou-face.png'))
})

test('白天：开始后会走动，每一步都落在草地上、不穿禁区，走的时候 action 是 walk、有 duration', () => {
  const { life, clock, sprites } = make()
  life.start()
  let walked = 0
  for (let i = 0; i < 60; i++) {
    clock.advance(1500)
    Object.values(sprites).forEach((s) => {
      if (s.action === 'walk') {
        walked += 1
        assert.ok(s.duration > 0)
      }
    })
    life.whereIs().forEach((w) => assert.ok(inGrass(w.x, w.y) || w.action === 'sun' || w.action === 'sit' || w.action === 'tent', `${w.id} 站到了 ${w.x},${w.y}`))
  }
  assert.ok(walked > 0)
  life.stop()
  assert.equal(clock.count(), 0)
})

test('傍晚火着着：全员围着篝火坐；火没着：各玩各的，不去坐', () => {
  const dusk = make({ hour: 18 })
  dusk.life.start()
  dusk.clock.advance(120000)
  dusk.life.whereIs().forEach((w, i) => {
    assert.equal(w.action, 'sit', w.id)
    const [sx, sy] = SCENE.seats[i]
    assert.ok(Math.hypot(w.x - sx, w.y - sy) < 1, `${w.id} 没坐到位 ${w.x},${w.y}`)
  })
  const cold = make({ hour: 18, lit: false })
  cold.life.start()
  for (let i = 0; i < 120; i++) {
    cold.clock.advance(1000)
    assert.ok(cold.life.whereIs().every((w) => w.action !== 'sit'))
  }
  cold.life.stop()
})

const ALL = ['doudou', 'nuonuo', 'lianlian', 'shishi', 'huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha', 'hehe']

test('随机小睡：任何时候睡着的不超过上限（白天 1/4、夜里 1/2，至少 1 只），夜里不是全体睡、白天也有打盹的', () => {
  for (const [hour, share, n] of [[12, 1 / 4, 12], [23, 1 / 2, 12], [12, 1 / 4, 2], [2, 1 / 2, 4]]) {
    for (const seed of [3, 17, 41]) {
      const pets = ALL.slice(0, n).map((id) => ({ id, level: 3, fed: 9 }))
      const { life, clock } = make({ hour, pets, seed, lit: false, decor: [{ uid: 'd1', id: 'strawbed', x: 2900, y: 3300 }] })
      life.start()
      let most = 0
      for (let i = 0; i < 1200; i++) {
        clock.advance(1000)
        const here = life.whereIs().filter((w) => w.action !== 'away')
        const sleeping = here.filter((w) => w.action === 'sleep').length
        most = Math.max(most, sleeping)
        assert.ok(sleeping <= Math.max(1, Math.floor(here.length * share)), `${hour} 点 ${n} 只（种子 ${seed}）：同时睡了 ${sleeping} 只`)
      }
      assert.ok(most >= 1, `${hour} 点 ${n} 只（种子 ${seed}）：20 分钟里没人打盹`)
      life.stop()
    }
  }
})

test('小睡多久：白天 10～40 秒、夜里 1～5 分钟；睡够了自己醒；点睡着的马上醒、说「嗯…？醒啦」', () => {
  for (const [hour, lo, hi] of [[12, 10000, 40000], [23, 60000, 300000]]) {
    const { life, clock, sprites } = make({ hour, seed: 5, lit: false, pets: [{ id: 'doudou', level: 1, fed: 0 }] })
    life.start()
    let fellAt = -1
    let wokeAt = -1
    for (let t = 0; t < 3600 && wokeAt < 0; t++) {
      clock.advance(1000)
      const action = sprites[0] && sprites[0].action
      if (fellAt < 0 && action === 'sleep') fellAt = t
      if (fellAt >= 0 && action !== 'sleep') wokeAt = t
    }
    assert.ok(fellAt >= 0 && wokeAt > fellAt, `${hour} 点：没睡着或没醒`)
    const slept = (wokeAt - fellAt) * 1000
    assert.ok(slept >= lo - 1000 && slept <= hi + 1000, `${hour} 点睡了 ${slept}ms`)
    life.stop()
  }
  // 点醒
  const { life, clock, sprites } = make({ hour: 23, seed: 5, lit: false, pets: [{ id: 'doudou', level: 1, fed: 0 }] })
  life.start()
  for (let t = 0; t < 3600 && !(sprites[0] && sprites[0].action === 'sleep'); t++) clock.advance(1000)
  assert.equal(sprites[0].action, 'sleep')
  life.tap(0)
  assert.equal(sprites[0].action, 'happy')
  assert.equal(sprites[0].bubble, '嗯…？醒啦')
  clock.advance(2000)
  assert.equal(sprites[0].action, 'idle')
  life.stop()
})

test('不瞬移：snapshot → 新建（saved）站回原地、朝向不变；没睡完的接着睡、睡完了的不睡；站不住的地方不用', () => {
  const clock = manualClock()
  const first = make({ clock, hour: 12, seed: 9 })
  first.life.start()
  clock.advance(20000)
  first.life.pause()
  const snap = first.life.snapshot()
  first.life.stop()
  assert.deepEqual(Object.keys(snap), ['doudou', 'nuonuo'])
  const again = make({ clock, hour: 12, seed: 99, saved: snap })
  again.life.whereIs().forEach((w) => {
    assert.ok(Math.abs(w.x - snap[w.id].x) < 1e-6 && Math.abs(w.y - snap[w.id].y) < 1e-6, w.id)
  })
  assert.deepEqual(again.life.sprites().map((s) => !s.flip), [snap.doudou.right, snap.nuonuo.right])
  // 睡到 until：还没到就接着睡，到了就醒
  const sleepy = { doudou: { x: 3000, y: 3300, right: false, action: 'sleep', until: clock.now() + 30000, sleepStyle: 'B' }, nuonuo: { x: 3300, y: 3500, right: true, action: 'sleep', until: clock.now() - 1, sleepStyle: 'A' } }
  const back = make({ clock, hour: 23, lit: false, seed: 4, saved: sleepy })
  assert.deepEqual(back.life.whereIs().map((w) => w.action), ['sleep', 'idle'])
  back.life.start()
  clock.advance(29000)
  assert.equal(back.life.whereIs()[0].action, 'sleep')
  clock.advance(2000)
  assert.notEqual(back.life.whereIs()[0].action, 'sleep')
  back.life.stop()
  // 禁区里、锅后面看不见的地方、装饰脚下的：不用，照常在火边找地方
  const bad = { doudou: { x: SCENE.fire[0], y: SCENE.fire[1], right: true, action: 'idle', until: 0 }, nuonuo: { x: 1500, y: 1800, right: true, action: 'idle', until: 0 } }
  const moved = make({ clock, saved: bad, decor: [{ uid: 'd1', id: 'ball', x: 1500, y: 1800 }] })
  moved.life.whereIs().forEach((w) => assert.ok(Math.hypot(w.x - bad[w.id].x, w.y - bad[w.id].y) > 50, w.id))
})

test('闻着香味来的（addGuest）：排队从画的边上进来、先去锅边吃一口说闻着什么，然后和大家一样；能喂、在「找它」里；已经在场的不再加', () => {
  const { life, clock, sprites } = make({ hour: 12 })
  life.start()
  clock.advance(1000)
  assert.equal(life.addGuest({ id: 'sunbao', foodId: 'zhusun' }), 2)
  assert.equal(sprites[2].hidden, true, '香味飘出去要一会儿')
  let waited = 0
  while (sprites[2].hidden && waited < 20000) {
    clock.advance(40)
    waited += 40
  }
  assert.ok(waited >= 4000 && waited <= 10500, `${waited}ms 到`)
  assert.ok(atSideEdge(sprites[2]), String(centerX(sprites[2])))
  // 走到锅边吃一口，说闻着竹笋来的
  let said = ''
  for (let i = 0; i < 120 && !said; i++) {
    clock.advance(500)
    if (sprites[2].action === 'eat' && sprites[2].bubble) said = sprites[2].bubble
  }
  assert.match(said, /竹笋/)
  assert.deepEqual(life.whereIs().map((w) => [w.id, w.home]), [['doudou', true], ['nuonuo', false], ['sunbao', false]])
  assert.equal(life.addGuest({ id: 'sunbao', foodId: 'zhusun' }), 2, '在场的不再加')
  assert.equal(life.addGuest({ id: 'nuonuo', foodId: 'huluobo' }), 1)
  assert.ok('sunbao' in life.snapshot())
  // 之后和大家一样过日子：会睡
  let slept = false
  for (let i = 0; i < 2400 && !slept; i++) {
    clock.advance(1000)
    slept = sprites[2].action === 'sleep' || sprites[2].action === 'tent'
  }
  assert.ok(slept, '常客也会睡')
  life.stop()
})
test('进来的排队：一只一只从屏幕看得到的那段外面进来；没进来的切 tab 再回来接着排', () => {
  const visible = () => ({ left: 1200 * L.k, right: 2600 * L.k })
  const pets = [{ id: 'doudou', level: 1, home: true }]
  const { life, clock, sprites } = make({ hour: 12, pets, visible })
  life.start()
  clock.advance(2000)
  ;['qiqi', 'shushu', 'lianlian'].forEach((id) => life.addGuest({ id, foodId: 'xiaomi' }))
  const seen = {}
  // 一步 40ms：现身那一帧（站在边上，80ms 后才迈腿）要看得到
  for (let t = 0; t <= 120000; t += 40) {
    Object.values(sprites).forEach((sp) => {
      if (!sp.hidden && sp.id !== 'doudou' && !(sp.id in seen)) {
        seen[sp.id] = t
        // 从看得到的那段外面一点（左边 1200 - 140、右边 2600 + 140）现身
        const x = centerX(sp)
        assert.ok(Math.abs(x - 1060) < 1 || Math.abs(x - 2740) < 1, `${sp.id} 从 ${x} 进来`)
      }
    })
    clock.advance(40)
  }
  assert.deepEqual(Object.keys(seen).sort((a, b) => seen[a] - seen[b]), ['qiqi', 'shushu', 'lianlian'], '按叫的先后进')
  const times = Object.values(seen).sort((a, b) => a - b)
  assert.ok(times[0] >= 4000 && times[0] <= 10500, `第一只 ${times[0]}ms 到`)
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 8000, `隔了 ${times[i] - times[i - 1]}ms`)
  life.stop()

  // 排着队还没进来就离开营地：snapshot 记着在外面排队；回来接着排，不会一下子全站在边上
  const again = make({ hour: 12, pets, visible })
  again.life.start()
  again.clock.advance(2000)
  ;['qiqi', 'shushu', 'lianlian'].forEach((id) => again.life.addGuest({ id, foodId: 'xiaomi' }))
  again.clock.advance(1000)
  const saved = again.life.snapshot()
  assert.deepEqual(Object.keys(saved).filter((id) => saved[id].hidden).sort(), ['lianlian', 'qiqi', 'shushu'])
  assert.deepEqual([saved.qiqi.why, saved.qiqi.foodId], ['smell', 'xiaomi'])
  again.life.stop()
  const back = make({ hour: 12, pets: pets.concat(['qiqi', 'shushu', 'lianlian'].map((id) => ({ id, level: 1 }))), saved, visible })
  assert.equal(back.life.sprites().filter((sp) => sp.hidden).length, 3)
  back.life.start()
  const shown = {}
  for (let t = 0; t <= 120000; t += 500) {
    Object.values(back.sprites).forEach((sp) => {
      if (!sp.hidden && sp.id !== 'doudou' && !(sp.id in shown)) shown[sp.id] = t
    })
    back.clock.advance(500)
  }
  assert.equal(Object.keys(shown).length, 3)
  const ts = Object.values(shown).sort((a, b) => a - b)
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= 8000, `回来后隔了 ${ts[i] - ts[i - 1]}ms`)
  back.life.stop()
})
test('下锅：爱吃的住户走到锅边吃；白天锅里有它爱吃的会自己过去吃', () => {
  const { life, clock, sprites } = make({ hour: 12, saved: { doudou: { x: 3400, y: 3600, right: true, action: 'idle', until: 0 }, nuonuo: { x: 900, y: 3600, right: true, action: 'idle', until: 0 } } })
  life.start()
  life.cook(['doudou'])
  assert.equal(sprites[0].action, 'walk')
  let fed = false
  for (let i = 0; i < 30 && !fed; i++) {
    clock.advance(1000)
    const w = life.whereIs()[0]
    fed = sprites[0].action === 'eat' && Math.hypot(w.x - SCENE.fire[0], w.y - SCENE.fire[1]) < 900
  }
  assert.ok(fed, '豆豆 30 秒里没到锅边吃')
  life.stop()
  const hungry = make({ hour: 12, seed: 13, pot: ['xiaomi'], pets: [{ id: 'doudou', level: 1, fed: 0 }] })
  hungry.life.start()
  let ate = 0
  for (let i = 0; i < 1200; i++) {
    hungry.clock.advance(1000)
    if (hungry.sprites[0] && hungry.sprites[0].action === 'eat') ate += 1
  }
  assert.ok(ate > 0, '锅里有小米，豆豆 20 分钟里没去吃')
  hungry.life.stop()
})

test('小动物放大 1.3 倍：宽度 = size × 远近 × k × 1.3', () => {
  const { life } = make()
  const s = life.sprites()[0]
  const w = life.whereIs()[0]
  assert.equal(PET_ZOOM, 1.3)
  assert.ok(Math.abs(s.width - petById('doudou').size * scaleAt(w.y) * L.k * 1.3) < 1e-9)
})

test('鹤鹤只在 5～9 点出现', () => {
  const day = make({ hour: 12, pets: [{ id: 'hehe', level: 1, fed: 0 }] })
  assert.equal(day.life.sprites()[0].hidden, true)
  assert.equal(day.life.whereIs()[0].text, '要清晨才来')
  const dawn = make({ hour: 6, pets: [{ id: 'hehe', level: 1, fed: 0 }] })
  assert.equal(dawn.life.sprites()[0].hidden, false)
})

test('点一下说话冒爱心、连点打滚、长按被摸、喂食：吃 / 嫌弃', () => {
  const { life, clock, sprites } = make()
  life.start()
  life.tap(0)
  assert.ok(sprites[0].bubble.length > 0)
  assert.equal(sprites[0].tapping, true)
  clock.advance(700)
  assert.equal(sprites[0].tapping, false)
  life.doubleTap(0)
  assert.equal(sprites[0].action, 'roll')
  clock.advance(1300)
  assert.notEqual(sprites[0].action, 'roll')
  life.longPress(1)
  assert.equal(sprites[1].action, 'pet')
  assert.equal(sprites[1].emoji, '❤️')
  clock.advance(1600)
  life.feed(0, 'xiaomi', true)
  assert.equal(sprites[0].action, 'eat')
  life.feed(1, 'xiaomi', false)
  assert.equal(sprites[1].action, 'dislike')
  assert.equal(sprites[1].bubble, petById('nuonuo').lines.dislike)
  clock.advance(2500)
  assert.notEqual(sprites[0].action, 'eat')
})

test('第一次来的（没说闻着什么）进来先说你好；庆祝时全员蹦；礼物：走到画面中间举着礼物，收下后回去', () => {
  const { life, clock, sprites } = make({ pets: [{ id: 'doudou', level: 1, home: true }] })
  life.start()
  assert.equal(life.addGuest({ id: 'nuonuo' }), 1)
  let hello = false
  for (let i = 0; i < 600 && !hello; i++) {
    clock.advance(100)
    hello = !!(sprites[1] && !sprites[1].hidden && sprites[1].bubble === '我、我是糯糯…以后请多关照')
  }
  assert.ok(hello, '糯糯没打招呼')
  clock.advance(30000)
  assert.ok(inGrass(life.whereIs()[1].x, life.whereIs()[1].y))
  life.celebrate()
  clock.advance(100)
  assert.ok(Object.values(sprites).some((s) => s.action === 'walk' || s.action === 'jump'))
  clock.advance(60000)
  assert.ok(Object.values(sprites).every((s) => s.action !== 'jump'))
  assert.equal(life.gift(0), true)
  clock.advance(30000)
  assert.equal(sprites[0].action, 'gift')
  assert.equal(sprites[0].emoji, '🎁')
  life.giftTaken()
  assert.notEqual(sprites[0].action, 'gift')
  assert.equal(life.gift(9), false)
})

test('装饰变了：正在玩的东西没了就不玩了', () => {
  const { life, clock } = make({ hour: 12, decor: [{ uid: 'd1', id: 'ball', x: 1500, y: 1800 }], seed: 3 })
  life.start()
  let played = false
  for (let i = 0; i < 80 && !played; i++) {
    clock.advance(2000)
    played = life.whereIs().some((w) => w.action === 'play')
  }
  assert.ok(played, '80 轮里没人去玩滚球')
  life.updateDecor([])
  assert.ok(life.whereIs().every((w) => w.action !== 'play'))
  life.stop()
})

test('有拼图时用拼图、按动作选行；拼图坏了退回单张图', () => {
  const { life } = make({ sheets: { doudou: { top: 0.1 } }, animBase: 'cloud://x/anim/' })
  const s = life.sprites()[0]
  assert.equal(s.sheet, 'cloud://x/anim/doudou.png') // 一只一张（A、B 上下拼着）
  assert.deepEqual([s.anim.cols, s.anim.rows, s.anim.row], [6, 12, 1])
  // 拼图里脚踩在格底往上 FOOT（pack_anim.py 对齐的）：影子的中心对着脚，不在格底（不然看着脚离地飘着）
  const center = (sp) => sp.shadow.bottom + sp.shadow.height / 2
  assert.ok(Math.abs(center(s) - (s.bottom + s.width * FOOT)) < 0.01)
  life.noSheet('doudou')
  const plain = life.sprites()[0]
  assert.equal(plain.sheet, '')
  assert.ok(Math.abs(center(plain) - plain.bottom) < 0.01) // 单张图脚就在底边
})

// 模拟一整天（几个随机种子、早中晚夜）：每走一小段，沿路取点，只要那一点身子横着挨着某样东西（抠图层的条、装饰），
// 宠物在它前面还是后面就必须和这一小段排的 z（按中点）一致；停下来歇着的地方不在锅身、提灯正后面；走的路不穿任何禁区。
// 怎么切段、怎么绕路在 camp-walk.test.js 里单独测得更细，这里看的是营地里各种走法（新住户、客人、庆祝、礼物）都走的这一套
test('走路时和锅、帐篷、提灯、装饰的前后每一刻都对；停下来的地方看得见；路不穿禁区', () => {
  const decor = [{ uid: 'd1', id: 'ball', x: 2500, y: 2300 }, { uid: 'd2', id: 'sunflowers', x: 1700, y: 3400 }, { uid: 'd3', id: 'swing', x: 3300, y: 3300 }]
  const { patchRect, decorById } = require('../miniprogram/utils/shared/decor')
  const lines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
    .concat(decor.filter((d) => decorById(d.id)).map((d) => { const r = patchRect(d.id, d.x, d.y); return { l: r.left, r: r.right, y: d.y } }))
  let pieces = 0
  let rests = 0
  const runs = []
  for (const seed of [3, 29, 57, 97]) for (const h of [8, 12, 18, 21]) runs.push([seed, h])
  for (const [seed, h] of runs) {
    const clock = manualClock()
    let life = null
    const prev = {}
    const pets = ['doudou', 'nuonuo', 'jutuan', 'guigui', 'qiqi', 'shushu'].map((id) => ({ id, level: 3, fed: 9 }))
    life = createLife({
      L, pets, decor, pot: () => ['xiaomi'], lit: () => h !== 21, hour: () => h, random: lcg(seed), clock,
      onChange: (i, sp) => {
        // 位置从精灵反推（客人不在 whereIs 里）
        const where = { id: sp.id, x: (sp.left + sp.width / 2) / L.k, y: (L.height - sp.bottom) / L.k }
        const from = prev[i]
        prev[i] = { x: where.x, y: where.y }
        if (!from || (sp.action !== 'walk' && sp.action !== 'fly' && sp.action !== 'gift') || sp.hidden) return
        if (Math.hypot(where.x - from.x, where.y - from.y) < 1) return
        pieces += 1
        const half = (petById(where.id).size * PET_ZOOM * scaleAt(Math.max(from.y, where.y))) / 2
        nogoPolys().forEach((poly) => assert.ok(!segmentHitsPoly([from.x, from.y], [where.x, where.y], poly), `${where.id} 穿过禁区 ${from.x},${from.y} → ${where.x},${where.y}`))
        const midY = (from.y + where.y) / 2
        assert.equal(sp.z, zOf(midY) + 1, `${where.id} 走路时按这一小段的中点排`)
        for (let k = 0; k <= 10; k++) {
          const x = from.x + ((where.x - from.x) * k) / 10
          const y = from.y + ((where.y - from.y) * k) / 10
          lines.forEach((o) => {
            if (x + half < o.l || x - half > o.r || Math.abs(y - o.y) < 2 || Math.abs(midY - o.y) < 2) return
            if (y > o.y !== midY > o.y) {
              assert.fail(`${where.id} 在 ${x | 0},${y | 0} 挨着 y=${o.y} 的东西，却按 ${midY | 0} 排（${from.x | 0},${from.y | 0} → ${where.x | 0},${where.y | 0}，种子 ${seed}，${h} 点）`)
            }
          })
        }
      },
    })
    life.start()
    for (let i = 0; i < 300; i++) {
      clock.advance(700)
      life.whereIs().forEach((w) => {
        if (['idle', 'sit', 'sleep', 'sun'].includes(w.action)) {
          rests += 1
          assert.ok(!hiddenAt(w.x, w.y), `${w.id} 停在被挡住的地方 ${w.x | 0},${w.y | 0}（${w.action}）`)
        }
      })
      if (i === 120) life.celebrate()
      if (i === 200) life.gift(1)
      if (i === 260) life.giftTaken()
    }
    life.stop()
  }
  assert.ok(pieces > 150, `走的步数 ${pieces}`)
  assert.ok(rests > 500, `歇着的次数 ${rests}`)
})

test('在装饰上玩、睡的宠物盖在那件装饰上面（不被窝挡住）；没暂停时 resume 不打断正在走的', () => {
  const { decorById, patchRect } = require('../miniprogram/utils/shared/decor')
  const { zOf: z } = require('../miniprogram/utils/camp-view')
  const nest = { uid: 'h1', id: 'strawbed', x: 2600, y: 3500 }
  assert.ok(decorById('strawbed').spots.length)
  let found = false
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    // 夜里去窝里睡（没去帐篷的那几回）
    const { life, clock, sprites } = make({ pets: [{ id: 'nuonuo', level: 3, fed: 9 }], decor: [nest], seed, hour: 22 })
    life.start()
    for (let i = 0; i < 200 && !found; i++) {
      clock.advance(500)
      const w = life.whereIs()[0]
      if (w.text.indexOf('草窝') !== -1 && w.action === 'sleep') {
        found = true
        assert.ok(sprites[0].z > z(nest.y), `在窝里的 z ${sprites[0].z} 应该在窝 ${z(nest.y)} 上面`)
      }
    }
    life.stop()
    if (found) break
  }
  assert.ok(found, '没等到有宠物去窝里')
  // resume：没暂停时不重新开始（正在走的不跳步）
  const { life, clock } = make({ seed: 5 })
  life.start()
  clock.advance(2500)
  const before = life.whereIs().map((w) => [w.x, w.y, w.action])
  life.resume()
  assert.deepEqual(life.whereIs().map((w) => [w.x, w.y, w.action]), before)
  life.pause()
  life.resume()
  life.stop()
  void patchRect
})

test('光、火星、萤火虫、热气这些层不挡点击（都在宠物上面）', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, '../miniprogram/pages/camp/camp.wxss'), 'utf8')
  ;['fx-fire', 'fx-fireglow', 'fx-glow', 'fx-ember', 'fx-firefly', 'fx-wisp', 'tint', 'cut'].forEach((cls) => {
    const rule = new RegExp(`\\.${cls} \\{[^}]*\\}`).exec(css)
    assert.ok(rule, cls)
    assert.match(rule[0], /pointer-events: none/, cls)
  })
})

test('拼图的来源由页面给（下到本地的文件）：还没下好用单张图，下好了 refresh 换上', () => {
  const ready = {}
  const { life, sprites } = make({ sheets: { doudou: { top: 0.2 } }, sheetSrc: (id) => ready[id] || '' })
  assert.equal(life.sprites()[0].sheet, '')
  assert.equal(life.sprites()[0].image, '/images/camp/pets/doudou.png')
  ready.doudou = 'wxfile://tmp/doudou.png'
  life.refresh('doudou')
  assert.equal(sprites[0].sheet, 'wxfile://tmp/doudou.png')
  assert.equal(sprites[0].anim.row, 1)
  // 不给 sheetSrc 就按 animBase 拼云存储的路径（预览录屏、老用法）
  const old = make({ sheets: { doudou: { top: 0.2 } }, animBase: 'cloud://x/camp/anim-v1/' })
  assert.equal(old.life.sprites()[0].sheet, 'cloud://x/camp/anim-v1/doudou.png')
})

test('夜里宠物按站的位置上色，白天不调；火没点时远处的盖上月光层、灯边的不盖；点着了照点火版的光，远处比火没点时亮、月光淡', () => {
  const day = make({ hour: 12 })
  day.life.sprites().forEach((s) => assert.equal(s.light, ''))
  // 豆豆站在远处草地上，糯糯站在画上的提灯边
  const saved = { doudou: { x: 3500, y: 3600, right: true, action: 'idle', until: 0 }, nuonuo: { x: 2700, y: 2950, right: false, action: 'idle', until: 0 } }
  const off = make({ hour: 22, lit: false, saved }).life.sprites()
  off.forEach((s) => assert.match(s.light, /^brightness\([\d.]+\) saturate\([\d.]+\) sepia\([\d.]+\)$/))
  assert.ok(off[0].moon > 0.5, `远处盖月光层 ${off[0].moon}`)
  assert.ok(off[1].moon < 0.15, `提灯边不盖 ${off[1].moon}`)
  const on = make({ hour: 22, saved }).life.sprites()
  const b = (s) => Number(/brightness\(([\d.]+)\)/.exec(s.light)[1])
  assert.ok(b(on[0]) > b(off[0]) && on[0].moon < off[0].moon, `${on[0].light}/${on[0].moon} vs ${off[0].light}/${off[0].moon}`)
  assert.ok(on[1].moon < 0.15, '提灯边火着也不盖月光')
  // 在豆豆脚边摆一盏小灯笼：月光淡下去
  const lamp = make({ hour: 22, lit: false, saved, decor: [{ uid: 'd1', id: 'lantern', x: 3560, y: 3520 }] }).life.sprites()
  assert.ok(lamp[0].moon < off[0].moon - 0.3, `${lamp[0].moon}`)
})

test('不瞬移：离开时正好走到锅后面（路过可以、停不行的地方）也站回原地，接着走出来，不在那儿歇', () => {
  const [[hx0, hy0], , [hx1, hy1]] = SCENE.hide[0]
  const x = (hx0 + hx1) / 2
  const y = (hy0 + hy1) / 2
  assert.ok(hiddenAt(x, y) && inGrass(x, y), `${x},${y}`)
  const { life, clock } = make({ hour: 12, pets: [{ id: 'doudou', level: 1, fed: 0 }], saved: { doudou: { x, y, right: true, action: 'idle', until: 0 } } })
  const w = life.whereIs()[0]
  assert.ok(Math.hypot(w.x - x, w.y - y) < 1e-6, `站回原地 ${w.x},${w.y}`)
  life.start()
  clock.advance(20000)
  const after = life.whereIs()[0]
  assert.ok(!hiddenAt(after.x, after.y), `还在锅后面 ${after.x | 0},${after.y | 0} ${after.action}`)
  life.stop()
})

test('朝向：有 C 张的往上走用背影、往下走用正面、横着走侧面；停下保持；在锅前面吃是背影；蹭你回到侧面', () => {
  const saved = { doudou: { x: 3400, y: 3700, right: true, action: 'idle', until: 0 } }
  const { life, clock, sprites } = make({ hour: 12, seed: 3, pets: [{ id: 'doudou', level: 1, fed: 0 }], saved, sheets: { doudou: { top: 0.2, c: true } }, animBase: 'cloud://x/anim/' })
  // 一只一张：哪张（a / b / c）、那张里的第几行；图一直是同一张
  const row = () => {
    assert.equal(sprites[0].sheet, 'cloud://x/anim/doudou.png')
    return [sprites[0].anim.sheet, sprites[0].anim.row % 6]
  }
  life.start()
  // 往上走（远离镜头）
  assert.equal(life.goTo(0, 3450, 3150, 60000), true)
  assert.deepEqual(row(), ['c', 0])
  clock.advance(20000)
  assert.equal(sprites[0].action, 'idle')
  assert.deepEqual(row(), ['c', 2], '停下背对着站')
  // 往下走（朝镜头）
  life.goTo(0, 3400, 3750, 60000)
  assert.deepEqual(row(), ['c', 1])
  clock.advance(20000)
  assert.deepEqual(row(), ['c', 5], '停下正面站着')
  // 横着走
  life.goTo(0, 2600, 3800, 60000)
  assert.deepEqual(row(), ['a', 0])
  clock.advance(20000)
  // 点它：蹭你（B 张），之后待机回到侧面
  life.doubleTap(0)
  assert.deepEqual(row(), ['b', 1])
  // 下锅了：从锅前面走过去吃，面朝锅 = 背影吃
  life.cook(['doudou'])
  for (let i = 0; i < 60 && sprites[0].action !== 'eat'; i++) clock.advance(500)
  assert.equal(sprites[0].action, 'eat')
  const w = life.whereIs()[0]
  if (w.y > SCENE.fire[1] + 60) assert.deepEqual(row(), ['c', 3])
  else assert.deepEqual(row(), ['a', 4])
  life.stop()
  // 没有 C 张：照旧用 A 张侧面走
  const plain = make({ hour: 12, pets: [{ id: 'doudou', level: 1, fed: 0 }], saved, sheets: { doudou: { top: 0.2 } }, animBase: 'cloud://x/anim/' })
  plain.life.start()
  plain.life.goTo(0, 3450, 3150, 60000)
  assert.equal(plain.sprites[0].sheet, 'cloud://x/anim/doudou.png')
  assert.deepEqual([plain.sprites[0].anim.sheet, plain.sprites[0].anim.row, plain.sprites[0].anim.rows], ['a', 0, 12])
  plain.life.stop()
})

// ---------------------------------------------------------------- 和家具玩

const PARTS = require('../miniprogram/utils/decor-parts')
const sways = (id) => PARTS[id] || null
const D = require('../miniprogram/utils/shared/decor')

// 家具上的点在哪（画的像素）：块按远近缩放、anchor 对准落脚点
function spotOf(p, i = 0) {
  const d = D.decorById(p.id)
  const s = scaleAt(p.y)
  return { x: p.x + (d.spots[i].x - d.anchor.x) * s, y: p.y + (d.spots[i].y - d.anchor.y) * s }
}

function until(clock, fn, ms = 500, max = 400) {
  for (let i = 0; i < max; i++) {
    if (fn()) return true
    clock.advance(ms)
  }
  return fn()
}

test('秋千：叫一只来荡秋千 → 坐到座位上跟着座位绕横梁摆（轴对得上）、没有影子，荡整数个来回下来就不摆了；没有座位那层坐着不摆', () => {
  const swing = { uid: 's1', id: 'swing', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ decor: [swing], sways, seed: 4 })
  life.start()
  const r = life.callTo('s1')
  assert.equal(r.ok, true)
  assert.equal(r.action, 'swing')
  const i = r.index
  assert.ok(until(clock, () => sprites[i] && sprites[i].sway), '没坐上秋千')
  const sp = sprites[i]
  const w = life.whereIs()[i]
  const seat = spotOf(swing)
  assert.ok(Math.hypot(w.x - seat.x, w.y - seat.y) < 1, '没坐在座位上')
  assert.equal(w.action, 'sit')
  assert.equal(w.text, '在荡秋千')
  assert.equal(sp.sway.uid, 's1')
  assert.equal(sp.sway.cls, 'sway-on')
  assert.equal(sp.shadow.width, 0)
  // 轴：这只的框（左边 left、上边 = 底边往上 width）+ ox / oy = 秋千横梁上的那一点
  const d = D.decorById('swing')
  const s = scaleAt(swing.y)
  const px = (swing.x + (PARTS.swing.pivot[0] * d.patch.w - d.anchor.x) * s) * L.k
  const py = (swing.y + (PARTS.swing.pivot[1] * d.patch.h - d.anchor.y) * s) * L.k
  assert.ok(Math.abs(sp.left + sp.sway.ox - px) < 0.2)
  assert.ok(Math.abs(L.height - sp.bottom - sp.width + sp.sway.oy - py) < 0.2)
  // 坐在秋千上排在秋千（和座位那层）上面
  assert.ok(sp.z > zOf(swing.y) + 1)
  // 荡整数个来回（1.6 秒一个），下来就不摆了
  const start = clock.now()
  assert.ok(until(clock, () => !sprites[i].sway, 100, 400))
  const ms = clock.now() - start
  assert.ok(ms >= 5 * 1600 - 100 && ms <= 9 * 1600 + 100, `荡了 ${ms}ms`)
  assert.ok(sprites[i].shadow.width > 0)
  // 再叫一次，坐上去以后秋千挪走了：下来，不摆了
  const again = life.callTo('s1')
  assert.ok(again.ok, JSON.stringify(again))
  assert.ok(until(clock, () => Object.values(sprites).some((x) => x.sway)), JSON.stringify(life.whereIs()))
  life.updateDecor([{ ...swing, x: 1500 }])
  assert.ok(Object.values(sprites).every((x) => !x.sway))
  life.stop()
  // 没有座位那层（云端高清块没用上）：坐上去，不摆
  const plain = make({ decor: [swing], seed: 4 })
  plain.life.start()
  const r2 = plain.life.callTo('s1')
  assert.ok(until(plain.clock, () => plain.life.whereIs()[r2.index].text === '在荡秋千'))
  assert.equal(plain.sprites[r2.index].sway, null)
  plain.life.stop()
})

test('花：叫一只来闻闻花 → 站在花前（落脚框外）低头闻，抬头开心、冒 🌸 或 🦋', () => {
  const bed = { uid: 'f1', id: 'lavender', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ decor: [bed], seed: 2 })
  life.start()
  const r = life.callTo('f1')
  assert.equal(r.action, 'sniff')
  assert.ok(until(clock, () => life.whereIs()[r.index].text === '在闻薰衣草丛'), '没去闻花')
  const w = life.whereIs()[r.index]
  assert.equal(w.action, 'eat')
  assert.ok(w.y > bed.y, '应该站在花前面')
  assert.ok(until(clock, () => sprites[r.index].action === 'happy', 100, 60))
  assert.ok(['🌸', '🦋'].indexOf(sprites[r.index].emoji) !== -1)
  life.stop()
})

test('一排向日葵：叫两只过来各站一个位置闻；位置满了、都睡着了、没什么好玩的叫不来', () => {
  const row = { uid: 'm1', id: 'sunflowers', x: 2600, y: 3500 }
  const { life, clock } = make({ decor: [row, { uid: 'l1', id: 'lights', x: 1300, y: 3500 }], seed: 6 })
  life.start()
  const a = life.callTo('m1')
  const b = life.callTo('m1')
  assert.ok(a.ok && b.ok && a.index !== b.index)
  const where = {}
  assert.ok(until(clock, () => {
    life.whereIs().forEach((w) => {
      if (w.text === '在闻一排向日葵') where[w.id] = `${Math.round(w.x)},${Math.round(w.y)}`
    })
    return Object.keys(where).length === 2
  }, 200), '两只没都去闻向日葵')
  assert.equal(new Set(Object.values(where)).size, 2, '两只站在同一个位置上了')
  assert.deepEqual(life.callTo('l1'), { ok: false, reason: 'none' })
  life.stop()
  // 秋千只有一个座位：坐着一只，再叫叫不来
  const swing = make({ decor: [{ uid: 's1', id: 'swing', x: 2600, y: 3500 }], seed: 3 })
  swing.life.start()
  assert.equal(swing.life.callTo('s1').ok, true)
  assert.deepEqual(swing.life.callTo('s1'), { ok: false, reason: 'busy' })
  swing.life.stop()
  // 睡着的不叫
  const sleepy = make({ pets: [{ id: 'doudou', level: 1 }], decor: [row], hour: 22, lit: false, saved: { doudou: { x: 2000, y: 3400, right: true, action: 'sleep', until: 10 ** 12 } } })
  assert.deepEqual(sleepy.life.callTo('m1'), { ok: false, reason: 'asleep' })
})

test('自己去玩：白天会去荡秋千、闻花；火没着的夜里不去家具上玩', () => {
  const decor = [{ uid: 's1', id: 'swing', x: 2600, y: 3500 }, { uid: 'f1', id: 'sunflower', x: 1300, y: 3500 }]
  const seen = new Set()
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { life, clock } = make({ decor, sways, seed })
    life.start()
    for (let i = 0; i < 300; i++) {
      clock.advance(1000)
      life.whereIs().forEach((w) => {
        if (/在荡|在闻/.test(w.text)) seen.add(w.text)
      })
    }
    life.stop()
  }
  assert.ok(seen.has('在荡秋千') && seen.has('在闻向日葵'), [...seen].join('、'))
  const night = make({ decor, sways, hour: 22, lit: false, seed: 2 })
  night.life.start()
  for (let i = 0; i < 300; i++) {
    night.clock.advance(1000)
    assert.ok(night.life.whereIs().every((w) => !/在荡|在闻/.test(w.text)))
  }
  night.life.stop()
})

test('水壶炉：叫两只来，各坐一边、面朝水壶，喝茶（低头喝一口冒 🍵）', () => {
  const kettle = { uid: 't1', id: 'kettle', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ decor: [kettle], seed: 9 })
  life.start()
  const a = life.callTo('t1')
  const b = life.callTo('t1')
  assert.ok(a.ok && b.ok && a.action === 'tea')
  const sipped = new Set()
  assert.ok(until(clock, () => {
    Object.entries(sprites).forEach(([i, sp]) => {
      if (sp.emoji === '🍵' && sp.action === 'eat') sipped.add(i)
    })
    return sipped.size === 2
  }, 200, 300), '两只没都喝上')
  const w = life.whereIs()
  assert.ok(w.every((x) => x.text === '在喝热茶'))
  // 一左一右，都面朝水壶
  const left = w.find((x) => x.x < kettle.x)
  const right = w.find((x) => x.x > kettle.x)
  assert.ok(left && right)
  assert.equal(sprites[left.index].flip, false)
  assert.equal(sprites[right.index].flip, true)
  life.stop()
})

test('自己开口：很少（4～8 分钟一次），说的时候不走开、气泡带头像和指着它的尖角；屏幕上从不同时有两个气泡；停了就不说', () => {
  const today = { logged: 2, onTime: 2, allDone: false, allOnTime: false, open: '', streak: 5, kcal: 800, budget: 1240 }
  const { life, clock, sprites } = make({ pets: [{ id: 'doudou', level: 1 }, { id: 'huahua', level: 1 }, { id: 'jutuan', level: 1 }], today: () => today, seed: 11 })
  life.start()
  const said = []
  for (let i = 0; i < 3600; i++) {
    const before = Object.values(sprites).map((sp) => sp.bubble)
    clock.advance(1000)
    const bubbles = Object.values(sprites).filter((sp) => sp.bubble && !sp.hidden)
    assert.ok(bubbles.length <= 1, `同时有 ${bubbles.length} 个气泡：${bubbles.map((b) => b.bubble).join(' / ')}`)
    Object.values(sprites).forEach((sp, k) => {
      if (!sp.bubble || before[k] === sp.bubble) return
      said.push(sp.bubble)
      // 气泡：头像是它的，尖角在气泡里、指着它的中间
      assert.ok(sp.face.endsWith(`${sp.id}-face.png`))
      assert.ok(sp.tailLeft >= 16 && sp.tailLeft <= sp.bubbleWidth - 16)
      assert.ok(Math.abs(sp.bubbleLeft + sp.tailLeft - sp.width / 2) < 1 || sp.tailLeft === 16 || sp.tailLeft === sp.bubbleWidth - 16)
    })
  }
  // 一个小时：自己开口七八句到十几句（10/29 用户嫌勤，以前 45～90 秒一句）
  assert.ok(said.length >= 5 && said.length <= 20, `一小时说了 ${said.length} 句：${said.join(' / ')}`)
  assert.ok(said.every((l) => l.length <= 16), said.filter((l) => l.length > 16).join(' / '))
  life.stop()
  assert.equal(clock.count(), 0)
})

test('点它说一段：两三句一句一句换，再点跳到下一句；别的气泡收起来；说过的十来句不重复', () => {
  const today = { logged: 2, onTime: 2, allDone: false, allOnTime: false, open: '', streak: 5, kcal: 800, budget: 1240 }
  const { life, clock, sprites } = make({ pets: [{ id: 'chacha', level: 3 }, { id: 'huahua', level: 1 }], today: () => today, seed: 5 })
  life.start()
  clock.advance(3000)
  life.tap(1)
  const other = sprites[1].bubble
  assert.ok(other)
  life.tap(0)
  assert.equal(sprites[1].bubble, '', '点了茶茶，花花的气泡收起来')
  const first = sprites[0].bubble
  assert.ok(first && first.length <= 16)
  // 一段至少两句：等一会儿换下一句（或者再点直接跳）
  life.tap(0)
  assert.notEqual(sprites[0].bubble, first, '再点没跳到下一句')
  // 说完：气泡收起
  clock.advance(20000)
  assert.equal(sprites[0].bubble, '')
  // 点 8 次（每次说完一整段）：说过的句子不重复（每只记得最近 12 句）
  const lines = []
  for (let n = 0; n < 8; n++) {
    life.tap(0)
    let guard = 0
    while (sprites[0].bubble && guard++ < 40) {
      if (lines[lines.length - 1] !== sprites[0].bubble) lines.push(sprites[0].bubble)
      clock.advance(500)
    }
  }
  const firsts = new Set(lines)
  assert.ok(firsts.size >= lines.length - 3, `重复太多：${lines.join(' / ')}`)
  // 刚说完两分钟内谁也不自己开口：camp-bubbles.test.js
  life.stop()
})

test('锅里空着：没住下的常客回去了（一开始就不在），住下的留下来喊饿；下锅后谁回来由云函数说（addGuest），排着队从画的两边进来先去锅边吃', () => {
  const pot = []
  const pets = [{ id: 'doudou', level: 1, home: true }, { id: 'nuonuo', level: 3 }, { id: 'qiqi', level: 2 }, { id: 'shushu', level: 5, home: true }]
  const { life, clock, sprites } = make({ pets, pot, seed: 4 })
  const where = () => life.whereIs()
  // 进来时：住下的豆豆、薯薯在，常客糯糯、杞杞回去了
  assert.deepEqual(where().filter((w) => w.action !== 'away').map((w) => w.id), ['doudou', 'shushu'])
  assert.ok(where().filter((w) => w.action === 'away').every((w) => w.text === '锅里空空的，回去了'))
  assert.deepEqual(life.hungryAway().sort(), ['杞杞', '糯糯'])
  life.start()
  const hungry = []
  for (let i = 0; i < 600; i++) {
    clock.advance(1000)
    if (sprites[0] && sprites[0].bubble && hungry[hungry.length - 1] !== sprites[0].bubble) hungry.push(sprites[0].bubble)
  }
  assert.ok(hungry.some((l) => /饿|咕咕|没吃的|开饭/.test(l)), `豆豆没喊饿：${hungry.join(' / ')}`)
  assert.ok(where().filter((w) => !['doudou', 'shushu'].includes(w.id)).every((w) => w.action === 'away'))
  // 下锅：锅里有吃的了，回去的不会自己回来（不爱吃这样的话就不来）
  pot.push('xiaomi')
  life.cook(['doudou'])
  clock.advance(60000)
  assert.ok(where().filter((w) => !['doudou', 'shushu'].includes(w.id)).every((w) => w.action === 'away'))
  assert.deepEqual(life.hungryAway(), [], '锅里有吃的了就不提示')
  // 云函数说糯糯、杞杞闻着香味来了：排着队从画的两边回来，说一句、去锅边吃
  life.addGuest({ id: 'nuonuo', foodId: 'xiaomi' })
  life.addGuest({ id: 'qiqi', foodId: 'xiaomi' })
  const back = {}
  for (let i = 0; i < 1500; i++) {
    clock.advance(40)
    Object.values(sprites).forEach((sp) => {
      if (!sp.hidden && ['nuonuo', 'qiqi'].includes(sp.id) && !(sp.id in back)) {
        back[sp.id] = i * 40
        assert.ok(atSideEdge(sp), `${sp.id} 从 ${centerX(sp)} 进来`)
      }
    })
  }
  assert.deepEqual(Object.keys(back).sort(), ['nuonuo', 'qiqi'])
  const order = Object.values(back).sort((a, b) => a - b)
  assert.ok(order[0] >= 4000 && order[0] <= 10500, String(order[0]))
  assert.ok(order[1] - order[0] >= 8000, order.join(','))
  life.stop()
  // 没有住下的：常客都回去了，营地可以空着
  const lonely = make({ pets: [{ id: 'qiqi', level: 1 }, { id: 'nuonuo', level: 1 }], pot: [], seed: 2 })
  assert.deepEqual(lonely.life.whereIs().filter((w) => w.action !== 'away').map((w) => w.id), [])
})
test('锅空了的时候在场的常客会走：说一句「回去了」，走到最近的一边藏起来；住下的不走', () => {
  const pot = ['xiaomi']
  const { life, clock, sprites } = make({ pets: [{ id: 'doudou', level: 4, home: true }, { id: 'qiqi', level: 1 }], pot, seed: 6 })
  life.start()
  clock.advance(3000)
  assert.equal(sprites[1] ? sprites[1].hidden : false, false)
  pot.length = 0 // 锅到期了
  let left = false
  let line = ''
  for (let i = 0; i < 300 && !left; i++) {
    clock.advance(500)
    if (sprites[1] && sprites[1].bubble) line = sprites[1].bubble
    left = !!(sprites[1] && sprites[1].hidden)
  }
  assert.ok(left, '杞杞没走')
  assert.ok(/回去|没吃的/.test(line), line)
  assert.equal(life.whereIs()[1].text, '锅里空空的，回去了')
  clock.advance(60000)
  assert.equal(sprites[0].hidden, false, '住下的豆豆不走')
  life.stop()
})
test('离开营地前 freeze：走到一半的就地停下（按出发时间算出这会儿在哪、不带过渡、站着），记下的就是那儿；回来不滑（10/29 切回营地全在漂移）', () => {
  const { life, clock, sprites } = make({ seed: 3 })
  life.start()
  // 等到有一只正在走、刚走了一部分
  let i = -1
  for (let n = 0; n < 600 && i === -1; n++) {
    clock.advance(100)
    const hit = Object.entries(sprites).find(([, sp]) => sp && sp.action === 'walk' && sp.duration > 1500)
    i = hit ? Number(hit[0]) : -1
  }
  assert.ok(i !== -1, '没等到走路的')
  const before = life.whereIs()[i]
  const to = { left: sprites[i].left, bottom: sprites[i].bottom }
  clock.advance(500)
  life.freeze()
  const sp = sprites[i]
  assert.equal(sp.duration, 0, '停下不带过渡')
  assert.notEqual(sp.action, 'walk')
  const at = life.whereIs()[i]
  // 停在出发点和终点之间（不是终点）
  assert.ok(Math.abs(sp.left - to.left) > 0.5 || Math.abs(sp.bottom - to.bottom) > 0.5, '停在了终点')
  const saved = life.snapshot()
  assert.ok(Math.abs(saved[at.id].x - at.x) < 1e-6 && Math.abs(saved[at.id].y - at.y) < 1e-6)
  assert.ok(before)
  life.stop()
  // 回来：站在停下的地方
  const back = make({ saved, seed: 3 })
  const w = back.life.whereIs().find((x) => x.id === at.id)
  assert.ok(Math.hypot(w.x - at.x, w.y - at.y) < 1, `回来不在停下的地方：${JSON.stringify(w)} vs ${JSON.stringify(at)}`)
  // 站着的、睡着的不动
  const still = make({ seed: 5 })
  const pos = still.life.sprites().map((p) => [p.left, p.bottom])
  still.life.freeze()
  assert.deepEqual(still.life.sprites().map((p) => [p.left, p.bottom]), pos)
})

// ---------------------------------------------------------------- 帐篷里睡

const TENT_FRONT = cutoutStrips().filter((c) => c.cut === 'tent')
const bedOf = (w) => SCENE.tent.beds.find((b) => Math.hypot(b.at[0] - w.x, b.at[1] - w.y) < 1) || null

test('困了多半去大帐篷里睡：走到门口 → 背对着站一下 → 趴在帐篷里只露个小脑袋（正面那帧裁掉下半截、没影子、💤、排在帐篷前面）；睡够了出来站在门口再走', () => {
  let done = false
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { life, clock, sprites } = make({ pets: [{ id: 'nuonuo', level: 2 }], seed, hour: 22, sheets: { nuonuo: { top: 0.31, c: true } }, animBase: 'cloud://x/anim/' })
    life.start()
    let atDoorBack = false
    const ok = until(clock, () => {
      const w = life.whereIs()[0]
      const sp = sprites[0]
      if (sp && w.action === 'idle' && sp.anim && sp.anim.sheet === 'c' && sp.anim.row === 14 && SCENE.tent.beds.some((b) => Math.hypot(b.door[0] - w.x, b.door[1] - w.y) < 1)) atDoorBack = true
      return w.text === '在帐篷里睡觉'
    }, 200, 1200)
    if (!ok) {
      life.stop()
      continue
    }
    done = true
    assert.ok(atDoorBack, '进去前没在门口背对着站一下')
    const w = life.whereIs()[0]
    const bed = bedOf(w)
    assert.ok(bed, `趴的地方 ${w.x | 0},${w.y | 0} 不是床位`)
    assert.ok(pointInPoly(w.x, w.y, SCENE.nogo.tent), '床位在帐篷里')
    const sp = sprites[0]
    assert.equal(sp.action, 'tent')
    assert.equal(sp.emoji, '💤')
    assert.equal(sp.shadow.width, 0)
    assert.equal(sp.flip, false)
    // 正面站着那帧（C 张第 6 行 = 整张的第 18 行）；头顶 0.31、脚 0.9：露 42% 就裁掉 65%，再往下挪 55%（裁的边正好落在脚那条线上）
    assert.deepEqual([sp.anim.sheet, sp.anim.row], ['c', 17])
    assert.equal(sp.tentStyle, 'clip-path: inset(0 0 65% 0); -webkit-clip-path: inset(0 0 65% 0); transform: translateY(55%)')
    // 排在它横着跨到的每一条帐篷前面
    const half = sp.width / L.k / 2
    TENT_FRONT.filter((c) => c.r > w.x - half && c.l < w.x + half).forEach((c) => assert.ok(sp.z > zOf(c.zy), `被帐篷的条 ${c.key}（${c.zy}）挡住了`))
    // 睡够了（夜里 1～5 分钟）：出来站在门口、面朝我们，接着该干嘛干嘛（不会站在禁区里）
    assert.ok(until(clock, () => life.whereIs()[0].action !== 'tent', 1000, 400), '没醒')
    const out = life.whereIs()[0]
    assert.ok(Math.hypot(bed.door[0] - out.x, bed.door[1] - out.y) < 1, `醒了应该站在门口，却在 ${out.x | 0},${out.y | 0}`)
    assert.equal(sprites[0].tentStyle, '')
    assert.ok(sprites[0].shadow.width > 0)
    assert.ok(until(clock, () => sprites[0].action === 'walk', 500, 200), '醒了以后不走了')
    life.stop()
    break
  }
  assert.ok(done, '8 个种子都没去帐篷里睡')
})

test('帐篷里：点它就醒、出来站在门口；切走再回来（snapshot / saved）没睡完接着趴在里面，睡完了站在门口；床位一只一个；没有 C 张用单张图照样裁', () => {
  const bed = SCENE.tent.beds[0]
  const clock = manualClock()
  const future = clock.now() + 3600000
  const saved = { nuonuo: { x: bed.at[0], y: bed.at[1], right: true, action: 'tent', until: future } }
  const { life, sprites } = make({ pets: [{ id: 'nuonuo', level: 2 }], saved, hour: 22, clock })
  const sp = life.sprites()[0]
  assert.equal(sp.action, 'tent')
  assert.equal(sp.sheet, '')
  // 单张图：头顶 0.05、脚在底边：裁 60%、挪 60%
  assert.equal(sp.tentStyle, 'clip-path: inset(0 0 60% 0); -webkit-clip-path: inset(0 0 60% 0); transform: translateY(60%)')
  assert.equal(sp.shadow.width, 0)
  assert.equal(life.whereIs()[0].text, '在帐篷里睡觉')
  // 记下来还是在帐篷里
  assert.deepEqual(life.snapshot().nuonuo, { x: bed.at[0], y: bed.at[1], right: true, action: 'tent', until: future, sleepStyle: 'A' })
  // 第二只来了：这个床位有人，去另一个
  const two = make({ pets: [{ id: 'nuonuo', level: 2 }, { id: 'doudou', level: 1, home: true }], saved, hour: 22, seed: 3, clock })
  assert.equal(two.life.whereIs()[0].action, 'tent')
  two.life.stop()
  // 点它：醒了、先出来站在门口（这一帧不带过渡），下一拍开心一下
  life.start()
  life.tap(0)
  const w = life.whereIs()[0]
  assert.ok(Math.hypot(bed.door[0] - w.x, bed.door[1] - w.y) < 1, `应该站在门口，却在 ${w.x | 0},${w.y | 0}`)
  assert.deepEqual([sprites[0].action, sprites[0].duration, sprites[0].tentStyle, sprites[0].flip], ['idle', 0, '', false])
  assert.ok(sprites[0].shadow.width > 0)
  clock.advance(100)
  assert.equal(sprites[0].action, 'happy')
  assert.equal(sprites[0].bubble, '嗯…？醒啦')
  life.stop()
  // 睡完了才回来：站在门口
  const late = make({ pets: [{ id: 'nuonuo', level: 2 }], saved: { nuonuo: { ...saved.nuonuo, until: 1 } }, hour: 12, clock })
  const lw = late.life.whereIs()[0]
  assert.equal(lw.action, 'idle')
  assert.ok(Math.hypot(bed.door[0] - lw.x, bed.door[1] - lw.y) < 1)
  // 床位的 x / y 乱写的不认（站回火边）
  const bad = make({ pets: [{ id: 'nuonuo', level: 2 }], saved: { nuonuo: { x: 1500, y: 1300, right: true, action: 'tent', until: future } }, hour: 12, clock })
  assert.ok(!pointInPoly(bad.life.whereIs()[0].x, bad.life.whereIs()[0].y, SCENE.nogo.tent))
})
