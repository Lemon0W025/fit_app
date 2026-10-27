// test/camp-state.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCamp, migrated } = require('../cloudfunctions/api/lib/camp-state')

test('空文档补齐默认值', () => {
  const c = normalizeCamp(null)
  assert.equal(c.camp, 4)
  assert.equal(c.welcomed, false)
  assert.deepEqual(c.beans, { earned: {}, bonus: 0, spent: 0 })
  assert.deepEqual(c.gacha, { pulls: 0, sincePity: 0 })
  assert.deepEqual(c.foods, {})
  assert.deepEqual(c.pot, { date: '', foods: [] })
  assert.deepEqual(c.visitors, [])
  assert.ok(!('bowls' in c) && !('peeking' in c))
  assert.deepEqual(c.pets, [])
  assert.deepEqual(c.decor, { owned: {}, placed: [] })
  assert.deepEqual([c.seq, c.gift, c.tasted, c.arrivals, c.grants, c.days], [0, '', [], [], [], {}])
  assert.equal(migrated(null, c), true)
})

test('已经是营地的文档：缺的补上，有的不动', () => {
  const doc = { camp: 4, welcomed: true, beans: { earned: { '2026-10-22': 60 }, bonus: 60, spent: 30 }, foods: { xiaomi: 2 }, pot: { date: '2026-10-22', foods: ['xiaomi'] }, visitors: [{ id: 'nuonuo', foodId: 'huluobo', since: '2026-10-22' }], pets: [{ id: 'doudou', since: '2026-10-22', fed: 4, fedToday: { date: '2026-10-22', n: 1 } }], seq: 3, gift: '2026-10-22' }
  const c = normalizeCamp(doc)
  assert.equal(c.beans.spent, 30)
  assert.deepEqual(c.pot, doc.pot)
  assert.deepEqual(c.visitors, doc.visitors)
  assert.deepEqual(c.pets, doc.pets)
  assert.equal(c.seq, 3)
  assert.deepEqual(c.decor, { owned: {}, placed: [] })
  assert.equal(migrated(doc, c), false)
})

test('宅院旧档迁成营地：暖豆退回、住户按原型搬进来、豆豆补上、旧字段删掉', () => {
  const doc = {
    estate: 2, welcomed: true, opened: ['front', 'main', 'pond'], seq: 9,
    beans: { earned: { '2026-10-20': 40, '2026-10-21': 60 }, bonus: 5060, spent: 700 },
    inventory: { daisy: 2 }, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 15, r: 18 }],
    residents: [{ id: 'panda', since: '2026-10-21' }, { id: 'crane', since: '2026-10-21' }, { id: 'bird', since: '2026-10-21' }],
    arrivals: ['crane'], collected: ['daisy', 'panda'], gacha: { pulls: 12, sincePity: 4 }, grants: ['preview-1'], days: { '2026-10-21': true },
  }
  const c = normalizeCamp(doc)
  assert.equal(c.camp, 4)
  assert.deepEqual(c.beans, { earned: { '2026-10-20': 40, '2026-10-21': 60 }, bonus: 60, spent: 0 })
  assert.deepEqual(c.pets.map((p) => p.id), ['sunbao', 'hehe', 'doudou'])
  assert.deepEqual(c.pets[0], { id: 'sunbao', since: '2026-10-21', fed: 0, fedToday: { date: '', n: 0 } })
  assert.deepEqual(c.arrivals, [])
  assert.deepEqual(c.gacha, { pulls: 12, sincePity: 4 })
  assert.deepEqual(c.grants, ['preview-1'])
  assert.deepEqual(c.days, { '2026-10-21': true })
  ;['estate', 'opened', 'inventory', 'placed', 'residents', 'collected', 'plots', 'unseen', 'currentSpecies', 'unlocked'].forEach((k) => assert.equal(k in c, false, k))
  assert.equal(c.seq, 0)
  assert.equal(migrated(doc, c), true)
})

