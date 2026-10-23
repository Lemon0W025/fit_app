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
  WORLD_SIZE,
  PLOT_SIZE,
  plotOf,
  parsePlot,
  plotNeighbors,
  canExpand,
  expandCost,
  tileOpen,
  collectibleCount,
  ANIMALS,
  waitingAnimals,
  placedOrder,
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

test('pickItem：同稀有度等概率，排除新手大树、小动物和非当季限定', () => {
  const commons = ITEMS.filter((i) => i.rarity === 'common' && !i.starter && !i.term && i.kind !== 'animal')
  assert.equal(pickItem('common', null, 0), commons[0].id)
  assert.equal(pickItem('common', null, 0.9999), commons[commons.length - 1].id)
  for (let k = 0; k < 50; k++) {
    const id = pickItem('rare', 'lidong', k / 50)
    const item = itemById(id)
    assert.ok(!item.term || item.term === 'lidong', id)
  }
})

test('pickItem：当季限定在稀有池里权重 ×4', () => {
  const rares = ITEMS.filter((i) => i.rarity === 'rare' && !i.term && i.kind !== 'animal')
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

test('地图：块坐标、相邻、开荒价格、格子开没开垦', () => {
  assert.equal(PLOT_SIZE, 6)
  assert.equal(WORLD_SIZE, 18)
  assert.equal(plotOf(0, 0), '0,0')
  assert.equal(plotOf(8, 8), '1,1')
  assert.equal(plotOf(17, 6), '2,1')
  assert.deepEqual(parsePlot('2,1'), { pc: 2, pr: 1 })
  assert.equal(parsePlot('3,1'), null)
  assert.equal(parsePlot('x'), null)
  assert.deepEqual(plotNeighbors('1,1').sort(), ['0,1', '1,0', '1,2', '2,1'])
  assert.deepEqual(plotNeighbors('0,0').sort(), ['0,1', '1,0'])
  assert.deepEqual(plotNeighbors('3,3'), [])
  assert.equal(canExpand(['1,1'], '1,0'), true)
  assert.equal(canExpand(['1,1'], '0,0'), false)
  assert.equal(canExpand(['1,1'], '1,1'), false)
  assert.equal(canExpand(['1,1'], '9,9'), false)
  assert.deepEqual([1, 2, 8].map(expandCost), [100, 150, 450])
  assert.equal(tileOpen(['1,1'], 6, 11), true)
  assert.equal(tileOpen(['1,1'], 5, 11), false)
  assert.equal(tileOpen(['1,1'], 6.5, 7), false)
  assert.equal(tileOpen(['1,1'], 18, 7), false)
})

test('小动物：9 只，各有喜欢的物件，扭蛋里抽不到', () => {
  assert.deepEqual(ANIMALS, ['chick', 'rabbit', 'duck', 'turtle', 'tabby_cat', 'panda', 'ginger_cat', 'crane', 'panda_family'])
  for (const id of ANIMALS) {
    const animal = itemById(id)
    assert.equal(animal.kind, 'animal')
    assert.ok(animal.likes.length, id)
    animal.likes.forEach((like) => assert.ok(itemById(like) && itemById(like).kind !== 'animal', like))
  }
  assert.deepEqual(itemById('panda').likes, ['bamboo'])
  assert.equal(itemById('panda_family').likesCount, 3)
  assert.equal(itemById('panda_family').needs, 'panda')
  for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
    for (let k = 0; k < 100; k++) {
      const id = pickItem(rarity, 'lidong', k / 100)
      assert.equal(ANIMALS.indexOf(id), -1, `${rarity} ${id}`)
    }
  }
})

test('placedOrder：摆放编号转成数字', () => {
  assert.equal(placedOrder('p12'), 12)
  assert.equal(placedOrder('a'), 0)
  assert.equal(placedOrder(undefined), 0)
})

test('waitingAnimals：庭院里摆着喜欢的东西才等，按摆放先后排队', () => {
  const placed = [
    { uid: 'p3', itemId: 'grass', c: 0, r: 0 },
    { uid: 'p2', itemId: 'bamboo', c: 1, r: 0 },
    { uid: 'p5', itemId: 'daisy', c: 2, r: 0 },
  ]
  assert.deepEqual(waitingAnimals(placed, []), ['panda', 'chick'])
  // 已经住进来的不再等
  assert.deepEqual(waitingAnimals(placed, ['panda']), ['chick'])
  assert.deepEqual(waitingAnimals([], []), [])
})

test('waitingAnimals：熊猫一家要大熊猫住进来，且摆着 3 丛翠竹', () => {
  const bamboo = (n) => Array.from({ length: n }, (_, i) => ({ uid: `p${i + 1}`, itemId: 'bamboo', c: i, r: 0 }))
  assert.deepEqual(waitingAnimals(bamboo(3), []), ['panda'])
  assert.deepEqual(waitingAnimals(bamboo(2), ['panda']), [])
  assert.deepEqual(waitingAnimals(bamboo(3), ['panda']), ['panda_family'])
  // 按第 3 丛翠竹的编号排队：p3 比 p4 的青草丛早
  const placed = bamboo(3).concat({ uid: 'p4', itemId: 'grass', c: 5, r: 5 })
  assert.deepEqual(waitingAnimals(placed, ['panda']), ['panda_family', 'chick'])
})
