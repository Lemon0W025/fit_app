// test/camp.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const C = require('../cloudfunctions/api/lib/shared/camp')

test('画的尺寸和远近缩放', () => {
  assert.equal(C.W, 3072)
  assert.equal(C.H, 4096)
  assert.equal(C.scaleAt(0), 0.82)
  assert.equal(C.scaleAt(C.H), 1)
  assert.ok(Math.abs(C.scaleAt(C.H / 2) - 0.91) < 1e-9)
})

test('SCENE：草地、禁区、篝火、坐点、食盆、入口都在画里', () => {
  const inside = ([x, y]) => x >= 0 && x <= C.W && y >= 0 && y <= C.H
  assert.ok(C.SCENE.grass.length >= 4 && C.SCENE.grass.every(inside))
  assert.deepEqual(Object.keys(C.SCENE.nogo).sort(), ['fire', 'tent'])
  assert.equal(C.SCENE.seats.length, 12)
  assert.equal(C.SCENE.bowls.length, 2)
  assert.equal(C.SCENE.entries.length, 3)
  assert.equal(C.SCENE.shade.length, 4)
  assert.equal(C.SCENE.tent.spots.length, 3)
  assert.equal(C.SCENE.sun.length, 3)
  // 坐点、食盆、树荫、帐篷门口、晒太阳点都是能站的草地
  C.SCENE.seats.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `seat ${x},${y}`))
  C.SCENE.bowls.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `bowl ${x},${y}`))
  C.SCENE.shade.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `shade ${x},${y}`))
  C.SCENE.entries.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `entry ${x},${y}`))
  C.SCENE.tent.spots.concat(C.SCENE.sun).forEach(([x, y]) => assert.ok(C.inGrass(x, y), `spot ${x},${y}`))
  // 帐篷门口的点就在帐篷外面一点
  C.SCENE.tent.spots.forEach(([x, y]) => assert.ok(y > C.SCENE.nogo.tent[2][1] && y < C.SCENE.nogo.tent[2][1] + 200, `tent spot ${x},${y}`))
})

test('多边形命中', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
  assert.equal(C.pointInPoly(5, 5, sq), true)
  assert.equal(C.pointInPoly(15, 5, sq), false)
  assert.equal(C.polyHitsRect(sq, { left: 8, top: 8, right: 20, bottom: 20 }), true)
  assert.equal(C.polyHitsRect(sq, { left: 11, top: 0, right: 20, bottom: 10 }), false)
  // 矩形整个包住多边形也算碰到
  assert.equal(C.polyHitsRect(sq, { left: -5, top: -5, right: 15, bottom: 15 }), true)
  assert.equal(C.rectInPoly({ left: 1, top: 1, right: 9, bottom: 9 }, sq), true)
  assert.equal(C.rectInPoly({ left: 1, top: 1, right: 12, bottom: 9 }, sq), false)
  assert.equal(C.segmentHitsPoly([-5, 5], [15, 5], sq), true)
  assert.equal(C.segmentHitsPoly([-5, 15], [15, 15], sq), false)
  assert.equal(C.circle(0, 0, 10, 4).length, 4)
  assert.equal(C.ellipse(0, 0, 10, 5, 8).length, 8)
})

test('inGrass / hitsNogo：篝火中心、帐篷不是草地；margin 和 names 管用', () => {
  assert.equal(C.inGrass(1536, 2000), true)
  assert.equal(C.inGrass(1536, 2680), false) // 篝火
  assert.equal(C.inGrass(1000, 1850), false) // 大帐篷
  assert.equal(C.inGrass(640, 900), true) // 草坪里没有树
  assert.equal(C.inGrass(300, 2500), true) // 也没有小溪
  assert.equal(C.inGrass(1536, 300), false) // 树林
  const near = { left: 1420, top: 1800, right: 1490, bottom: 1860 } // 帐篷右边 20px
  assert.equal(C.hitsNogo(near, 0), false)
  assert.equal(C.hitsNogo(near, 40, ['tent']), true)
  assert.equal(C.hitsNogo(near, 40, ['fire']), false)
  assert.equal(C.hitsNogo({ left: 1500, top: 2400, right: 1560, bottom: 2460 }, 0), true)
})

test('亲密度等级和礼物时机', () => {
  assert.deepEqual(C.LEVELS, [0, 3, 8, 15, 25])
  assert.deepEqual([0, 2, 3, 7, 8, 14, 15, 24, 25, 99].map(C.levelOf), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  assert.deepEqual([0, 3, 24, 25].map(C.nextLevelAt), [3, 8, 25, null])
  assert.equal(C.giftDue('', '2026-10-24', 7), true)
  assert.equal(C.giftDue('2026-10-23', '2026-10-24', 5), true)
  assert.equal(C.giftDue('2026-10-24', '2026-10-24', 9), false)
  assert.equal(C.giftDue('2026-10-23', '2026-10-24', 4), false)
})
