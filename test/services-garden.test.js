const test = require('node:test')
const assert = require('node:assert/strict')
const { createGardenService } = require('../cloudfunctions/api/services/garden')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')
const { ITEMS, PITY, itemById } = require('../cloudfunctions/api/lib/shared/garden')

// 按顺序返回预设随机数；用完后一直返回 0
function sequence(values) {
  const queue = [...values]
  return () => (queue.length ? queue.shift() : 0)
}

function setup({ random = sequence([]), garden, now = NOW } = {}) {
  const repo = createFakeRepo()
  if (garden) repo.state.gardens.set('u1', garden)
  const service = createGardenService({ repo, now: () => now, random })
  return { repo, service }
}

const richGarden = (extra = {}) => ({ welcomed: true, beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 0 }, ...extra })

test('get：第一次进来送 60 暖豆和一棵大树，只送一次', async () => {
  const { repo, service } = setup()
  const first = await service.get('u1')
  assert.deepEqual(first.welcome, { beans: 60, itemId: 'starter_tree' })
  assert.equal(first.beans, 60)
  assert.equal(first.size, 6)
  assert.equal(first.placed.length, 1)
  assert.equal(first.placed[0].itemId, 'starter_tree')
  assert.deepEqual([first.placed[0].c, first.placed[0].r], [2, 2])
  assert.ok(first.placed[0].uid)
  assert.equal(first.collectedCount, 0)
  assert.equal(first.totalCount, 48)
  assert.equal(first.spinCost, 30)
  assert.equal(first.pityLeft, PITY)
  assert.deepEqual(first.rates.map((r) => r.weight), [65, 25, 8, 2])
  // 测试时间 2026-10-22 还在寒露，寒露没有限定款
  assert.equal(first.term.name, '寒露')
  assert.deepEqual(first.term.items, [])

  const second = await service.get('u1')
  assert.equal(second.welcome, null)
  assert.equal(second.beans, 60)
  assert.equal(second.placed.length, 1)
  assert.equal((await repo.getGarden('u1')).beans.bonus, 60)
})

test('get：打卡赚的豆计入余额，负数显示为 0', async () => {
  const { service } = setup({ garden: { welcomed: true, beans: { earned: { '2026-10-21': 40, [TODAY]: 20 }, bonus: 60, spent: 90 } } })
  assert.equal((await service.get('u1')).beans, 30)
  const { service: s2 } = setup({ garden: { welcomed: true, beans: { earned: {}, bonus: 0, spent: 30 } } })
  assert.equal((await s2.get('u1')).beans, 0)
})

test('spin：扣 30 豆，物品进背包，第一次抽到算新物品', async () => {
  // rollRarity(0) → 普通；pickItem(普通, 0) → 普通池第一个
  const { repo, service } = setup({ random: sequence([0, 0, 0, 0]), garden: richGarden() })
  const res = await service.spin('u1')
  assert.equal(res.rarity, 'common')
  assert.equal(res.itemId, 'daisy')
  assert.equal(res.isNew, true)
  assert.equal(res.beans, 90)
  assert.equal(res.pityLeft, PITY - 1)
  assert.equal(res.collectedCount, 1)

  const again = await service.spin('u1')
  assert.equal(again.itemId, 'daisy')
  assert.equal(again.isNew, false)
  assert.equal(again.beans, 60)
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.inventory, { daisy: 2 })
  assert.deepEqual(garden.collected, ['daisy'])
  assert.equal(garden.beans.spent, 60)
  assert.equal(garden.gacha.pulls, 2)
})

test('spin：豆不够时 NO_BEANS', async () => {
  const { service } = setup({ garden: { welcomed: true, beans: { earned: { [TODAY]: 20 }, bonus: 0, spent: 0 } } })
  await assert.rejects(service.spin('u1'), (e) => {
    assert.equal(e.code, 'NO_BEANS')
    assert.match(e.message, /暖豆不够/)
    return true
  })
})

test('spin：抽到珍稀及以上重置保底计数', async () => {
  const { repo, service } = setup({ random: sequence([0.95, 0]), garden: richGarden({ gacha: { pulls: 5, sincePity: 5 } }) })
  const res = await service.spin('u1')
  assert.equal(res.rarity, 'epic')
  assert.equal(res.pityLeft, PITY)
  assert.equal((await repo.getGarden('u1')).gacha.sincePity, 0)
})

test('spin：连续 9 次没出珍稀，第 10 次保底', async () => {
  const { service } = setup({ random: sequence([0, 0]), garden: richGarden({ gacha: { pulls: 9, sincePity: PITY - 1 } }) })
  const res = await service.spin('u1')
  assert.ok(['epic', 'legendary'].includes(res.rarity))
})

