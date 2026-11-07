// test/camp-state.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCamp, migrated } = require('../cloudfunctions/api/lib/camp-state')
const { POT_STAY_MS } = require('../cloudfunctions/api/lib/shared/camp')

const NOW_MS = Date.parse('2026-10-22T04:00:00Z') // 北京时间 10/22 12:00
const TODAY = '2026-10-22'
const FED = { date: '', n: 0 }

test('空文档补齐默认值', () => {
  const c = normalizeCamp(null)
  assert.equal(c.camp, 5)
  assert.equal(c.welcomed, false)
  assert.deepEqual(c.beans, { earned: {}, bonus: 0, spent: 0 })
  assert.deepEqual(c.gacha, { pulls: 0, sincePity: 0 })
  assert.deepEqual(c.foods, {})
  assert.deepEqual(c.pot, { items: [] })
  assert.ok(!('bowls' in c) && !('peeking' in c) && !('visitors' in c) && !('arrivals' in c))
  assert.deepEqual(c.pets, [])
  assert.deepEqual(c.decor, { owned: {}, placed: [] })
  assert.deepEqual([c.seq, c.gift, c.tasted, c.grants, c.days], [0, '', [], [], {}])
  assert.equal(migrated(null, c), true)
})

test('已经是营地的文档：缺的补上，有的不动', () => {
  const doc = {
    camp: 5, welcomed: true, beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 30 }, foods: { xiaomi: 2 },
    pot: { items: [{ foodId: 'xiaomi', at: NOW_MS - 1000, date: TODAY }] },
    pets: [{ id: 'doudou', since: TODAY, fed: 4, fedToday: { date: TODAY, n: 1 }, home: true, until: 0 }, { id: 'nuonuo', since: TODAY, fed: 3, fedToday: FED, home: false, until: NOW_MS + 1000 }],
    seq: 3, gift: TODAY,
  }
  const c = normalizeCamp(doc, NOW_MS)
  assert.equal(c.beans.spent, 30)
  assert.deepEqual(c.pot, doc.pot)
  assert.deepEqual(c.pets, doc.pets)
  assert.equal(c.seq, 3)
  assert.deepEqual(c.decor, { owned: {}, placed: [] })
  assert.equal(migrated(doc, c), false)
  // 豆豆没写 home 也算住下
  assert.equal(normalizeCamp({ ...doc, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: FED }] }, NOW_MS).pets[0].home, true)
})

test('camp 4 → 5（常客模式）：今天的锅当刚下锅、管 8 小时；豆豆和 5 级的住下，其余是常客（能待到锅到期）；客人变常客；arrivals 不要了', () => {
  const doc = {
    camp: 4, welcomed: true, foods: {}, pot: { date: TODAY, foods: ['xiaomi', 'huluobo'] },
    pets: [{ id: 'doudou', since: TODAY, fed: 1, fedToday: FED }, { id: 'qiqi', since: TODAY, fed: 2, fedToday: FED }, { id: 'hehe', since: TODAY, fed: 30, fedToday: FED }],
    visitors: [{ id: 'nuonuo', foodId: 'huluobo', since: TODAY }, { id: 'qiqi', foodId: 'xiaomi', since: TODAY }],
    arrivals: ['qiqi'],
  }
  const c = normalizeCamp(doc, NOW_MS)
  assert.equal(c.camp, 5)
  const until = NOW_MS + POT_STAY_MS
  assert.deepEqual(c.pot, { items: [{ foodId: 'xiaomi', at: NOW_MS, date: TODAY }, { foodId: 'huluobo', at: NOW_MS, date: TODAY }] })
  assert.deepEqual(c.pets.map((p) => [p.id, p.home, p.until, p.fed]), [['doudou', true, 0, 1], ['qiqi', false, until, 2], ['hehe', true, 0, 30], ['nuonuo', false, until, 0]])
  assert.ok(!('visitors' in c) && !('arrivals' in c))
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c, NOW_MS), c)
  // 锅不是今天的：当空锅，常客迁完就不在场（until 0），下次煮它爱吃的再来
  const stale = normalizeCamp({ ...doc, pot: { date: '2026-10-21', foods: ['xiaomi'] } }, NOW_MS)
  assert.deepEqual(stale.pot, { items: [] })
  assert.deepEqual(stale.pets.map((p) => p.until), [0, 0, 0, 0])
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
  assert.equal(c.camp, 5)
  assert.deepEqual(c.beans, { earned: { '2026-10-20': 40, '2026-10-21': 60 }, bonus: 60, spent: 0 })
  assert.deepEqual(c.pets.map((p) => p.id), ['sunbao', 'hehe', 'doudou'])
  assert.deepEqual(c.pets[0], { id: 'sunbao', since: '2026-10-21', fed: 0, fedToday: { date: '', n: 0 }, home: false, until: 0 })
  assert.equal(c.pets[2].home, true)
  assert.ok(!('arrivals' in c))
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
  assert.equal(c.camp, 5)
  assert.deepEqual(c.foods, { xiaomi: 2, huluobo: 1 })
  // 张望的变客人（camp 2），客人再变常客（camp 5）：锅空着，就先不在场
  assert.deepEqual(c.pets.map((p) => [p.id, p.home, p.until]), [['doudou', true, 0], ['nuonuo', false, 0]])
  assert.deepEqual(c.pot, { items: [] })
  assert.ok(!('bowls' in c) && !('peeking' in c) && !('visitors' in c))
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  assert.equal(migrated(c, normalizeCamp(c)), false)
})

test('camp 2 → 3：装饰放大了，按摆的先后重新放，挤着的收回背包（owned 不变）；再读一次不变', () => {
  // 原来两盏小灯笼隔 150 摆得下，放大 2.5 倍以后挤着了
  const placed = [{ uid: 'd1', id: 'lantern', x: 3000, y: 3400 }, { uid: 'd2', id: 'lantern', x: 3150, y: 3400 }, { uid: 'd3', id: 'lantern', x: 1200, y: 3400 }]
  const doc = { camp: 2, welcomed: true, decor: { owned: { lantern: 3 }, placed } }
  const c = normalizeCamp(doc)
  assert.equal(c.camp, 5)
  assert.deepEqual(c.decor.owned, { lantern: 3 })
  assert.deepEqual(c.decor.placed.map((p) => p.uid), ['d1', 'd3'])
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  // 已经是 3 以上的不再重新放（摆的时候云函数校验过）
  assert.deepEqual(normalizeCamp({ ...doc, camp: 5 }).decor.placed, placed)
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
  assert.equal(c.camp, 5)
  assert.equal(c.beans.spent, 500 - 120 - 2 * 80)
  assert.deepEqual(c.decor.owned, { ball: 1, gold_swing: 1 })
  assert.deepEqual(c.decor.placed, [{ uid: 'd3', id: 'ball', x: 3400, y: 3900 }, { uid: 'd4', id: 'gold_swing', x: 1300, y: 3900 }])
  assert.equal(migrated(doc, c), true)
  assert.deepEqual(normalizeCamp(c), c)
  // 退的不会让花掉的变成负数
  assert.equal(normalizeCamp({ ...doc, beans: { earned: {}, bonus: 0, spent: 50 } }).beans.spent, 0)
})
