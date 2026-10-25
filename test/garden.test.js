const test = require('node:test')
const assert = require('node:assert/strict')
const G = require('../cloudfunctions/api/lib/shared/garden')

test('常量', () => {
  assert.equal(G.SPIN_COST, 30)
  assert.equal(G.WELCOME_BEANS, 60)
  assert.equal(G.PITY, 10)
  assert.deepEqual(G.RARITIES.map((r) => [r.id, r.label, r.weight]), [
    ['common', '普通', 65], ['rare', '稀有', 25], ['epic', '珍稀', 8], ['legendary', '传说', 2],
  ])
  assert.ok(G.SOLAR_TERMS.length >= 24)
  assert.ok(G.SOLAR_TERMS.every((t) => t.key && t.name && /^\d{4}-\d{2}-\d{2}$/.test(t.start)))
})

test('beanBalance', () => {
  assert.equal(G.beanBalance({ beans: { earned: { a: 10, b: 20 }, bonus: 5, spent: 15 } }), 20)
  assert.equal(G.beanBalance({}), 0)
  assert.equal(G.nextStageGain, undefined)
})

test('rollRarity：按权重，保底前一抽只出珍稀以上', () => {
  assert.equal(G.rollRarity(0, 0), 'common')
  assert.equal(G.rollRarity(0.66, 0), 'rare')
  assert.equal(G.rollRarity(0.92, 0), 'epic')
  assert.equal(G.rollRarity(0.995, 0), 'legendary')
  assert.equal(G.rollRarity(0, G.PITY - 1), 'epic')
  assert.equal(G.rollRarity(0.99, G.PITY - 1), 'legendary')
  assert.equal(G.pickWeighted([{ value: 'a', weight: 1 }, { value: 'b', weight: 3 }], 0.5), 'b')
})

test('currentTerm', () => {
  assert.equal(G.currentTerm('2026-10-22').key, 'hanlu')
  assert.equal(G.currentTerm('2026-12-25').key, 'dongzhi')
  assert.equal(G.currentTerm('2020-01-01'), null)
})
