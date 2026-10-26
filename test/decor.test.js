// test/decor.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const D = require('../cloudfunctions/api/lib/shared/decor')

test('24 件装饰 + 金帐篷：类别、价钱、块和落脚框', () => {
  assert.equal(D.DECOR.length, 25)
  assert.equal(new Set(D.DECOR.map((d) => d.id)).size, 25)
  assert.deepEqual(D.CATEGORIES.map((c) => c.id), ['nest', 'eat', 'play', 'plant', 'mood'])
  const shop = D.DECOR.filter((d) => d.price > 0)
  assert.equal(shop.length, 24)
  assert.equal(shop.reduce((s, d) => s + d.price * d.max, 0), 2210)
  D.DECOR.forEach((d) => {
    assert.ok(D.CATEGORIES.some((c) => c.id === d.category), d.id)
    assert.ok(d.patch.w > 0 && d.patch.h > 0 && d.foot.w <= d.patch.w && d.foot.h <= d.patch.h, d.id)
    assert.ok(d.anchor.x >= 0 && d.anchor.x <= d.patch.w && d.anchor.y >= 0 && d.anchor.y <= d.patch.h, d.id)
    assert.ok(d.max >= 1, d.id)
    d.spots.forEach((s) => assert.ok(['sleep', 'sit', 'play', 'climb', 'perch'].indexOf(s.action) !== -1, `${d.id} ${s.action}`))
  })
  assert.equal(D.decorById('gold_tent').price, 0)
  assert.equal(D.decorById('gold_tent').spots.filter((s) => s.action === 'sleep').length, 2)
  assert.equal(D.decorById('flowerbed').max, 3)
  assert.equal(D.decorById('nope'), null)
  // 原来的大小 × 2.5（10/26 放大）
  assert.equal(D.DECOR_SCALE, 2.5)
  assert.deepEqual(D.SIZES, { s: { w: 600, h: 500 }, m: { w: 900, h: 750 }, l: { w: 1300, h: 1050 } })
})

test('footRect / patchRect：落脚框贴着落脚点往上', () => {
  const foot = D.footRect('ball', 1000, 2000)
  const d = D.decorById('ball')
  assert.deepEqual(foot, { left: 1000 - d.foot.w / 2, top: 2000 - d.foot.h, right: 1000 + d.foot.w / 2, bottom: 2000 })
  const patch = D.patchRect('ball', 1000, 2000)
  assert.deepEqual(patch, { left: 1000 - d.anchor.x, top: 2000 - d.anchor.y, right: 1000 - d.anchor.x + d.patch.w, bottom: 2000 - d.anchor.y + d.patch.h })
})

test('placeProblem：每种不能放的原因', () => {
  const placed = [{ uid: 'd1', id: 'ball', x: 1500, y: 1800 }]
  const P = (id, x, y, ignore) => D.placeProblem(placed, id, x, y, ignore)
  assert.equal(P('nope', 1500, 2000), '放不到这里哦')
  assert.equal(P('ball', 1536, 300), '只能放在草地上')
  assert.equal(P('ball', 40, 2000), '只能放在草地上')
  assert.equal(P('ball', 2130, 2600), '这儿放不下，挪开一点') // 篝火石圈
  assert.equal(P('ball', 800, 1200), '这儿放不下，挪开一点') // 大帐篷
  assert.equal(P('ball', 700, 2100), '') // 草坪里没有树、没有小溪
  assert.equal(P('ball', 3800, 3800), '') // 右下角的空草坪
  assert.equal(P('ball', 1520, 1810), '和别的东西挤着了')
  assert.equal(P('ball', 1520, 1810, 'd1'), '')
  assert.equal(P('tent', 2000, 3400), '这儿放不下，挪开一点') // 放大以后顶到篝火
  assert.equal(P('tent', 2000, 3650), '')
  assert.equal(P('ball', 2000, 3500), '')
})
