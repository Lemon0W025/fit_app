// test/camp-state.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCamp, migrated } = require('../cloudfunctions/api/lib/camp-state')

test('空文档补齐默认值', () => {
  const c = normalizeCamp(null)
  assert.equal(c.camp, 1)
  assert.equal(c.welcomed, false)
  assert.deepEqual(c.beans, { earned: {}, bonus: 0, spent: 0 })
  assert.deepEqual(c.gacha, { pulls: 0, sincePity: 0 })
  assert.deepEqual(c.foods, {})
  assert.deepEqual(c.bowls, [null, null])
  assert.deepEqual(c.peeking, [null, null])
  assert.deepEqual(c.pets, [])
  assert.deepEqual(c.decor, { owned: {}, placed: [] })
  assert.deepEqual([c.seq, c.gift, c.tasted, c.arrivals, c.grants, c.days], [0, '', [], [], [], {}])
  assert.equal(migrated(null, c), true)
})

test('已经是营地的文档：缺的补上，有的不动', () => {
  const doc = { camp: 1, welcomed: true, beans: { earned: { '2026-10-22': 60 }, bonus: 60, spent: 30 }, foods: { xiaomi: 2 }, bowls: ['xiaomi', null], peeking: ['doudou', null], pets: [{ id: 'doudou', since: '2026-10-22', fed: 4, fedToday: { date: '2026-10-22', n: 1 } }], seq: 3, gift: '2026-10-22' }
  const c = normalizeCamp(doc)
  assert.equal(c.beans.spent, 30)
  assert.deepEqual(c.bowls, ['xiaomi', null])
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
  assert.equal(c.camp, 1)
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
