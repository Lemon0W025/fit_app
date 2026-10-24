// test/camp-life.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createLife, depthCuts } = require('../miniprogram/utils/camp-life')
const { campLayout, cutoutStrips, zOf, BOWL_PX } = require('../miniprogram/utils/camp-view')
const { SCENE, inGrass, pointInPoly, hiddenAt, nogoPolys, segmentHitsPoly } = require('../miniprogram/utils/shared/camp')
const { petById } = require('../miniprogram/utils/shared/pets')
const { manualClock } = require('./helpers/manual-clock')

const L = campLayout({ width: 375, height: 736 })

function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function make(opts = {}) {
  const clock = manualClock()
  const sprites = {}
  const life = createLife({
    L, pets: opts.pets || [{ id: 'doudou', level: 1, fed: 0 }, { id: 'nuonuo', level: 2, fed: 3 }], decor: opts.decor || [], arrivals: opts.arrivals || [],
    hour: () => (opts.hour === undefined ? 12 : opts.hour), random: lcg(opts.seed || 7), clock,
    onChange: (i, s) => { sprites[i] = s }, sheets: opts.sheets || {}, animBase: opts.animBase || '', bad: new Set(),
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

test('傍晚全员围着篝火坐；夜里去睡：有草窝睡草窝，没有去树荫', () => {
  const dusk = make({ hour: 18 })
  dusk.life.start()
  dusk.clock.advance(120000)
  dusk.life.whereIs().forEach((w, i) => {
    assert.equal(w.action, 'sit', w.id)
    const [sx, sy] = SCENE.seats[i]
    assert.ok(Math.hypot(w.x - sx, w.y - sy) < 1, `${w.id} 没坐到位 ${w.x},${w.y}`)
  })
  const night = make({ hour: 23, decor: [{ uid: 'd1', id: 'strawbed', x: 1500, y: 1800 }] })
  night.life.start()
  night.clock.advance(120000)
  const where = night.life.whereIs()
  assert.ok(where.every((w) => w.action === 'sleep'), JSON.stringify(where.map((w) => w.action)))
  const inBed = where.filter((w) => w.text === '在草窝里睡觉')
  assert.equal(inBed.length, 1)
  const shade = where.find((w) => w.text === '在睡觉')
  assert.ok(SCENE.shade.concat(SCENE.tent.spots).some(([x, y]) => Math.hypot(x - shade.x, y - shade.y) < 1))
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
  assert.deepEqual(depthCuts({ x: 150, y: 2700 }, { x: 1550, y: 3200 }, 100, lines), []) // 斜着走，跨线时离两样东西都远
  assert.deepEqual(depthCuts({ x: 1300, y: 2700 }, { x: 1600, y: 3200 }, 100, lines).map((c) => Math.round(c.y)), [2820])
  const both = depthCuts({ x: 160, y: 2700 }, { x: 160, y: 3200 }, 100, [{ l: 100, r: 200, y: 3000 }, { l: 0, r: 300, y: 2800 }])
  assert.deepEqual(both.map((c) => c.y), [2800, 3000])
})

// 模拟一整天：每一步（走路的每一小段）都不该横跨挨着它的抠图层 / 食盆 / 装饰那条线，z 按这一小段的中点排；
// 停下来歇着的地方不在锅身、提灯正后面；走的路不穿任何禁区（木盖、提灯也算）
test('走路时和锅、帐篷、提灯、食盆的前后在跨线那一刻才变；停下来的地方看得见；路不穿禁区', () => {
  const decor = [{ uid: 'd1', id: 'ball', x: 2500, y: 2300 }, { uid: 'd2', id: 'flowerbed', x: 1700, y: 3400 }]
  const { patchRect, decorById } = require('../miniprogram/utils/shared/decor')
  const lines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
    .concat(SCENE.bowls.map(([bx, by]) => ({ l: bx - BOWL_PX / 2, r: bx + BOWL_PX / 2, y: by })))
    .concat(decor.filter((d) => decorById(d.id)).map((d) => { const r = patchRect(d.id, d.x, d.y); return { l: r.left, r: r.right, y: d.y } }))
  let pieces = 0
  let rests = 0
  for (const [seed, hourOf] of [[3, () => 12], [11, () => 8], [29, () => 18], [41, () => 21]]) {
    const clock = manualClock()
    let life = null
    const prev = {}
    const pets = ['doudou', 'nuonuo', 'jutuan', 'guigui', 'qiqi', 'shushu'].map((id) => ({ id, level: 3, fed: 9 }))
    life = createLife({
      L, pets, decor, arrivals: ['qiqi'], hour: hourOf, random: lcg(seed), clock,
      onChange: (i, sp) => {
        const where = life.whereIs()[i]
        const from = prev[i]
        prev[i] = { x: where.x, y: where.y }
        if (!from || (sp.action !== 'walk' && sp.action !== 'fly' && sp.action !== 'gift') || sp.hidden) return
        if (Math.hypot(where.x - from.x, where.y - from.y) < 1) return
        pieces += 1
        const half = petById(where.id).size / 2
        nogoPolys().forEach((poly) => assert.ok(!segmentHitsPoly([from.x, from.y], [where.x, where.y], poly), `${where.id} 穿过禁区 ${from.x},${from.y} → ${where.x},${where.y}`))
        lines.forEach((o) => {
          const lo = Math.min(from.y, where.y)
          const hi = Math.max(from.y, where.y)
          if (!(o.y > lo + 6 && o.y < hi - 6)) return
          const t = (o.y - from.y) / (where.y - from.y)
          const x = from.x + (where.x - from.x) * t
          if (x + half * 0.82 < o.l || x - half * 0.82 > o.r) return
          assert.fail(`${where.id} 一小段横跨了 y=${o.y} 的线：${from.x | 0},${from.y | 0} → ${where.x | 0},${where.y | 0}`)
        })
        assert.equal(sp.z, zOf((from.y + where.y) / 2) + 1, `${where.id} 走路时按这一小段的中点排`)
      },
    })
    life.start()
    for (let i = 0; i < 400; i++) {
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
  assert.ok(pieces > 50, `走的步数 ${pieces}`)
  assert.ok(rests > 200, `歇着的次数 ${rests}`)
})

test('夜里宠物按站的位置调亮度和暖色（火边亮、远处暗），白天不调', () => {
  const day = make({ hour: 12 })
  day.life.sprites().forEach((s) => assert.equal(s.light, ''))
  const night = make({ hour: 22 })
  night.life.sprites().forEach((s) => assert.match(s.light, /^brightness\([\d.]+\) saturate\([\d.]+\) sepia\([\d.]+\)$/))
  const { lightAt, nightFilter } = require('../miniprogram/utils/camp-light')
  const b = (f) => Number(/brightness\(([\d.]+)\)/.exec(f)[1])
  assert.ok(b(nightFilter(2130, 3200)) > b(nightFilter(3800, 3800)) + 0.2, '篝火前面比远处亮')
  assert.ok(lightAt(2130, 3200).warm > 0 && lightAt(3800, 1200).warm < 0, '火边暖、远处冷')
  assert.ok(b(nightFilter(1210, 1460)) > b(nightFilter(500, 2500)), '帐篷门口亮')
})
