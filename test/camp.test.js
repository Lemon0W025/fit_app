// test/camp.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const C = require('../cloudfunctions/api/lib/shared/camp')

test('画的尺寸和远近缩放', () => {
  assert.equal(C.W, 4096)
  assert.equal(C.H, 4096)
  assert.equal(C.scaleAt(0), 0.82)
  assert.equal(C.scaleAt(C.H), 1)
  assert.ok(Math.abs(C.scaleAt(C.H / 2) - 0.91) < 1e-9)
})

test('SCENE：草地、禁区、篝火、坐点、食盆、入口都在画里', () => {
  const inside = ([x, y]) => x >= 0 && x <= C.W && y >= 0 && y <= C.H
  assert.ok(C.SCENE.grass.length >= 4 && C.SCENE.grass.every(inside))
  assert.deepEqual(Object.keys(C.SCENE.nogo).sort(), ['fire', 'lantern', 'lid', 'tent'])
  assert.equal(C.SCENE.seats.length, 12)
  assert.equal(C.SCENE.bowls.length, 2)
  assert.equal(C.SCENE.entries.length, 3)
  assert.equal(C.SCENE.shade.length, 4)
  assert.equal(C.SCENE.tent.spots.length, 3)
  assert.equal(C.SCENE.sun.length, 3)
  const [pl, pt, pr, pb] = C.SCENE.cutouts.pot.box
  assert.ok(pl < C.SCENE.fire[0] && C.SCENE.fire[0] < pr && pt < C.SCENE.fire[1] && C.SCENE.fire[1] < pb)
  // 抠图的框是 4 的倍数（按 0.75 / 0.5 缩出来正好落在底图切块的像素格上）；轮廓在框里
  Object.entries(C.SCENE.cutouts).forEach(([key, c]) => {
    c.box.forEach((v) => assert.equal(v % 4, 0, `${key} box ${v}`))
    c.poly.forEach(([x, y]) => assert.ok(x >= c.box[0] - 1 && x <= c.box[2] + 1 && y >= c.box[1] - 1 && y <= c.box[3] + 1, `${key} poly out of box ${x},${y}`))
  })
  assert.ok(C.SCENE.cutouts.tent.zy < C.SCENE.cutouts.pot.zy)
  // 帐篷的前沿：从左到右、在框里；禁区把前沿整个包住（站得到的地方都在前沿前面）
  const tent = C.SCENE.cutouts.tent
  tent.front.forEach(([x, y], i) => {
    assert.ok(x >= tent.box[0] && x <= tent.box[2] && y >= tent.box[1] && y <= tent.box[3], `tent front ${x},${y}`)
    if (i) assert.ok(x > tent.front[i - 1][0])
  })
  for (let x = 60; x <= 1580; x += 20) {
    const fy = tent.front.reduce((acc, [px, py], i, f) => (i && x >= f[i - 1][0] && x <= px ? f[i - 1][1] + ((py - f[i - 1][1]) * (x - f[i - 1][0])) / (px - f[i - 1][0]) : acc), tent.front[0][1])
    assert.equal(C.inGrass(x, fy - 2), false, `tent front at ${x} is reachable from behind`)
  }
  // 火苗那块在篝火石圈里；锅的抠图沿锅底走，不把锅底下的火苗抠进去
  const [fl, ft, fr, fb] = C.SCENE.flame.box
  C.SCENE.flame.zone.forEach(([x, y]) => {
    assert.ok(x > fl && x < fr && y > ft && y < fb, `flame zone ${x},${y}`)
    assert.ok(C.pointInPoly(x, y, C.SCENE.nogo.fire), `flame zone outside the fire ring ${x},${y}`)
  })
  C.SCENE.cutouts.pot.poly.filter(([x]) => x > 1900 && x < 2300).forEach(([x, y]) => assert.ok(y <= 2712, `pot cutout reaches into the flames ${x},${y}`))
  // 坐点是开口朝后的马蹄形：没人坐在锅正后面
  C.SCENE.seats.forEach(([x, y]) => assert.ok(y > C.SCENE.fire[1] - 120 || Math.abs(x - C.SCENE.fire[0]) > 320, `seat ${x},${y}`))
  // 坐点、食盆、树荫、帐篷门口、晒太阳点都是能站的草地
  C.SCENE.seats.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `seat ${x},${y}`))
  C.SCENE.bowls.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `bowl ${x},${y}`))
  C.SCENE.shade.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `shade ${x},${y}`))
  C.SCENE.entries.forEach(([x, y]) => assert.ok(C.inGrass(x, y), `entry ${x},${y}`))
  C.SCENE.tent.spots.concat(C.SCENE.sun).forEach(([x, y]) => assert.ok(C.inGrass(x, y), `spot ${x},${y}`))
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
  // 正好穿过两个顶点（叉积为 0）也算穿过
  const diamond = [[0, -10], [10, 0], [0, 10], [-10, 0]]
  assert.equal(C.segmentHitsPoly([0, -20], [0, 20], diamond), true)
  assert.equal(C.segmentHitsPoly([-20, 0], [20, 0], diamond), true)
  assert.equal(C.segmentHitsPoly([0, -20], [20, 0], diamond), false)
  assert.equal(C.circle(0, 0, 10, 4).length, 4)
  assert.equal(C.ellipse(0, 0, 10, 5, 8).length, 8)
  assert.deepEqual(C.arc(0, 0, 10, 10, 0, 180, 3), [[10, 0], [0, 10], [-10, 0]])
})

