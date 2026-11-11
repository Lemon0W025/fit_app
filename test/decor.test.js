// test/decor.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const D = require('../cloudfunctions/api/lib/shared/decor')

test('26 件装饰 + 金色秋千：类别、价钱、块和落脚框；会穿模的家具和花坛下架（11/07），草坪上换成各种花', () => {
  assert.equal(D.DECOR.length, 27)
  assert.equal(new Set(D.DECOR.map((d) => d.id)).size, 27)
  assert.deepEqual(D.CATEGORIES.map((c) => c.id), ['nest', 'eat', 'play', 'plant', 'mood'])
  const shop = D.DECOR.filter((d) => d.price > 0)
  assert.equal(shop.length, 26)
  assert.equal(shop.reduce((s, d) => s + d.price * d.max, 0), 3010)
  // 留下的：和草地贴合、小动物不用躺进去 / 爬上去的
  assert.deepEqual(D.DECOR.filter((d) => d.category !== 'plant').map((d) => d.id), ['strawbed', 'kettle', 'swing', 'ball', 'lights', 'bunting', 'windmill', 'lantern', 'stonelamp', 'fence', 'gold_swing'])
  ;['tent', 'sapling', 'hammock', 'treehouse', 'picnic', 'table', 'ladder', 'slide', 'flowerbed', 'pumpkins', 'mailbox', 'clothesline', 'scarecrow'].forEach((id) => {
    assert.equal(D.decorById(id), null, id)
    assert.ok(D.RETIRED[id] && D.RETIRED[id].price > 0 && D.RETIRED[id].name, id)
  })
  assert.equal(Object.keys(D.RETIRED).length, 13)
  assert.deepEqual(D.RETIRED.hammock, { name: '吊床', price: 100 })
  assert.deepEqual(D.RETIRED.flowerbed, { name: '花坛', price: 50 })
  D.DECOR.forEach((d) => {
    assert.ok(D.CATEGORIES.some((c) => c.id === d.category), d.id)
    assert.ok(d.patch.w > 0 && d.patch.h > 0 && d.foot.w <= d.patch.w && d.foot.h <= d.patch.h, d.id)
    assert.ok(d.anchor.x >= 0 && d.anchor.x <= d.patch.w && d.anchor.y >= 0 && d.anchor.y <= d.patch.h, d.id)
    assert.ok(d.max >= 1, d.id)
    d.spots.forEach((s) => assert.ok(['sleep', 'sit', 'swing', 'sniff', 'tea', 'play'].indexOf(s.action) !== -1, `${d.id} ${s.action}`))
  })
  // 秋千坐在座位上摆；花前面闻（点在落脚框外面，不用走进花坛里）
  assert.deepEqual(D.decorById('swing').spots.map((s) => s.action), ['swing'])
  assert.deepEqual(D.decorById('gold_swing').spots, D.decorById('swing').spots)
  // 花草 16 种，都是直接种在草坪上的，都能闻；一排向日葵能站三只
  const plants = D.DECOR.filter((d) => d.category === 'plant').map((d) => d.id)
  assert.deepEqual(plants, ['sunflower', 'sunflowers', 'lavender', 'hydrangea', 'tulips', 'daisies', 'cosmos', 'roses', 'dandelions', 'clover', 'rapeseed', 'chrysanthemum', 'mint', 'poppies', 'bluebells', 'mushrooms'])
  plants.forEach((id) => {
    const d = D.decorById(id)
    assert.ok(d.spots.length && d.spots.every((s) => s.action === 'sniff' && s.y > d.anchor.y), id)
  })
  assert.equal(D.decorById('sunflowers').spots.length, 3)
  assert.equal(D.decorById('sunflowers').size, 'l')
  assert.equal(D.decorById('gold_swing').price, 0)
  assert.equal(D.GOLD_SWING, 'gold_swing')
  assert.deepEqual(D.decorById('gold_swing').patch, D.decorById('swing').patch)
  assert.equal(D.decorById('sunflower').max, 3)
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
  assert.equal(P('swing', 2000, 3400), '这儿放不下，挪开一点') // 放大以后顶到篝火
  assert.equal(P('swing', 2000, 3650), '')
  assert.equal(P('ball', 2000, 3500), '')
})