test('spin：当季限定会出现在稀有池里', async () => {
  // 稀有 → 0.7；稀有池最后一段是当季限定（霜降：柿饼架）
  const shuangjiang = new Date('2026-10-24T04:00:00Z')
  const { service } = setup({ random: sequence([0.7, 0.9999]), garden: richGarden(), now: shuangjiang })
  const res = await service.spin('u1')
  assert.equal(res.itemId, 'dried_persimmon')
  assert.equal(itemById(res.itemId).term, 'shuangjiang')
  assert.deepEqual((await service.get('u1')).term, { name: '霜降', items: ['dried_persimmon'] })

  // 不在霜降期间就抽不到
  const { service: off } = setup({ random: sequence([0.7, 0.9999]), garden: richGarden() })
  assert.notEqual((await off.spin('u1')).itemId, 'dried_persimmon')
})

test('spin：图鉴集齐 20 种时庭院扩成 8×8', async () => {
  // 已有 19 种（不含小板凳），这次抽中小板凳凑满 20 种
  const collected = ITEMS.filter((i) => !i.starter && i.id !== 'stool').slice(0, 19).map((i) => i.id)
  const target = itemById('stool')
  const commons = ITEMS.filter((i) => i.rarity === 'common' && !i.starter && !i.term)
  const index = commons.indexOf(target)
  const { service } = setup({
    random: sequence([0, (index + 0.5) / commons.length]),
    garden: richGarden({ collected }),
  })
  const res = await service.spin('u1')
  assert.equal(res.isNew, true)
  assert.equal(res.collectedCount, 20)
  assert.equal(res.size, 8)
  assert.equal(res.sizeGrew, true)
})

test('place：从背包摆到空地上', async () => {
  const { repo, service } = setup({ garden: richGarden({ inventory: { daisy: 2 } }) })
  const view = await service.place('u1', { itemId: 'daisy', c: 0, r: 5 })
  assert.equal(view.placed.length, 1)
  assert.deepEqual([view.placed[0].itemId, view.placed[0].c, view.placed[0].r], ['daisy', 0, 5])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 1 }])
  await service.place('u1', { itemId: 'daisy', c: 1, r: 5 })
  assert.deepEqual((await repo.getGarden('u1')).inventory, {})
})

test('place：背包里没有、出界、格子被占都不行', async () => {
  const { service } = setup({ garden: richGarden({ inventory: { daisy: 1 }, placed: [{ uid: 'a', itemId: 'panda', c: 1, r: 1 }] }) })
  await assert.rejects(service.place('u1', { itemId: 'panda', c: 0, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 6, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: -1, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 1.5, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 1, r: 1 }), (e) => {
    assert.match(e.message, /已经有东西/)
    return true
  })
})

test('move：换到空地，可以原地不动，不能压在别的东西上', async () => {
  const placed = [{ uid: 'a', itemId: 'panda', c: 1, r: 1 }, { uid: 'b', itemId: 'daisy', c: 2, r: 2 }]
  const { service } = setup({ garden: richGarden({ placed }) })
  const view = await service.move('u1', { uid: 'a', c: 3, r: 4 })
  assert.deepEqual(view.placed.find((p) => p.uid === 'a'), { uid: 'a', itemId: 'panda', c: 3, r: 4 })
  await service.move('u1', { uid: 'a', c: 3, r: 4 })
  await assert.rejects(service.move('u1', { uid: 'a', c: 2, r: 2 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.move('u1', { uid: 'zzz', c: 0, r: 0 }), { code: 'NOT_FOUND' })
})

test('stash：收回背包', async () => {
  const { repo, service } = setup({ garden: richGarden({ inventory: { panda: 1 }, placed: [{ uid: 'a', itemId: 'panda', c: 1, r: 1 }] }) })
  const view = await service.stash('u1', { uid: 'a' })
  assert.equal(view.placed.length, 0)
  assert.deepEqual(view.inventory, [{ itemId: 'panda', count: 2 }])
  assert.deepEqual((await repo.getGarden('u1')).inventory, { panda: 2 })
  await assert.rejects(service.stash('u1', { uid: 'a' }), { code: 'NOT_FOUND' })
})

test('背包按物品表顺序排列', async () => {
  const { service } = setup({ garden: richGarden({ inventory: { panda: 1, daisy: 3, zero: 0 } }) })
  const view = await service.get('u1')
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 3 }, { itemId: 'panda', count: 1 }])
})
