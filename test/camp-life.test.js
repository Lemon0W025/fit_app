// test/camp-life.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife, depthCuts, PET_ZOOM } = require('../miniprogram/utils/camp-life')
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
    L, pets: opts.pets || [{ id: 'doudou', level: 1, fed: 0 }, { id: 'nuonuo', level: 2, fed: 3 }], decor: opts.decor || [], arrivals: opts.arrivals || [],
    visitors: opts.visitors || [], saved: opts.saved || null, pot: () => opts.pot || ['xiaomi'], // 默认锅里煮着东西（锅空着时不够亲的会走开，单独测）
    hour: () => (opts.hour === undefined ? 12 : opts.hour), lit: () => opts.lit !== false, random: lcg(opts.seed || 7), clock: opts.clock || clock,
    onChange: (i, s) => { sprites[i] = s }, sheets: opts.sheets || {}, animBase: opts.animBase || '', sheetSrc: opts.sheetSrc, bad: new Set(),
    sways: opts.sways, today: opts.today,
  })
  return { life, clock, sprites }
}

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
    life.whereIs().forEach((w) => assert.ok(inGrass(w.x, w.y) || w.action === 'sun' || w.action === 'sit', `${w.id} 站到了 ${w.x},${w.y}`))
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

test('客人：从营地边上进来、在锅边转悠，不睡、不在「找它」里；点它说闻着什么来的；addVisitor 加在最后', () => {
  const { life, clock, sprites } = make({ hour: 23, lit: false, visitors: [{ id: 'sunbao', foodId: 'zhusun' }] })
  const start = life.sprites()[2]
  assert.equal(start.visitor, true)
  assert.ok(SCENE.entries.some(([x, y]) => Math.abs(x * L.k - (start.left + start.width / 2)) < 1 && Math.abs(y * L.k - (L.height - start.bottom)) < 1))
  assert.deepEqual(life.whereIs().map((w) => w.id), ['doudou', 'nuonuo'])
  life.start()
  let sniffed = false
  for (let i = 0; i < 1800; i++) {
    clock.advance(1000)
    assert.notEqual(sprites[2] && sprites[2].action, 'sleep')
    // 客人闻着香味说的，带着它闻着的那样（笋宝是活泼的口气，pet-talk.js 的 SNIFF）
    if (sprites[2] && /竹笋/.test(sprites[2].bubble) && sprites[2].action === 'fidget') sniffed = true
  }
  assert.ok(sniffed, '客人没在锅边闻')
  // 点客人：先说闻着什么来的，再说你拍正餐它就住下（一句一句换）
  life.tap(2)
  assert.match(sprites[2].bubble, /竹笋/)
  clock.advance(5000)
  assert.equal(sprites[2].bubble, '你拍正餐，我就住下！')
  assert.equal(life.addVisitor({ id: 'nuonuo', foodId: 'huluobo' }), 1, '已经在的不加')
  assert.equal(life.addVisitor({ id: 'qiqi', foodId: 'kaohongshu' }), 3)
  assert.equal(sprites[3].visitor, true)
  clock.advance(100)
  assert.equal(sprites[3].action, 'walk')
  assert.ok('qiqi' in life.snapshot())
  life.stop()
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

test('新住户从树林边走进来，先说你好；庆祝时全员蹦；礼物：走到画面中间举着礼物，收下后回去', () => {
  const { life, clock, sprites } = make({ arrivals: ['nuonuo'] })
  const start = life.sprites()[1]
  assert.ok(SCENE.entries.some(([x, y]) => Math.abs(x * L.k - (start.left + start.width / 2)) < 1 && Math.abs(y * L.k - (L.height - start.bottom)) < 1))
  assert.equal(start.bubble, '我、我是糯糯…以后请多关照')
  life.start()
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

test('depthCuts：跨过挨着的那条线就切开，旁边经过、不跨的不切', () => {
  const lines = [{ l: 1416, r: 2668, y: 2820 }, { l: 100, r: 200, y: 3000 }]
  const cuts = depthCuts({ x: 1350, y: 2600 }, { x: 1350, y: 3100 }, 100, lines)
  assert.equal(cuts.length, 1)
  assert.equal(cuts[0].y, 2820)
  assert.equal(cuts[0].x, 1350)
  assert.equal(depthCuts({ x: 1000, y: 2600 }, { x: 1000, y: 3100 }, 100, lines).length, 0) // 离锅远，身子挨不着
  assert.equal(depthCuts({ x: 1350, y: 2900 }, { x: 1500, y: 3100 }, 100, lines).length, 0) // 一直在锅前面
  assert.deepEqual(depthCuts({ x: 1300, y: 2700 }, { x: 1600, y: 3200 }, 100, lines).map((c) => Math.round(c.y)), [2820])
  // 斜着走：跨线时离锅还远，走着走着挨上了锅，也要在跨线处切开（不然后半段按前半段排）
  assert.deepEqual(depthCuts({ x: 3833, y: 3643 }, { x: 2524, y: 2300 }, 120, lines).map((c) => Math.round(c.y)), [2820])
  // 一整段都在锅的左边、挨不着：不切
  assert.deepEqual(depthCuts({ x: 700, y: 2600 }, { x: 1100, y: 3100 }, 100, lines), [])
  // 跨线的地方离端点不到 1 像素才算没跨（长路上离端点 30 像素的跨线也要切）
  assert.deepEqual(depthCuts({ x: 2000, y: 2832 }, { x: 2000, y: 1300 }, 100, lines).map((c) => c.y), [2820])
  const both = depthCuts({ x: 160, y: 2700 }, { x: 160, y: 3200 }, 100, [{ l: 100, r: 200, y: 3000 }, { l: 0, r: 300, y: 2800 }])
  assert.deepEqual(both.map((c) => c.y), [2800, 3000])
})

// 模拟一整天（多种随机种子、早中晚夜）：每走一小段，沿路取点，只要那一点身子横着挨着某样东西（抠图层的条、装饰），
// 宠物在它前面还是后面就必须和这一小段排的 z（按中点）一致；停下来歇着的地方不在锅身、提灯正后面；走的路不穿任何禁区
test('走路时和锅、帐篷、提灯、装饰的前后每一刻都对；停下来的地方看得见；路不穿禁区', () => {
  const decor = [{ uid: 'd1', id: 'ball', x: 2500, y: 2300 }, { uid: 'd2', id: 'flowerbed', x: 1700, y: 3400 }, { uid: 'd3', id: 'hammock', x: 3300, y: 3300 }]
  const { patchRect, decorById } = require('../miniprogram/utils/shared/decor')
  const lines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
    .concat(decor.filter((d) => decorById(d.id)).map((d) => { const r = patchRect(d.id, d.x, d.y); return { l: r.left, r: r.right, y: d.y } }))
  let pieces = 0
  let rests = 0
  const runs = []
  for (const seed of [3, 11, 29, 41, 57, 73, 97, 131]) for (const h of [8, 12, 18, 21]) runs.push([seed, h])
  for (const [seed, h] of runs) {
    const clock = manualClock()
    let life = null
    const prev = {}
    const pets = ['doudou', 'nuonuo', 'jutuan', 'guigui', 'qiqi', 'shushu'].map((id) => ({ id, level: 3, fed: 9 }))
    life = createLife({
      L, pets, decor, arrivals: ['qiqi'], visitors: [{ id: 'sunbao', foodId: 'zhusun' }], pot: () => ['xiaomi'], lit: () => h !== 21, hour: () => h, random: lcg(seed), clock,
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
  assert.ok(pieces > 300, `走的步数 ${pieces}`)
  assert.ok(rests > 1000, `歇着的次数 ${rests}`)
})

test('在装饰上玩、睡的宠物盖在那件装饰上面（不被吊床、窝挡住）；没暂停时 resume 不打断正在走的', () => {
  const { decorById, patchRect } = require('../miniprogram/utils/shared/decor')
  const { zOf: z } = require('../miniprogram/utils/camp-view')
  const hammock = { uid: 'h1', id: 'hammock', x: 2600, y: 3500 }
  assert.ok(decorById('hammock').spots.length)
  let found = false
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    // 夜里先去窝里睡（吊床是睡觉的地方）
    const { life, clock, sprites } = make({ pets: [{ id: 'nuonuo', level: 3, fed: 9 }], decor: [hammock], seed, hour: 22 })
    life.start()
    for (let i = 0; i < 200 && !found; i++) {
      clock.advance(500)
      const w = life.whereIs()[0]
      if (w.text.indexOf('吊床') !== -1 && w.action === 'sleep') {
        found = true
        assert.ok(sprites[0].z > z(hammock.y), `在吊床上的 z ${sprites[0].z} 应该在吊床 ${z(hammock.y)} 上面`)
      }
    }
    life.stop()
    if (found) break
  }
  assert.ok(found, '没等到有宠物去吊床上')
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
  const bed = { uid: 'f1', id: 'flowerbed', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ decor: [bed], seed: 2 })
  life.start()
  const r = life.callTo('f1')
  assert.equal(r.action, 'sniff')
  assert.ok(until(clock, () => life.whereIs()[r.index].text === '在闻花坛'), '没去闻花')
  const w = life.whereIs()[r.index]
  assert.equal(w.action, 'eat')
  assert.ok(w.y > bed.y, '应该站在花坛前面')
  assert.ok(until(clock, () => sprites[r.index].action === 'happy', 100, 60))
  assert.ok(['🌸', '🦋'].indexOf(sprites[r.index].emoji) !== -1)
  life.stop()
})

test('野餐垫：叫两只过来各坐一个位置（坐着或吃点心）；位置满了、都睡着了、没什么好玩的叫不来', () => {
  const mat = { uid: 'm1', id: 'picnic', x: 2600, y: 3500 }
  const { life, clock } = make({ decor: [mat, { uid: 'l1', id: 'lights', x: 1300, y: 3500 }], seed: 6 })
  life.start()
  const a = life.callTo('m1')
  const b = life.callTo('m1')
  assert.ok(a.ok && b.ok && a.index !== b.index)
  assert.ok(until(clock, () => life.whereIs().every((w) => /野餐垫/.test(w.text))), '两只没都坐到野餐垫上')
  const spots = life.whereIs().map((w) => `${Math.round(w.x)},${Math.round(w.y)}`)
  assert.equal(new Set(spots).size, 2, '两只坐在同一个位置上了')
  assert.ok(life.whereIs().every((w) => w.action === 'sit' || w.action === 'eat'))
  assert.deepEqual(life.callTo('l1'), { ok: false, reason: 'none' })
  life.stop()
  // 秋千只有一个座位：坐着一只，再叫叫不来
  const swing = make({ decor: [{ uid: 's1', id: 'swing', x: 2600, y: 3500 }], seed: 3 })
  swing.life.start()
  assert.equal(swing.life.callTo('s1').ok, true)
  assert.deepEqual(swing.life.callTo('s1'), { ok: false, reason: 'busy' })
  swing.life.stop()
  // 睡着的不叫
  const sleepy = make({ pets: [{ id: 'doudou', level: 1 }], decor: [mat], hour: 22, lit: false, saved: { doudou: { x: 2000, y: 3400, right: true, action: 'sleep', until: 10 ** 12 } } })
  assert.deepEqual(sleepy.life.callTo('m1'), { ok: false, reason: 'asleep' })
})

test('自己去玩：白天会去荡秋千、闻花；火没着的夜里不去家具上玩', () => {
  const decor = [{ uid: 's1', id: 'swing', x: 2600, y: 3500 }, { uid: 'f1', id: 'flowerbed', x: 1300, y: 3500 }]
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
  assert.ok(seen.has('在荡秋千') && seen.has('在闻花坛'), [...seen].join('、'))
  const night = make({ decor, sways, hour: 22, lit: false, seed: 2 })
  night.life.start()
  for (let i = 0; i < 300; i++) {
    night.clock.advance(1000)
    assert.ok(night.life.whereIs().every((w) => !/在荡|在闻|野餐/.test(w.text)))
  }
  night.life.stop()
})

test('吊床：睡在里面的跟着布轻轻晃（rock-on，轴在两个结中间）；醒了不晃；回来时还在睡的接着晃', () => {
  const hammock = { uid: 'h1', id: 'hammock', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ pets: [{ id: 'nuonuo', level: 3 }], decor: [hammock], sways, seed: 5 })
  life.start()
  const r = life.callTo('h1')
  assert.equal(r.action, 'sleep')
  assert.ok(until(clock, () => sprites[0] && sprites[0].action === 'sleep'), '没去吊床里睡')
  const w = life.whereIs()[0]
  const spot = spotOf(hammock)
  assert.ok(Math.hypot(w.x - spot.x, w.y - spot.y) < 1)
  assert.equal(sprites[0].sway.uid, 'h1')
  assert.equal(sprites[0].sway.cls, 'rock-on')
  assert.equal(sprites[0].shadow.width, 0)
  // 回来时还在睡：接着晃
  const saved = life.snapshot()
  life.stop()
  const back = make({ pets: [{ id: 'nuonuo', level: 3 }], decor: [hammock], sways, saved, clock })
  assert.equal(back.life.sprites()[0].action, 'sleep')
  assert.equal(back.life.sprites()[0].sway.cls, 'rock-on')
  // 点醒：不晃了
  back.life.start()
  back.life.tap(0)
  assert.equal(back.sprites[0].sway, null)
  back.life.stop()
})

test('滑梯：走到梯子脚 → 背影爬到滑道顶（一路排在滑梯前面）→ 坐着滑到滑道口前面的草上 → 落地开心', () => {
  const slide = { uid: 'l1', id: 'slide', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ pets: [{ id: 'doudou', level: 2 }], decor: [slide], seed: 3 })
  life.start()
  const r = life.callTo('l1')
  assert.equal(r.action, 'slide')
  const d = D.decorById('slide')
  const s = scaleAt(slide.y)
  const pt = (q) => ({ x: slide.x + (q.x - d.anchor.x) * s, y: slide.y + (q.y - d.anchor.y) * s })
  const [top, exit] = d.ride.map(pt)
  const seen = []
  assert.ok(until(clock, () => {
    const w = life.whereIs()[0]
    const sp = sprites[0]
    if (Math.hypot(w.x - top.x, w.y - top.y) < 1 && seen.indexOf('top') === -1) seen.push('top')
    if (Math.hypot(w.x - exit.x, w.y - exit.y) < 1 && sp.action === 'sit' && seen.indexOf('slide') === -1) seen.push('slide')
    if (sp.action === 'happy' && seen.indexOf('slide') !== -1) seen.push('land')
    // 在滑梯上（爬、在顶上、滑）一路排在滑梯前面
    if (seen.length && seen.indexOf('land') === -1) assert.ok(sp.z > zOf(slide.y), `${seen.join(',')} 时被滑梯挡住了`)
    return seen.indexOf('land') !== -1
  }, 100, 400), seen.join(','))
  assert.deepEqual(seen.slice(0, 2), ['top', 'slide'])
  assert.ok(exit.y > slide.y, '落地点要在滑梯前面')
  assert.equal(life.whereIs()[0].text, '在玩小滑梯')
  life.stop()
})

test('木梯：走到梯子脚 → 背影爬到顶上的平台 → 左右张望 → 爬下来回到梯子脚；在上面一直排在梯子前面', () => {
  const ladder = { uid: 'k1', id: 'ladder', x: 2600, y: 3500 }
  const { life, clock, sprites } = make({ pets: [{ id: 'nuonuo', level: 2 }], decor: [ladder], seed: 8 })
  life.start()
  const r = life.callTo('k1')
  assert.equal(r.action, 'climb')
  const [top] = D.decorById('ladder').ride.map((q) => {
    const d = D.decorById('ladder')
    const s = scaleAt(ladder.y)
    return { x: ladder.x + (q.x - d.anchor.x) * s, y: ladder.y + (q.y - d.anchor.y) * s }
  })
  const foot = spotOf(ladder)
  let up = false
  let looked = new Set()
  assert.ok(until(clock, () => {
    const w = life.whereIs()[0]
    const sp = sprites[0]
    if (Math.hypot(w.x - top.x, w.y - top.y) < 1) {
      up = true
      assert.ok(sp.z > zOf(ladder.y), '在梯子顶上被梯子挡住了')
      if (sp.emoji === '👀') looked.add(sp.flip)
    }
    return up && Math.hypot(w.x - foot.x, w.y - foot.y) < 1 && sp.action !== 'walk'
  }, 100, 600))
  assert.equal(looked.size, 2, '没左右张望')
  life.stop()
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

test('点它说一段：两三句一句一句换，再点跳到下一句；别的气泡收起来；说过的十来句不重复；你点过之后两分钟内谁也不自己开口', () => {
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
  // 刚说完：两分钟内谁也不自己开口
  for (let i = 0; i < 110; i++) {
    clock.advance(1000)
    assert.ok(Object.values(sprites).every((sp) => !sp.bubble), '刚说完就有自己开口的')
  }
  life.stop()
})

test('锅里空着：不到 3 级的出去找吃的（一开始就不在），3 级以上和最亲的那只留下来喊饿；一下锅，走掉的闻着香味回来先去锅边吃', () => {
  const pot = []
  const pets = [{ id: 'doudou', level: 1 }, { id: 'nuonuo', level: 3 }, { id: 'qiqi', level: 2 }, { id: 'shushu', level: 1 }]
  const { life, clock, sprites } = make({ pets, pot, seed: 4 })
  const where = () => life.whereIs()
  // 进来时：糯糯（3 级）在，杞杞、豆豆、薯薯找吃的去了
  assert.deepEqual(where().filter((w) => w.action !== 'away').map((w) => w.id), ['nuonuo'])
  assert.ok(where().filter((w) => w.id !== 'nuonuo').every((w) => w.text === '锅里空空的，找吃的去了'))
  life.start()
  const hungry = []
  for (let i = 0; i < 600; i++) {
    clock.advance(1000)
    if (sprites[1] && sprites[1].bubble && hungry[hungry.length - 1] !== sprites[1].bubble) hungry.push(sprites[1].bubble)
  }
  assert.ok(hungry.some((l) => /饿|咕咕|没吃的/.test(l)), `糯糯没喊饿：${hungry.join(' / ')}`)
  assert.ok(where().filter((w) => w.id !== 'nuonuo').every((w) => w.action === 'away'))
  // 下锅：陆续回来，说一句、去锅边吃
  pot.push('xiaomi')
  life.cook([])
  const back = new Set()
  for (let i = 0; i < 60; i++) {
    clock.advance(500)
    Object.values(sprites).forEach((sp) => {
      if (!sp.hidden && sp.id !== 'nuonuo') back.add(sp.id)
    })
  }
  assert.deepEqual([...back].sort(), ['doudou', 'qiqi', 'shushu'])
  life.stop()
  // 全是 1 级：最亲的（最先来的）那只留下来，营地不会空
  const lonely = make({ pets: [{ id: 'doudou', level: 1 }, { id: 'qiqi', level: 1 }], pot: [], seed: 2 })
  assert.deepEqual(lonely.life.whereIs().filter((w) => w.action !== 'away').map((w) => w.id), ['doudou'])
})

test('锅里空着的时候在场的会走开：说一句「找吃的」，走到营地边上藏起来', () => {
  const pot = ['xiaomi']
  const { life, clock, sprites } = make({ pets: [{ id: 'doudou', level: 4 }, { id: 'qiqi', level: 1 }], pot, seed: 6 })
  life.start()
  clock.advance(3000)
  assert.equal(sprites[1] ? sprites[1].hidden : false, false)
  pot.length = 0 // 新的一天，锅空了
  let left = false
  let line = ''
  for (let i = 0; i < 300 && !left; i++) {
    clock.advance(500)
    if (sprites[1] && sprites[1].bubble) line = sprites[1].bubble
    left = !!(sprites[1] && sprites[1].hidden)
  }
  assert.ok(left, '杞杞没走开')
  assert.ok(/找吃的/.test(line), line)
  assert.equal(life.whereIs()[1].text, '锅里空空的，找吃的去了')
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
