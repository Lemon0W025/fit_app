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

const richGarden = (extra = {}) => ({ welcomed: true, plots: ['0,0'], beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 0 }, ...extra })

test('get：第一次进来送 60 暖豆和一棵大树，只送一次', async () => {
  const { repo, service } = setup()
  const first = await service.get('u1')
  assert.deepEqual(first.welcome, { beans: 60, itemId: 'starter_tree' })
  assert.equal(first.beans, 60)
  assert.deepEqual(first.plots, ['1,1'])
  assert.equal(first.expandCost, 100)
  assert.equal(first.placed.length, 1)
  assert.equal(first.placed[0].itemId, 'starter_tree')
  assert.deepEqual([first.placed[0].c, first.placed[0].r], [8, 8])
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
  const { service } = setup({ garden: richGarden({ inventory: { daisy: 1 }, placed: [{ uid: 'a', itemId: 'pavilion', c: 1, r: 1 }] }) })
  await assert.rejects(service.place('u1', { itemId: 'pavilion', c: 0, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 6, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: -1, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 1.5, r: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 1, r: 1 }), (e) => {
    assert.match(e.message, /已经有东西/)
    return true
  })
})

test('move：换到空地，可以原地不动，不能压在别的东西上', async () => {
  const placed = [{ uid: 'a', itemId: 'pavilion', c: 1, r: 1 }, { uid: 'b', itemId: 'daisy', c: 2, r: 2 }]
  const { service } = setup({ garden: richGarden({ placed }) })
  const view = await service.move('u1', { uid: 'a', c: 3, r: 4 })
  assert.deepEqual(view.placed.find((p) => p.uid === 'a'), { uid: 'a', itemId: 'pavilion', c: 3, r: 4 })
  await service.move('u1', { uid: 'a', c: 3, r: 4 })
  await assert.rejects(service.move('u1', { uid: 'a', c: 2, r: 2 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.move('u1', { uid: 'zzz', c: 0, r: 0 }), { code: 'NOT_FOUND' })
})

test('stash：收回背包', async () => {
  const { repo, service } = setup({ garden: richGarden({ inventory: { pavilion: 1 }, placed: [{ uid: 'a', itemId: 'pavilion', c: 1, r: 1 }] }) })
  const view = await service.stash('u1', { uid: 'a' })
  assert.equal(view.placed.length, 0)
  assert.deepEqual(view.inventory, [{ itemId: 'pavilion', count: 2 }])
  assert.deepEqual((await repo.getGarden('u1')).inventory, { pavilion: 2 })
  await assert.rejects(service.stash('u1', { uid: 'a' }), { code: 'NOT_FOUND' })
})

test('背包按物品表顺序排列', async () => {
  const { service } = setup({ garden: richGarden({ inventory: { pavilion: 1, daisy: 3, zero: 0 } }) })
  const view = await service.get('u1')
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 3 }, { itemId: 'pavilion', count: 1 }])
})

test('view：住户、新住户、在等的小动物', async () => {
  const { service } = setup({
    garden: richGarden({
      placed: [{ uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }, { uid: 'p2', itemId: 'grass', c: 1, r: 0 }],
      residents: [{ id: 'chick', since: '2026-10-20' }],
      arrivals: ['chick'],
    }),
  })
  const view = await service.get('u1')
  assert.deepEqual(view.residents, ['chick'])
  assert.deepEqual(view.arrivals, ['chick'])
  assert.deepEqual(view.waiting, ['panda'])
})

test('arrive：摆了翠竹，熊猫搬来，一次只来一只', async () => {
  const { repo, service } = setup({
    garden: richGarden({ placed: [{ uid: 'p2', itemId: 'grass', c: 1, r: 0 }, { uid: 'p1', itemId: 'bamboo', c: 0, r: 0 }] }),
  })
  assert.deepEqual(await service.arrive('u1'), { id: 'panda', name: '大熊猫' })
  let stored = await repo.getGarden('u1')
  assert.deepEqual(stored.residents, [{ id: 'panda', since: TODAY }])
  assert.deepEqual(stored.arrivals, ['panda'])
  assert.ok(stored.collected.indexOf('panda') !== -1)

  assert.deepEqual(await service.arrive('u1'), { id: 'chick', name: '小黄鸡' })
  assert.equal(await service.arrive('u1'), null)
  stored = await repo.getGarden('u1')
  assert.deepEqual(stored.residents.map((r) => r.id), ['panda', 'chick'])
  assert.deepEqual(stored.arrivals, ['panda', 'chick'])
})

test('arrive：没有在等的动物时不写数据库', async () => {
  const { repo, service } = setup()
  assert.equal(await service.arrive('u1'), null)
  assert.equal(await repo.getGarden('u1'), null)
})

test('get：庭院页带 markSeen 才把新住户标成看过', async () => {
  const { repo, service } = setup({ garden: richGarden({ residents: [{ id: 'panda', since: TODAY }], arrivals: ['panda'] }) })
  assert.deepEqual((await service.get('u1')).arrivals, ['panda'])
  assert.deepEqual((await repo.getGarden('u1')).arrivals, ['panda'])
  assert.deepEqual((await service.get('u1', { markSeen: true })).arrivals, ['panda'])
  assert.deepEqual((await repo.getGarden('u1')).arrivals, [])
  assert.deepEqual((await service.get('u1', { markSeen: true })).arrivals, [])
})

