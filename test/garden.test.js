const test = require('node:test')
const assert = require('node:assert/strict')
const {
  RARITIES,
  ITEMS,
  STAGE_BEANS,
  SPIN_COST,
  WELCOME_BEANS,
  PITY,
  STARTER_ITEM,
  SOLAR_TERMS,
  itemById,
  beanBalance,
  nextStageGain,
  rollRarity,
  pickItem,
  currentTerm,
  gardenSize,
  collectibleCount,
} = require('../cloudfunctions/api/lib/shared/garden')

test('常量', () => {
  assert.deepEqual(STAGE_BEANS, { empty: 0, sprout: 10, small: 20, big: 40, bloom: 50, fruit: 60 })
  assert.equal(SPIN_COST, 30)
  assert.equal(WELCOME_BEANS, 60)
  assert.equal(PITY, 10)
  assert.deepEqual(RARITIES.map((r) => [r.id, r.label, r.weight]), [
    ['common', '普通', 65], ['rare', '稀有', 25], ['epic', '珍稀', 8], ['legendary', '传说', 2],
  ])
})

test('物品表：id 唯一，各稀有度数量，节气限定都能对上节气', () => {
  const ids = ITEMS.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length)
  const pool = ITEMS.filter((i) => !i.starter && !i.term)
  const count = (rarity) => pool.filter((i) => i.rarity === rarity).length
  assert.deepEqual([count('common'), count('rare'), count('epic'), count('legendary')], [15, 15, 9, 4])
  const seasonal = ITEMS.filter((i) => i.term)
  assert.equal(seasonal.length, 5)
  const termKeys = new Set(SOLAR_TERMS.map((t) => t.key))
  seasonal.forEach((i) => {
    assert.ok(termKeys.has(i.term), `${i.id} 的节气 ${i.term} 不在节气表里`)
    assert.equal(i.rarity, 'rare')
  })
  ITEMS.forEach((i) => {
    assert.ok(i.name && i.emoji, i.id)
    assert.ok(['s', 'm', 'l'].includes(i.size), i.id)
    assert.ok(RARITIES.some((r) => r.id === i.rarity), i.id)
  })
  assert.equal(itemById(STARTER_ITEM).starter, true)
  assert.equal(collectibleCount(), 48)
})

test('itemById', () => {
  assert.equal(itemById('panda').name, '大熊猫')
  assert.equal(itemById('nope'), null)
})

test('beanBalance：赚的 + 赠送 - 花掉，缺字段按 0', () => {
  assert.equal(beanBalance({ beans: { earned: { '2026-10-22': 40, '2026-10-23': 20 }, bonus: 60, spent: 90 } }), 30)
  assert.equal(beanBalance({}), 0)
  assert.equal(beanBalance(undefined), 0)
  assert.equal(beanBalance({ beans: { earned: {}, bonus: 0, spent: 30 } }), -30)
})

test('nextStageGain：长到下一阶段能多拿多少豆', () => {
  assert.equal(nextStageGain('empty'), 10)
  assert.equal(nextStageGain('sprout'), 10)
  assert.equal(nextStageGain('small'), 20)
  assert.equal(nextStageGain('big'), 10)
  assert.equal(nextStageGain('bloom'), 10)
  assert.equal(nextStageGain('fruit'), 0)
})

test('rollRarity：按 65/25/8/2 的边界', () => {
  assert.equal(rollRarity(0, 0), 'common')
  assert.equal(rollRarity(0.6499, 0), 'common')
  assert.equal(rollRarity(0.65, 0), 'rare')
  assert.equal(rollRarity(0.8999, 0), 'rare')
  assert.equal(rollRarity(0.9, 0), 'epic')
  assert.equal(rollRarity(0.9799, 0), 'epic')
  assert.equal(rollRarity(0.98, 0), 'legendary')
  assert.equal(rollRarity(0.9999, 0), 'legendary')
})

test('rollRarity：第 10 次保底只在珍稀和传说里抽（8:2）', () => {
  assert.equal(rollRarity(0, PITY - 1), 'epic')
  assert.equal(rollRarity(0.7999, PITY - 1), 'epic')
  assert.equal(rollRarity(0.8, PITY - 1), 'legendary')
  assert.equal(rollRarity(0, PITY - 2), 'common')
})

test('pickItem：同稀有度等概率，排除新手大树和非当季限定', () => {
  const commons = ITEMS.filter((i) => i.rarity === 'common' && !i.starter && !i.term)
  assert.equal(pickItem('common', null, 0), commons[0].id)
  assert.equal(pickItem('common', null, 0.9999), commons[commons.length - 1].id)
  for (let k = 0; k < 50; k++) {
    const id = pickItem('rare', 'lidong', k / 50)
    const item = itemById(id)
    assert.ok(!item.term || item.term === 'lidong', id)
  }
})

test('pickItem：当季限定在稀有池里权重 ×4', () => {
  const rares = ITEMS.filter((i) => i.rarity === 'rare' && !i.term)
  const total = rares.length + 4
  // 限定款排在池子最后，占最后 4/total 的区间
  assert.equal(pickItem('rare', 'dongzhi', 0.9999), 'dumpling_steamer')
  assert.equal(pickItem('rare', 'dongzhi', (rares.length + 0.01) / total), 'dumpling_steamer')
  assert.notEqual(pickItem('rare', 'dongzhi', (rares.length - 0.01) / total), 'dumpling_steamer')
  assert.notEqual(pickItem('rare', null, 0.9999), 'dumpling_steamer')
})

test('currentTerm：按北京时间日期找当前节气', () => {
  assert.equal(currentTerm('2026-10-23').name, '霜降')
  assert.equal(currentTerm('2026-10-23').key, 'shuangjiang')
  assert.equal(currentTerm('2026-10-22').name, '寒露')
  assert.equal(currentTerm('2026-11-07').name, '立冬')
  assert.equal(currentTerm('2026-12-21').name, '大雪')
  assert.equal(currentTerm('2026-12-22').name, '冬至')
  assert.equal(currentTerm('2027-12-31').name, '冬至')
  assert.equal(currentTerm('2026-01-01'), null)
})

test('gardenSize：图鉴集齐 20 种扩成 8×8', () => {
  assert.equal(gardenSize(0), 6)
  assert.equal(gardenSize(19), 6)
  assert.equal(gardenSize(20), 8)
})