test('inGrass / hitsNogo：篝火、木盖、提灯、帐篷不是草地；margin 和 names 管用', () => {
  assert.equal(C.inGrass(2048, 3600), true)
  assert.equal(C.inGrass(2130, 2820), false) // 篝火石圈
  assert.equal(C.inGrass(1680, 2840), false) // 木盖
  assert.equal(C.inGrass(2665, 2770), false) // 提灯树桩
  assert.equal(C.inGrass(2820, 2700), true) // 提灯右边是草地
  assert.equal(C.inGrass(700, 1100), false) // 大帐篷（左上角）
  assert.equal(C.inGrass(2000, 1300), true) // 锅后面是空草坪
  assert.equal(C.inGrass(640, 2500), true) // 草坪里没有树、没有小溪
  assert.equal(C.inGrass(3900, 3900), true) // 右下角也是草坪
  assert.equal(C.inGrass(2048, 300), false) // 树林
  assert.equal(C.inGrass(1000, 1000), false) // 帐篷后面也不让去（走过去整个被挡住）
  const near = { left: 1620, top: 1180, right: 1680, bottom: 1240 } // 帐篷右边木桩外 30px
  assert.equal(C.hitsNogo(near, 0), false)
  assert.equal(C.hitsNogo(near, 40, ['tent']), true)
  assert.equal(C.hitsNogo(near, 40, ['fire']), false)
  assert.equal(C.hitsNogo({ left: 2100, top: 2550, right: 2160, bottom: 2610 }, 0), true)
})

test('hiddenAt：锅身、提灯正后面会被整个挡住，坐点、晒太阳点、睡觉点、食盆都不在那儿', () => {
  assert.equal(C.hiddenAt(2100, 2450), true) // 锅身后面
  assert.equal(C.hiddenAt(2660, 2620), true) // 提灯后面
  assert.equal(C.hiddenAt(2100, 2000), false) // 锅上方的草坪（三脚架中间看得见）
  assert.equal(C.hiddenAt(2130, 3300), false) // 锅前面
  const S = C.SCENE
  S.seats.concat(S.sun, S.shade, S.tent.spots, S.bowls, S.entries).forEach(([x, y]) => assert.equal(C.hiddenAt(x, y), false, `${x},${y}`))
  assert.ok(C.nogoPolys().length >= 4)
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