test('旧数据：扭蛋抽到的小动物变成住户，不放进新住户', async () => {
  const { service } = setup({
    garden: richGarden({
      inventory: { panda: 1, daisy: 2 },
      placed: [{ uid: 'p1', itemId: 'crane', c: 0, r: 0 }, { uid: 'p2', itemId: 'daisy', c: 1, r: 0 }],
      collected: ['panda', 'crane', 'daisy'],
    }),
  })
  const view = await service.get('u1')
  assert.deepEqual(view.residents.sort(), ['crane', 'panda'])
  assert.deepEqual(view.arrivals, [])
  assert.deepEqual(view.inventory, [{ itemId: 'daisy', count: 2 }])
  assert.deepEqual(view.placed.map((p) => p.itemId), ['daisy'])
})

test('expand：花暖豆开垦相邻的荒地，价格递增', async () => {
  const { repo, service } = setup({ garden: { welcomed: true, plots: ['1,1'], beans: { earned: {}, bonus: 400, spent: 0 } } })
  let view = await service.expand('u1', { plot: '1,0' })
  assert.deepEqual(view.plots, ['1,1', '1,0'])
  assert.equal(view.beans, 300)
  assert.equal(view.expandCost, 150)
  assert.deepEqual(view.world, { plotSize: 6, grid: 3 })
  view = await service.expand('u1', { plot: '2,0' })
  assert.equal(view.beans, 150)
  assert.equal(view.expandCost, 200)
  assert.equal((await repo.getGarden('u1')).beans.spent, 250)
})

test('expand：不相邻、已开垦、不在地图里、暖豆不够都不行', async () => {
  const { service } = setup({ garden: { welcomed: true, plots: ['1,1'], beans: { earned: {}, bonus: 120, spent: 0 } } })
  await assert.rejects(service.expand('u1', { plot: '0,0' }), { code: 'BAD_REQUEST', message: '要挨着已经开垦的地才能开荒' })
  await assert.rejects(service.expand('u1', { plot: '1,1' }), { code: 'BAD_REQUEST', message: '这块地已经开垦过了' })
  await assert.rejects(service.expand('u1', { plot: '3,1' }), { code: 'BAD_REQUEST', message: '这块地不在庭院里' })
  await assert.rejects(service.expand('u1', {}), { code: 'BAD_REQUEST', message: '这块地不在庭院里' })
  await service.expand('u1', { plot: '0,1' })
  await assert.rejects(service.expand('u1', { plot: '2,1' }), { code: 'NO_BEANS', message: '暖豆不够啦，开荒要 150 暖豆，再攒攒' })
})

test('全部开垦完，expandCost 是 null', async () => {
  const all = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']
  const { service } = setup({ garden: richGarden({ plots: all }) })
  assert.equal((await service.get('u1')).expandCost, null)
})

test('place / move：只能放在开垦了的地上', async () => {
  const { service } = setup({ garden: richGarden({ plots: ['1,1'], inventory: { daisy: 2 }, placed: [{ uid: 'p1', itemId: 'pavilion', c: 7, r: 7 }] }) })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 0, r: 0 }), { code: 'BAD_REQUEST', message: '这块地还没开荒呢' })
  await assert.rejects(service.place('u1', { itemId: 'daisy', c: 18, r: 0 }), { code: 'BAD_REQUEST', message: '放不到庭院外面哦' })
  await service.place('u1', { itemId: 'daisy', c: 6, r: 11 })
  await assert.rejects(service.move('u1', { uid: 'p1', c: 12, r: 7 }), { code: 'BAD_REQUEST', message: '这块地还没开荒呢' })
})

test('旧数据：小庭院的坐标挪进中间那块，越界的东西所在的地块直接开垦', async () => {
  const { service } = setup({
    garden: { welcomed: true, placed: [{ uid: 'p1', itemId: 'starter_tree', c: 2, r: 2 }, { uid: 'p2', itemId: 'daisy', c: 7, r: 0 }] },
  })
  const view = await service.get('u1')
  assert.deepEqual(view.placed.map((p) => [p.itemId, p.c, p.r]), [['starter_tree', 8, 8], ['daisy', 13, 6]])
  assert.deepEqual(view.plots, ['1,1', '2,1'])
})

test('测试福利：期限内每个 id 只送一次，过期不送', async () => {
  let grant = { id: 'g1', beans: 500, until: TODAY }
  const repo = createFakeRepo()
  repo.state.gardens.set('u1', richGarden())
  const service = createGardenService({ repo, now: () => NOW, getGrant: () => grant })
  const first = await service.get('u1')
  assert.equal(first.testGift, 500)
  assert.equal(first.beans, 620)
  assert.deepEqual((await repo.getGarden('u1')).grants, ['g1'])
  const again = await service.get('u1')
  assert.equal(again.testGift, 0)
  assert.equal(again.beans, 620)
  grant = { id: 'g2', beans: 100, until: '2026-10-21' }
  assert.equal((await service.get('u1')).testGift, 0)
  grant = null
  assert.equal((await service.get('u1')).testGift, 0)
})
