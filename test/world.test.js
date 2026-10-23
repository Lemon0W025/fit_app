const test = require('node:test')
const assert = require('node:assert/strict')
const { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker } = require('../miniprogram/utils/world')
const { tileTop, tileCenter } = require('../miniprogram/utils/iso')

const L = worldLayout(375)
const ALL = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']

test('worldLayout：1 倍时一块地占屏幕宽 92%，四周留白', () => {
  assert.equal(L.size, 18)
  assert.ok(Math.abs(L.tileW * 6 - 375 * 0.92) < 1e-9)
  assert.equal(L.margin, 225)
  assert.equal(L.viewWidth, L.width + 450)
  assert.equal(L.viewHeight, L.height + 450)
})

test('centerOffset：地图正中对准屏幕正中', () => {
  const o = centerOffset(L, 375, 700)
  const p = tileTop(9, 9, L)
  assert.ok(Math.abs(o.x + L.margin + p.x - 187.5) < 1e-9)
  assert.ok(Math.abs(o.y + L.margin + p.y - 350) < 1e-9)
  assert.equal(o.scale, 1)
})

test('plotViews：9 块地从后往前排，开垦的是草地，能开荒的荒地立木牌', () => {
  const views = plotViews(['1,1'], L, 100)
  assert.equal(views.length, 9)
  assert.ok(views.every((v, i) => i === 0 || views[i - 1].z <= v.z))
  const center = views.find((v) => v.key === '1,1')
  assert.equal(center.open, true)
  assert.equal(center.image, '/images/garden/plot-open.png')
  assert.equal(center.sign, null)
  const t = tileTop(6, 6, L)
  assert.ok(Math.abs(center.left + center.width / 2 - t.x) < 1e-9)
  assert.equal(center.top, t.y)
  assert.ok(Math.abs(center.width - L.tileW * 6) < 1e-9)
  const north = views.find((v) => v.key === '1,0')
  assert.equal(north.image, '/images/garden/plot-wild.png')
  assert.equal(north.sign.cost, 100)
  assert.equal(views.find((v) => v.key === '0,0').sign, null)
  assert.equal(views.filter((v) => v.sign).length, 4)
  assert.ok(plotViews(ALL, L, null).every((v) => v.open && !v.sign))
})

test('decorations：都在小岛外面，图片路径正确', () => {
  const decor = decorations(L)
  assert.ok(decor.length >= 8)
  decor.forEach((d) => {
    assert.match(d.image, /^\/images\/garden\/(decor-\w+|items\/\w+)\.png$/)
    assert.ok(d.width > 0 && d.key)
  })
  assert.ok(decor.some((d) => d.cloud))
})

test('tileFromTouch：拖动、缩放之后点到的还是那一格', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const rect = { left: -300, top: -120, width: L.width * scale }
    const p = tileCenter(10, 7, L)
    assert.deepEqual(tileFromTouch(rect.left + p.x * scale, rect.top + p.y * scale, rect, L), { c: 10, r: 7 })
  }
  assert.equal(tileFromTouch(-5000, -5000, { left: 0, top: 0, width: L.width }, L), null)
})

test('openChecker：只有开垦的地块算数', () => {
  const open = openChecker(['1,1'])
  assert.equal(open(6, 6), true)
  assert.equal(open(5, 6), false)
  assert.equal(open(-1, 6), false)
})
