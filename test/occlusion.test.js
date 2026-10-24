const test = require('node:test')
const assert = require('node:assert/strict')
const O = require('../miniprogram/utils/occlusion')
const W = require('../miniprogram/utils/world')
const { tileCenter } = require('../miniprogram/utils/iso')
const { tileInfo } = require('../miniprogram/utils/shared/estate')

const L = W.estateLayout(375)
const art = W.artTiles(L)

// 一只站在 (c, r) 的动物的外框（和 garden-life 的 sprite 一样算）
function animalAt(c, r, scale = 0.6) {
  const width = L.tileW * scale
  const center = tileCenter(c, r, L)
  const y = center.y + L.tileH * 0.18
  return O.rectOf({ left: center.x - width / 2, bottom: L.height - y, width, bodyHeight: width, z: (c + r) * 10 + c + 5 }, L)
}

test('每块墙、每道月亮门、大门和每座建筑都有块；墙块的前后顺序比站在它后面的东西靠前、比前面的靠后', () => {
  const all = O.pieces(L)
  assert.ok(all.filter((p) => p.key[0] === 'w').length > 200)
  // 带洞的月亮门只在白墙上（正院西侧）；篱笆、小溪、台地的门不挡人
  assert.equal(all.filter((p) => p.key[0] === 'g').length, 1)
  assert.ok(!all.some((p) => p.key[0] === 'w' && O.FENCE_H[tileInfo(p.c, p.r).fence] === 0), '小溪不生成块')
  // 旧原画（全是白墙）：按墙算、每道门都有洞
  const legacy = O.pieces(L, { legacy: true })
  assert.equal(legacy.filter((p) => p.key[0] === 'g').length, 15)
  assert.ok(legacy.length > all.length)
  assert.equal(all.filter((p) => p.key[0] === 'd').length, 1)
  assert.ok(all.some((p) => p.key.indexOf('bhall') === 0))
  assert.equal(tileInfo(9, 20).kind, 'wall')
  const wall = all.find((p) => p.key === 'w9-20')
  assert.ok(wall.z > animalAt(8, 20).z, '果园里靠墙的动物在墙后面')
  assert.ok(wall.z < animalAt(10, 20).z, '前院里靠墙的动物在墙前面')
})

test('只在有东西站在后面、又碰到的时候才生成：果园里靠墙的动物 → 这堵墙要盖上去；前院同一位置不用', () => {
  const all = O.pieces(L)
  const behind = O.occludersFor(all, [animalAt(8, 20)])
  assert.ok(behind.some((p) => p.key === 'w9-20'))
  assert.ok(behind.every((p) => p.z > animalAt(8, 20).z))
  const front = O.occludersFor(all, [animalAt(10, 20)])
  assert.ok(!front.some((p) => p.key === 'w9-20'))
  assert.deepEqual(O.occludersFor(all, []), [])
  // 前院草地中间什么都碰不到；影壁后面那格会被影壁挡住
  assert.deepEqual(O.occludersFor(all, [animalAt(13, 20)]), [])
  assert.ok(O.occludersFor(all, [animalAt(12, 22)]).some((p) => p.key.indexOf('bscreen') === 0))
})

test('正房按竖条切：后花园里的动物被屋顶挡住，正院门前的动物不被挡', () => {
  const all = O.pieces(L)
  const back = O.occludersFor(all, [animalAt(14, 8, 0.8)])
  assert.ok(back.some((p) => p.key.indexOf('bhall') === 0), '后花园 (14,8) 在正房屋顶后面')
  const frontRect = animalAt(14, 13, 0.8)
  const front = O.occludersFor(all, [frontRect])
  assert.ok(!front.some((p) => p.key.indexOf('bhall') === 0), '正院 (14,13) 在正房前面')
})

test('月亮门是带洞的块：穿门的动物从洞里露出来；节点数据带 evenodd 和底图切块', () => {
  const all = O.pieces(L)
  const gate = all.find((p) => p.key === 'g9-13')
  assert.ok(gate && gate.hole)
  const v = O.view(gate, art)
  assert.ok(v.clip.indexOf('polygon(evenodd, ') === 0)
  assert.ok(v.tiles.length >= 1 && v.tiles.length <= 4)
  v.tiles.forEach((t) => assert.equal(t.image.indexOf('/images/garden/estate/t'), 0))
  // 几块切块合起来正好盖住外框
  assert.ok(Math.min(...v.tiles.map((t) => t.left)) <= 0 && Math.min(...v.tiles.map((t) => t.top)) <= 0)
  assert.ok(Math.max(...v.tiles.map((t) => t.left + t.width)) >= v.width && Math.max(...v.tiles.map((t) => t.top + t.height)) >= v.height)
  assert.ok(v.width > 0 && v.height > 0)
  // 从正院往竹林院走：站在门洞那格的动物在门后面（z 小），所以要生成门块
  const inGate = O.occludersFor(all, [animalAt(9, 13)])
  assert.ok(inGate.some((p) => p.key === 'g9-13'))
})

test('同一个格宽的块表会缓存；多边形工具：竖线裁切、凸包', () => {
  assert.equal(O.pieces(L), O.pieces(L))
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
  assert.deepEqual(O.clipX(sq, 2, 5), [[2, 0], [5, 0], [5, 10], [2, 10]])
  assert.equal(O.clipX(sq, 20, 30).length, 0)
  assert.equal(O.hull([[0, 0], [5, 5], [10, 0], [10, 10], [0, 10], [5, 1]]).length, 4)
  // 菱形和矩形：外框碰到但轮廓没碰到的不算
  const diamond = [[10, 0], [20, 10], [10, 20], [0, 10]]
  assert.equal(O.hitsRect(diamond, { left: 0, top: 0, width: 4, height: 4 }), false)
  assert.equal(O.hitsRect(diamond, { left: 8, top: 8, width: 4, height: 4 }), true)
  assert.equal(O.hitsRect(diamond, { left: 30, top: 0, width: 4, height: 4 }), false)
})