test('没领过新手礼的旧档：不补豆豆、bonus 0；熊猫一家也变笋宝、不重复', () => {
  const c = normalizeCamp({ beans: { earned: { '2026-10-22': 10 }, bonus: 0, spent: 0 }, residents: [{ id: 'panda' }, { id: 'panda_family' }] })
  assert.equal(c.welcomed, false)
  assert.equal(c.beans.bonus, 0)
  assert.deepEqual(c.pets.map((p) => p.id), ['sunbao'])
})

test('camp 1 → 2：食盆里的退回背包、张望的（还没住下的）变客人，删掉 bowls / peeking；再读一次不变', () => {
  const doc = { camp: 1, welcomed: true, foods: { xiaomi: 1 }, bowls: ['xiaomi', 'huluobo'], peeking: ['nuonuo', 'doudou'], pets: [{ id: 'doudou', since: '', fed: 0, fedToday: { date: '', n: 0 } }] }
  const c = normalizeCamp(doc)
  assert.equal(c.camp, 4)
  assert.deepEqual(c.foods, { xiaomi: 2, huluobo: 1 })
  assert.deepEqual(c.visitors, [{ id: 'nuonuo', foodId: 'xiaomi', since: '' }])
  assert.deepEqual(c.pot, { date: '', foods: [] })
  assert.ok(!('bowls' in c) && !('peeking' in c))
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  assert.equal(migrated(c, normalizeCamp(c)), false)
})

test('camp 2 → 3：装饰放大了，按摆的先后重新放，挤着的收回背包（owned 不变）；再读一次不变', () => {
  // 原来两盏小灯笼隔 150 摆得下，放大 2.5 倍以后挤着了
  const placed = [{ uid: 'd1', id: 'lantern', x: 3000, y: 3400 }, { uid: 'd2', id: 'lantern', x: 3150, y: 3400 }, { uid: 'd3', id: 'lantern', x: 1200, y: 3400 }]
  const doc = { camp: 2, welcomed: true, decor: { owned: { lantern: 3 }, placed } }
  const c = normalizeCamp(doc)
  assert.equal(c.camp, 4)
  assert.deepEqual(c.decor.owned, { lantern: 3 })
  assert.deepEqual(c.decor.placed.map((p) => p.uid), ['d1', 'd3'])
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  // 已经是 3 以上的不再重新放（摆的时候云函数校验过）
  assert.deepEqual(normalizeCamp({ ...doc, camp: 4 }).decor.placed, placed)
})

test('camp 3 → 4：小帐篷、小树下架按原价退暖豆、从草地上收走；金色小帐篷原地换成金色秋千；再读一次不变', () => {
  const doc = {
    camp: 3, welcomed: true, beans: { earned: { '2026-10-22': 60 }, bonus: 60, spent: 500 },
    decor: {
      owned: { tent: 1, sapling: 2, ball: 1, gold_tent: 1 },
      placed: [{ uid: 'd1', id: 'tent', x: 3000, y: 3600 }, { uid: 'd2', id: 'sapling', x: 1200, y: 3600 }, { uid: 'd3', id: 'ball', x: 3400, y: 3900 }, { uid: 'd4', id: 'gold_tent', x: 1300, y: 3900 }],
    },
  }
  const c = normalizeCamp(doc)
  assert.equal(c.camp, 4)
  assert.equal(c.beans.spent, 500 - 120 - 2 * 80)
  assert.deepEqual(c.decor.owned, { ball: 1, gold_swing: 1 })
  assert.deepEqual(c.decor.placed, [{ uid: 'd3', id: 'ball', x: 3400, y: 3900 }, { uid: 'd4', id: 'gold_swing', x: 1300, y: 3900 }])
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  // 退的不会让花掉的变成负数
  assert.equal(normalizeCamp({ ...doc, beans: { earned: {}, bonus: 0, spent: 50 } }).beans.spent, 0)
})
