// test/camp-life.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife, depthCuts, PET_ZOOM } = require('../miniprogram/utils/camp-life')
const { campLayout, cutoutStrips, zOf, BOWL_PX } = require('../miniprogram/utils/camp-view')
const { SCENE, inGrass, pointInPoly, hiddenAt, nogoPolys, segmentHitsPoly, scaleAt } = require('../miniprogram/utils/shared/camp')
const { petById } = require('../miniprogram/utils/shared/pets')
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
    visitors: opts.visitors || [], saved: opts.saved || null, pot: () => opts.pot || [],
    hour: () => (opts.hour === undefined ? 12 : opts.hour), lit: () => opts.lit !== false, random: lcg(opts.seed || 7), clock: opts.clock || clock,
    onChange: (i, s) => { sprites[i] = s }, sheets: opts.sheets || {}, animBase: opts.animBase || '', sheetSrc: opts.sheetSrc, bad: new Set(),
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
    if (sprites[2] && sprites[2].bubble === '好香啊……') sniffed = true
  }
  assert.ok(sniffed, '客人没在锅边闻')
  life.tap(2)
  assert.equal(sprites[2].bubble, '它闻着竹笋的香味来的。妈妈下次拍正餐，它就住下来')
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
  clock.advance(30000)
  const w = life.whereIs()[0]
  assert.ok(sprites[0].action === 'eat' || Math.hypot(w.x - SCENE.fire[0], w.y - SCENE.fire[1]) < 900, `豆豆没去锅边 ${w.x | 0},${w.y | 0} ${sprites[0].action}`)
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
  assert.equal(s.sheet, 'cloud://x/anim/doudou-a.png')
  assert.deepEqual([s.anim.cols, s.anim.rows, s.anim.row], [6, 6, 1])
  life.noSheet('doudou')
  assert.equal(life.sprites()[0].sheet, '')
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

// 模拟一整天（多种随机种子、早中晚夜）：每走一小段，沿路取点，只要那一点身子横着挨着某样东西（抠图层的条、食盆、装饰），
// 宠物在它前面还是后面就必须和这一小段排的 z（按中点）一致；停下来歇着的地方不在锅身、提灯正后面；走的路不穿任何禁区
test('走路时和锅、帐篷、提灯、食盆、装饰的前后每一刻都对；停下来的地方看得见；路不穿禁区', () => {
  const decor = [{ uid: 'd1', id: 'ball', x: 2500, y: 2300 }, { uid: 'd2', id: 'flowerbed', x: 1700, y: 3400 }, { uid: 'd3', id: 'hammock', x: 3300, y: 3300 }]
  const { patchRect, decorById } = require('../miniprogram/utils/shared/decor')
  const lines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
    .concat(SCENE.bowls.map(([bx, by]) => ({ l: bx - BOWL_PX / 2, r: bx + BOWL_PX / 2, y: by })))
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
  const { life, sprites } = make({ sheets: { doudou: { top: 0.2 } }, sheetSrc: (id, s) => ready[`${id}-${s}`] || '' })
  assert.equal(life.sprites()[0].sheet, '')
  assert.equal(life.sprites()[0].image, '/images/camp/pets/doudou.png')
  ready['doudou-a'] = 'wxfile://tmp/doudou-a.png'
  ready['doudou-b'] = 'wxfile://tmp/doudou-b.png'
  life.refresh('doudou')
  assert.equal(sprites[0].sheet, 'wxfile://tmp/doudou-a.png')
  assert.equal(sprites[0].anim.row, 1)
  // 不给 sheetSrc 就按 animBase 拼云存储的路径（预览录屏、老用法）
  const old = make({ sheets: { doudou: { top: 0.2 } }, animBase: 'cloud://x/camp/anim-v1/' })
  assert.equal(old.life.sprites()[0].sheet, 'cloud://x/camp/anim-v1/doudou-a.png')
})

test('夜里宠物按站的位置上色，白天不调；火没点时远处的盖上月光层、灯边的不盖，点着了全都是本来的颜色', () => {
  const day = make({ hour: 12 })
  day.life.sprites().forEach((s) => assert.equal(s.light, ''))
  // 豆豆站在远处草地上，糯糯站在画上的提灯边
  const saved = { doudou: { x: 3500, y: 3600, right: true, action: 'idle', until: 0 }, nuonuo: { x: 2700, y: 2950, right: false, action: 'idle', until: 0 } }
  const off = make({ hour: 22, lit: false, saved }).life.sprites()
  off.forEach((s) => assert.match(s.light, /^brightness\([\d.]+\) saturate\([\d.]+\) sepia\([\d.]+\)$/))
  assert.ok(off[0].moon > 0.5, `远处盖月光层 ${off[0].moon}`)
  assert.ok(off[1].moon < 0.15, `提灯边不盖 ${off[1].moon}`)
  const on = make({ hour: 22, saved }).life.sprites()
  on.forEach((s) => assert.deepEqual([s.light, s.moon], ['brightness(0.92) saturate(1) sepia(0.12)', 0], s.id))
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
