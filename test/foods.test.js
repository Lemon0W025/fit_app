// test/foods.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const F = require('../cloudfunctions/api/lib/shared/foods')
const { PETS } = require('../cloudfunctions/api/lib/shared/pets')

test('23 样食物 + 10 节气点心', () => {
  assert.equal(F.FOODS.length, 23)
  assert.equal(new Set(F.FOODS.map((f) => f.id)).size, 23)
  const count = (r) => F.FOODS.filter((f) => f.rarity === r).length
  assert.deepEqual([count('common'), count('rare'), count('epic'), count('legendary')], [8, 8, 6, 1])
  assert.equal(F.TREATS.length, 10)
  F.TREATS.forEach((t) => assert.ok(t.term && t.rarity === 'rare' && t.tip, t.id))
  F.FOODS.forEach((f) => assert.ok(f.name && f.tip, f.id))
  assert.equal(F.foodById('shanzha').rarity, 'legendary')
  assert.equal(F.foodById('jiaozi').term, 'dongzhi')
  assert.equal(F.foodById('nope'), null)
  // 每样食物都有宠物爱吃；除了莲子，每只的两样都和它同档
  F.FOODS.forEach((f) => assert.ok(PETS.some((p) => p.foods.indexOf(f.id) !== -1), f.id))
  PETS.forEach((p) => p.foods.forEach((id) => {
    if (id === 'lianzi' && p.id === 'hehe') return
    assert.equal(F.foodById(id).rarity, p.rarity, `${p.id} ${id}`)
  }))
})

test('pickFood：按档抽，节气点心只在当季进池、权重更高', () => {
  const ids = new Set()
  for (let i = 0; i < 200; i++) ids.add(F.pickFood('common', 'hanlu', i / 200))
  assert.equal(ids.size, 8)
  assert.equal(F.pickFood('legendary', 'hanlu', 0.5), 'shanzha')
  const winter = new Set()
  for (let i = 0; i < 200; i++) winter.add(F.pickFood('rare', 'dongzhi', i / 200))
  assert.ok(winter.has('jiaozi'))
  assert.ok(!winter.has('shibing'))
  assert.equal(F.pickFood('rare', 'dongzhi', 0.999), 'jiaozi') // 点心在池尾、权重 SEASONAL_WEIGHT
})

test('feedGain：爱吃 +3、不爱吃 +1、节气点心 +5', () => {
  assert.equal(F.feedGain('sunbao', 'zhusun'), 3)
  assert.equal(F.feedGain('sunbao', 'xiaomi'), 1)
  assert.equal(F.feedGain('sunbao', 'jiaozi'), 5)
  assert.equal(F.feedGain('nope', 'xiaomi'), 0)
  assert.equal(F.feedGain('sunbao', 'nope'), 0)
})

test('arrivalFor：爱吃、同档、还没住进来的里随机一只；莲子引不来鹤鹤；都住下了返回 null', () => {
  assert.equal(F.arrivalFor('xiaomi', [], 0), 'doudou')
  assert.equal(F.arrivalFor('xiaomi', ['doudou'], 0), null)
  assert.equal(F.arrivalFor('lianzi', [], 0), 'lianlian')
  assert.equal(F.arrivalFor('lianzi', ['lianlian'], 0), null)
  assert.equal(F.arrivalFor('shanzha', [], 0.7), 'hehe')
  assert.equal(F.arrivalFor('jiaozi', [], 0), null)
  assert.equal(F.arrivalFor('nope', [], 0), null)
})
