const test = require('node:test')
const assert = require('node:assert/strict')
const W = require('../miniprogram/utils/world')
const E = require('../miniprogram/utils/shared/estate')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = W.estateLayout(375)
const WIN = { width: 375, height: 700 }
const AREAS = E.AREAS.map((a) => ({
  id: a.id, name: a.name, cost: a.cost, unlocked: E.START_OPENED.indexOf(a.id) !== -1, unlockable: E.canUnlock(E.START_OPENED, a.id),
}))

test('estateLayout：1 倍时一个院子加两边的墙占屏幕宽 96%，四周留白', () => {
  assert.deepEqual([L.cols, L.rows], [37, 28])
  assert.ok(Math.abs(L.tileW * 9 - 375 * 0.96) < 1e-9)
  assert.equal(L.margin, 188)
  assert.equal(L.viewWidth, L.width + 376)
  assert.equal(L.viewHeight, L.height + 376)
})

test('areaOffset / tileOffset：把院子中间、某一格放到屏幕正中', () => {
  const o = W.areaOffset('main', L, WIN)
  const p = tileTop(16, 14, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
  const t = W.tileOffset(11, 16, L, WIN)
  const q = tileCenter(11, 16, L)
  assert.ok(Math.abs(t.x + L.margin + q.x - 187.5) < 1e-9)
  assert.ok(Math.abs(t.y + L.margin + q.y - 350) < 1e-9)
})

test('artTiles：16 块正好拼满整个 #world', () => {
  const tiles = W.artTiles(L)
  assert.equal(tiles.length, 16)
  assert.equal(tiles[0].image, '/images/garden/estate/t00.jpg')
  assert.equal(tiles[15].image, '/images/garden/estate/t33.jpg')
  assert.ok(Math.abs(tiles[15].left + tiles[15].width - L.width) < 1e-9)
  assert.ok(Math.abs(tiles[15].top + tiles[15].height - L.height) < 1e-9)
  assert.deepEqual([tiles[1].left, tiles[1].top], [L.width / 4, 0])
  assert.deepEqual([tiles[4].left, tiles[4].top], [0, L.height / 4])
  const remote = W.artTiles(L, 'cloud://env.bucket/garden/estate/')
  assert.equal(remote[0].image, 'cloud://env.bucket/garden/estate/t00.jpg')
  assert.equal(remote[15].image, 'cloud://env.bucket/garden/estate/t33.jpg')
  assert.deepEqual([remote[5].left, remote[5].top], [tiles[5].left, tiles[5].top])
})

test('cloudViews：只有没修的院子有云，每个 6～9 朵，位置固定在院子里', () => {
  const clouds = W.cloudViews(AREAS, L)
  const byArea = {}
  clouds.forEach((c) => { byArea[c.area] = (byArea[c.area] || 0) + 1 })
  assert.deepEqual(Object.keys(byArea).sort(), E.AREAS.map((a) => a.id).filter((id) => E.START_OPENED.indexOf(id) === -1).sort())
  Object.values(byArea).forEach((n) => assert.ok(n >= 6 && n <= 9))
  assert.deepEqual(W.cloudViews(AREAS, L), clouds)
  const box = W.areaBox('pond', L)
  clouds.filter((c) => c.area === 'pond').forEach((c) => {
    const mid = c.left + c.width / 2
    assert.ok(mid > box.left && mid < box.left + box.width, c.key)
    assert.ok(c.top > box.top - c.width && c.top < box.top + box.height, c.key)
    assert.match(c.image, /^\/images\/garden\/clouds\/c[1-9]\.png$/)
    assert.ok(c.width > 0 && c.delay >= 0)
  })
})

test('signViews：能修的院子门里侧立木牌', () => {
  const signs = W.signViews(AREAS, E.START_OPENED, L)
  assert.deepEqual(signs.map((s) => s.key), ['pond', 'orchard', 'bamboo', 'farm', 'back'])
  const pond = signs[0]
  assert.deepEqual([pond.name, pond.cost], ['荷塘院', 200])
  const p = tileCenter(21, 9, L)
  assert.ok(Math.abs(pond.left + pond.width / 2 - p.x) < 1e-9)
  assert.ok(Math.abs(pond.bottom - (L.height - p.y)) < 1e-9)
})

test('hintViews：亮起能摆的格子', () => {
  const placed = [{ uid: 'p1', itemId: 'starter_tree', c: 15, r: 18 }]
  const hints = W.hintViews(E.START_OPENED, placed, 'daisy', null, L)
  assert.equal(hints.length, 55)
  const h = hints.find((t) => t.c === 14 && t.r === 19)
  const top = tileTop(14, 19, L)
  assert.deepEqual([h.key, h.left, h.top, h.width, h.height], ['14-19', top.x - L.tileW / 2, top.y, L.tileW, L.tileH])
  assert.equal(W.hintViews(E.START_OPENED, placed, 'daisy', 'p1', L).length, 56)
  assert.ok(W.hintViews(E.START_OPENED, placed, 'pavilion', null, L).length < 98)
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(21, 14, L)
    assert.deepEqual(W.tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 21, r: 14 })
  }
  assert.equal(W.tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})
