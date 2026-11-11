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
  assert.equal(P('ball', 1520, 1810), '这儿挤不下，往旁边挪一点')
  assert.equal(P('ball', 1520, 1810, 'd1'), '')
  // 家具高：紧贴着摆在篝火前面会把锅挡住，离石圈要留出块高的 0.4（秋千 420）；花草矮，贴着石圈种
  assert.equal(P('swing', 2000, 3400), '这儿放不下，挪开一点')
  assert.equal(P('swing', 2000, 3650), '')
  assert.equal(P('ball', 2000, 3500), '')
  assert.equal(P('ball', 2130, 3200), '这儿放不下，挪开一点')
  assert.equal(P('tulips', 2130, 3200), '')
  assert.equal(P('tulips', 2130, 3150), '这儿放不下，挪开一点') // 占地框压到石圈了
})

test('占地框按画出来的大小：都不比整块图的 0.6 × 0.4 大（旧档里摆好的不会变成挤着），花草又窄又浅', () => {
  D.DECOR.forEach((d) => {
    assert.ok(d.foot.w <= d.patch.w * 0.6 && d.foot.h <= d.patch.h * 0.4, d.id)
    assert.ok(d.foot.w >= 150 && d.foot.h >= 80, d.id)
    if (d.category === 'plant') assert.ok(d.foot.h <= 120, d.id)
  })
  assert.deepEqual(D.decorById('tulips').foot, { w: 220, h: 100 })
  assert.deepEqual(D.decorById('swing').foot, D.decorById(D.GOLD_SWING).foot)
  assert.deepEqual([D.decorById('swing').clear, D.decorById('ball').clear, D.decorById('tulips').clear, D.decorById('roses').clear], [420, 200, 100, 100])
})

test('花挨着种：同一种花一朵挨一朵排成一排、前后两排隔一个占地框的深就行；花和家具之间留一点空', () => {
  const t = D.decorById('tulips')
  const row = []
  // 一排 8 朵郁金香：每朵挪一个占地框的宽（220）
  for (let i = 0; i < 8; i++) {
    const x = 800 + i * t.foot.w
    assert.equal(D.placeProblem(row, 'tulips', x, 3600), '', `第 ${i + 1} 朵`)
    row.push({ uid: `t${i}`, id: 'tulips', x, y: 3600 })
  }
  // 画出来约 320 宽，隔 220 一朵：叶子搭上一点，是一片花
  assert.ok(t.foot.w < 320)
  // 第二排：往前（下）挪一个占地框的深
  assert.equal(D.placeProblem(row, 'tulips', 910, 3600 + t.foot.h), '')
  assert.equal(D.placeProblem(row, 'tulips', 910, 3600 + t.foot.h - 10), '这儿挤不下，往旁边挪一点')
  // 以前的规则（360 × 200 外面各留 16）一朵花周围 784 × 464 都不能再种；现在篝火前面 3000 × 800 的一块空地种得下 100 多朵
  let n = 0
  const bed = []
  for (let y = 3200; y <= 3900; y += t.foot.h) {
    for (let x = 600; x <= 3600 - t.foot.w; x += t.foot.w) {
      if (D.placeProblem(bed, 'tulips', x, y)) continue
      bed.push({ uid: `b${n}`, id: 'tulips', x, y })
      n += 1
    }
  }
  assert.ok(n >= 100, `种下了 ${n} 朵`)
  // 滚球（家具）挨着花：中间留 12
  const ball = D.decorById('ball')
  const near = 800 - (t.foot.w + ball.foot.w) / 2
  assert.equal(D.placeProblem(row, 'ball', near - 5, 3600), '这儿挤不下，往旁边挪一点')
  assert.equal(D.placeProblem(row, 'ball', near - 13, 3600), '')
})

test('nearestSpot：能放就是原地；放不下吸到旁边最近能放的地方（紧挨着那件的左右 / 前后），太远了就算了', () => {
  const placed = [{ uid: 'a', id: 'tulips', x: 2000, y: 3600 }]
  assert.deepEqual(D.nearestSpot(placed, 'tulips', 2600, 3600), { x: 2600, y: 3600, moved: false })
  // 压在那朵花偏右：吸到它右边、同一条线上，正好挨着
  const right = D.nearestSpot(placed, 'tulips', 2150, 3610)
  assert.deepEqual(right, { x: 2221, y: 3600, moved: true })
  assert.equal(D.placeProblem(placed, 'tulips', right.x, right.y), '')
  // 偏左就吸到左边
  assert.deepEqual(D.nearestSpot(placed, 'tulips', 1850, 3590), { x: 1779, y: 3600, moved: true })
  // 正前面一点：吸到正前面一排（x 跟着手指）
  assert.deepEqual(D.nearestSpot(placed, 'tulips', 2010, 3680), { x: 2010, y: 3701, moved: true })
  // 挪的是它自己：原地能放
  assert.deepEqual(D.nearestSpot(placed, 'tulips', 2010, 3610, 'a'), { x: 2010, y: 3610, moved: false })
  // 大帐篷正中间：周围 420 以内都放不下
  assert.equal(D.nearestSpot([], 'tulips', 700, 1000), null)
  // 篝火石圈正中间的秋千：吸到石圈后面去了
  const behind = D.nearestSpot([], 'swing', 2130, 2820)
  assert.ok(behind && behind.moved && behind.y < 2600)
  // 石圈边上：吸出来
  const out = D.nearestSpot([], 'tulips', 2130, 3120)
  assert.ok(out && out.moved && D.placeProblem([], 'tulips', out.x, out.y) === '')
  assert.ok(Math.hypot(out.x - 2130, out.y - 3120) <= D.SNAP_REACH)
  // 草地外面一点：吸回草地里
  const back = D.nearestSpot([], 'tulips', 2000, 900)
  assert.ok(back && back.moved && back.y >= 960)
  assert.equal(D.nearestSpot([], 'nope', 2000, 3000), null)
  assert.equal(D.nearestSpot([], 'tulips', NaN, 3000), null)
})

test('草坪往下开到画下面补的那片草地里：y 超过画高（4096）的地方也能摆，再往下（4760 以外）不行', () => {
  assert.equal(D.placeProblem([], 'tulips', 2000, 4100), '')
  assert.equal(D.placeProblem([], 'tulips', 2000, 4600), '')
  assert.equal(D.placeProblem([], 'swing', 2000, 4700), '')
  assert.equal(D.placeProblem([], 'tulips', 2000, 4800), '只能放在草地上')
  // 压着下沿：吸回草地里
  const back = D.nearestSpot([], 'tulips', 2000, 4800)
  assert.ok(back && back.moved && back.y <= 4760)
})
