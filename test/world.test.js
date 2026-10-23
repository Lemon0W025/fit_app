const test = require('node:test')
const assert = require('node:assert/strict')
const W = require('../miniprogram/utils/world')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = W.islandLayout(375)
const REGIONS = [
  { id: 'center', name: '中间花园', cost: 0, unlocked: true },
  { id: 'pond', name: '荷塘角', cost: 200, unlocked: false },
  { id: 'bamboo', name: '竹林角', cost: 300, unlocked: true },
  { id: 'veg', name: '菜园角', cost: 400, unlocked: false },
  { id: 'tea', name: '茶亭角', cost: 500, unlocked: false },
]

test('islandLayout：1 倍时中间花园占屏幕宽 92%，四周一圈海', () => {
  assert.equal(L.size, 12)
  assert.ok(Math.abs(L.tileW * 6 - 375 * 0.92) < 1e-9)
  assert.equal(L.margin, 188)
  assert.equal(L.viewWidth, L.width + 376)
  assert.equal(L.viewHeight, L.height + 376)
})

test('centerOffset：小岛正中对准屏幕正中', () => {
  const o = W.centerOffset(L, 375, 700)
  const p = tileTop(6, 6, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
})

test('islandView：底图盖住整座岛', () => {
  assert.deepEqual(W.islandView(L), { image: '/images/garden/island.png', left: 0, top: L.top, width: L.width, height: L.landHeight })
})

test('regionViews：没修整的角落有遮罩和木牌，横竖两种图', () => {
  const views = W.regionViews(REGIONS, L)
  assert.deepEqual(views.map((v) => v.key), ['pond', 'veg', 'tea'])
  const pond = views[0]
  assert.equal(pond.image, '/images/garden/locked-wide.png')
  assert.equal(views[1].image, '/images/garden/locked-tall.png')
  assert.equal(views[2].image, '/images/garden/locked-wide.png')
  assert.deepEqual([pond.sign.name, pond.sign.cost], ['荷塘角', 200])
  const box = W.regionBox('pond', L)
  const top = tileTop(3, 0, L)
  assert.ok(Math.abs(box.left - (top.x - 1.5 * L.tileW)) < 1e-9)
  assert.ok(Math.abs(box.width - 4.5 * L.tileW) < 1e-9)
  assert.equal(box.top, top.y)
  assert.ok(Math.abs(pond.left - box.left) < 1e-9)
  assert.ok(pond.top < box.top)
})

test('sceneryViews：只有修整好的角落有风景，放大的按 scale', () => {
  assert.deepEqual(W.sceneryViews(['center'], L), [])
  const pond = W.sceneryViews(['center', 'pond'], L)
  assert.deepEqual(pond.map((s) => s.itemId).sort(), ['koi_pond', 'lotus_pond'])
  assert.ok(Math.abs(pond.find((s) => s.itemId === 'lotus_pond').width - L.tileW * 1.5) < 1e-9)
  assert.ok(pond.every((s) => s.region === 'pond'))
})

test('flowerBeds、shoreDecor、waves：花坛和岛边铺满景色', () => {
  const beds = W.flowerBeds(L)
  assert.equal(beds.length, 28)
  assert.ok(beds.every((b) => /^\/images\/garden\/items\/\w+\.png$/.test(b.image) && Number.isInteger(b.z) && b.key))
  assert.equal(new Set(beds.filter((b) => b.key.endsWith('-0')).map((b) => b.image)).size, 4)
  const shore = W.shoreDecor(L)
  assert.equal(shore.length, 16)
  assert.ok(shore.every((s) => Number.isInteger(s.z)))
  assert.ok(W.waves(L).length >= 6)
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(7, 4, L)
    assert.deepEqual(W.tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 7, r: 4 })
  }
  assert.equal(W.tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})

test('placeChecker / openChecker', () => {
  const place = W.placeChecker(['center'])
  assert.equal(place(4, 4), true)
  assert.equal(place(6, 4), false)
  const open = W.openChecker(['center'])
  assert.equal(open(6, 4), true)
  assert.equal(open(1, 1), false)
})
