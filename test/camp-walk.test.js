// test/camp-walk.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createWalk, depthCuts } = require('../miniprogram/utils/camp-walk')
const { cutoutStrips } = require('../miniprogram/utils/camp-view')
const { SCENE, inGrass, pointInPoly, nogoPolys, segmentHitsPoly, scaleAt } = require('../miniprogram/utils/shared/camp')
const { footRect, patchRect } = require('../miniprogram/utils/shared/decor')

const DECOR = [{ uid: 'd1', id: 'picnic', x: 2900, y: 3600 }, { uid: 'd2', id: 'flowerbed', x: 1700, y: 3400 }, { uid: 'd3', id: 'hammock', x: 3300, y: 2900 }]
const SIZE = 240

function lcg(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function make(decor = DECOR) {
  let t = 0
  const walk = createWalk({ decor, now: () => t, sizeOf: () => SIZE })
  return { walk, advance: (ms) => { t += ms } }
}

const pet = (x, y) => ({ x, y, right: true, dir: 'side', duration: 0, seg: null, depthY: null, pet: { speed: 110 } })
const rectPoly = (r) => [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]]
const inRect = (r, p) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

// 草地上、不在禁区和装饰落脚框里的随机点
function randomSpot(random, decor) {
  for (;;) {
    const p = { x: 200 + random() * (SCENE.width - 400), y: 800 + random() * (SCENE.height - 1000) }
    if (!inGrass(p.x, p.y) || nogoPolys().some((poly) => pointInPoly(p.x, p.y, poly))) continue
    if (decor.some((d) => inRect(footRect(d.id, d.x, d.y), p))) continue
    return p
  }
}

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

test('route：直着走得过去就是一段；挡着就绕，路不穿禁区和装饰的落脚框；起点在装饰上（吊床里）的那件不算障碍', () => {
  const { walk } = make()
  assert.deepEqual(walk.route({ x: 1000, y: 3300 }, { x: 1200, y: 3500 }), [{ x: 1200, y: 3500 }])
  // 从篝火左边到右边：绕过去，终点不变
  const around = walk.route({ x: 1300, y: 2820 }, { x: 2900, y: 2900 })
  assert.ok(around.length > 1)
  assert.deepEqual(around[around.length - 1], { x: 2900, y: 2900 })
  const random = lcg(5)
  for (let n = 0; n < 120; n++) {
    const from = randomSpot(random, DECOR)
    const to = randomSpot(random, DECOR)
    const path = walk.route(from, to)
    if (!path) continue
    let p = from
    path.forEach((q) => {
      nogoPolys().forEach((poly) => assert.ok(!segmentHitsPoly([p.x, p.y], [q.x, q.y], poly), `穿过禁区 ${p.x | 0},${p.y | 0} → ${q.x | 0},${q.y | 0}`))
      DECOR.forEach((d) => assert.ok(!segmentHitsPoly([p.x, p.y], [q.x, q.y], rectPoly(footRect(d.id, d.x, d.y))), `穿过 ${d.id}`))
      p = q
    })
  }
  // 躺在吊床上（落脚框里）走下来：不被吊床自己挡住
  const r = footRect('hammock', 3300, 2900)
  const inside = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
  assert.ok(walk.route(inside, { x: inside.x, y: r.bottom + 300 }))
})

test('update：装饰挪了，障碍跟着变', () => {
  const { walk } = make([])
  const from = { x: 2400, y: 3450 }
  const to = { x: 3400, y: 3450 }
  assert.equal(walk.route(from, to).length, 1)
  walk.update(DECOR)
  assert.ok(walk.route(from, to).length > 1, '野餐垫挡着要绕')
  walk.update([])
  assert.equal(walk.route(from, to).length, 1)
})

test('step：一小段按速度走、朝向跟着、排前后按中点；at 按时间插值；land 之后不带过渡', () => {
  const { walk, advance } = make([])
  const a = pet(1000, 3300)
  const path = walk.route(a, { x: 1440, y: 3300 })
  const ms = walk.step(a, path)
  assert.equal(ms, 4000) // 440 像素、每秒 110
  assert.equal(a.duration, 4000)
  assert.deepEqual([a.x, a.y, a.right, a.dir, a.depthY], [1440, 3300, true, 'side', 3300])
  advance(1000)
  assert.deepEqual(walk.at(a), { x: 1110, y: 3300 })
  advance(3000)
  assert.deepEqual(walk.at(a), { x: 1440, y: 3300 })
  walk.land(a)
  assert.deepEqual([a.duration, a.depthY], [0, null])
  // 往左上走：朝左、背影
  walk.step(a, [{ x: 1300, y: 3000 }])
  assert.deepEqual([a.x, a.y, a.right, a.dir], [1300, 3000, false, 'back'])
  // 很短的一段也至少走 300 毫秒
  walk.land(a)
  assert.equal(walk.step(a, [{ x: 1301, y: 3000 }]), 300)
})

test('halt：走到一半就停在屏幕上这会儿的位置（不带过渡）；没在走不动、返回 false；put 直接放过去', () => {
  const { walk, advance } = make([])
  const a = pet(1000, 3300)
  walk.step(a, [{ x: 1440, y: 3300 }])
  advance(2000)
  assert.equal(walk.halt(a), true)
  assert.deepEqual([a.x, a.y, a.duration, a.depthY], [1220, 3300, 0, null])
  assert.equal(walk.halt(a), false)
  // 走完了的不算在走
  walk.step(a, [{ x: 1000, y: 3300 }])
  advance(5000)
  assert.equal(walk.halt(a), false)
  assert.deepEqual([a.x, a.y], [1000, 3300])
  walk.put(a, 1500, 3500)
  assert.deepEqual([a.x, a.y, a.duration], [1500, 3500, 0])
  assert.deepEqual(walk.at(a), { x: 1500, y: 3500 })
})

// 一路走下来（随机起终点、绕路），每一小段里身子横着挨着的东西（抠图层的条、装饰），前后都不变：
// 这一小段里任何一点和那条线的上下关系，都和这段的中点一样（页面按中点排前后）
test('沿路走的每一小段，和锅、帐篷、提灯、装饰谁前谁后都不变', () => {
  const lines = cutoutStrips().map((c) => ({ l: c.l, r: c.r, y: c.zy }))
    .concat(DECOR.map((d) => { const r = patchRect(d.id, d.x, d.y); return { l: r.left, r: r.right, y: d.y } }))
  const { walk } = make()
  const random = lcg(11)
  let pieces = 0
  for (let n = 0; n < 150; n++) {
    const from = randomSpot(random, DECOR)
    const path = walk.route(from, randomSpot(random, DECOR))
    if (!path) continue
    const a = pet(from.x, from.y)
    while (path.length) {
      const start = { x: a.x, y: a.y }
      walk.step(a, path)
      walk.land(a)
      pieces += 1
      const half = (SIZE * scaleAt(Math.max(start.y, a.y))) / 2
      const midY = (start.y + a.y) / 2
      for (let k = 0; k <= 10; k++) {
        const x = start.x + ((a.x - start.x) * k) / 10
        const y = start.y + ((a.y - start.y) * k) / 10
        lines.forEach((o) => {
          if (x + half < o.l || x - half > o.r || Math.abs(y - o.y) < 2 || Math.abs(midY - o.y) < 2) return
          assert.equal(y > o.y, midY > o.y, `在 ${x | 0},${y | 0} 挨着 y=${o.y} 的东西，却按 ${midY | 0} 排`)
        })
      }
    }
  }
  assert.ok(pieces > 300, `走的段数 ${pieces}`)
})
