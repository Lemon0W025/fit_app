// test/services-camp.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createCampService } = require('../cloudfunctions/api/services/camp')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')
const { PITY } = require('../cloudfunctions/api/lib/shared/garden')
const { GOLD_TENT } = require('../cloudfunctions/api/lib/shared/decor')

function sequence(values) {
  const queue = [...values]
  return () => (queue.length ? queue.shift() : 0)
}

// NOW 是 2026-10-22 04:00Z，即北京时间 12 点；hourOf 可注入
function setup({ random = sequence([]), camp, now = NOW, hour = 12, getGrant } = {}) {
  const repo = createFakeRepo()
  if (camp) repo.state.gardens.set('u1', camp)
  const service = createCampService({ repo, now: () => now, random, hourOf: () => hour, getGrant })
  return { repo, service }
}

const rich = (extra = {}) => ({ camp: 1, welcomed: true, beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 0 }, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: { date: '', n: 0 } }], ...extra })

test('get：第一次进来送 60 暖豆，豆豆住进来，只送一次', async () => {
  const { repo, service } = setup()
  const first = await service.get('u1')
  assert.deepEqual(first.welcome, { beans: 60, petId: 'doudou' })
  assert.equal(first.beans, 60)
  assert.deepEqual(first.pets.map((p) => [p.id, p.level, p.next]), [['doudou', 1, 3]])
  assert.deepEqual(first.bowls, [{ food: null, peeking: null }, { food: null, peeking: null }])
  assert.equal(first.spinCost, 30)
  assert.equal(first.pityLeft, PITY)
  assert.deepEqual(first.rates.map((r) => r.weight), [65, 25, 8, 2])
  assert.deepEqual(first.term, { name: '寒露', treats: [] })
  assert.equal(first.giftReady, false)
  assert.equal(first.hasProfile, false)
  assert.equal(first.daily, null)
  const second = await service.get('u1')
  assert.equal(second.welcome, null)
  assert.equal((await repo.getGarden('u1')).beans.bonus, 60)
  assert.equal((await repo.getGarden('u1')).camp, 1)
})

test('get：测试福利只送一次；markSeen 清掉新住户', async () => {
  const { service } = setup({ camp: rich({ arrivals: ['doudou'] }), getGrant: () => ({ id: 'g1', beans: 500, until: '2026-12-31' }) })
  const v = await service.get('u1', { markSeen: true })
  assert.equal(v.testGift, 500)
  assert.equal(v.beans, 620)
  assert.deepEqual(v.arrivals, ['doudou'])
  const again = await service.get('u1')
  assert.equal(again.testGift, 0)
  assert.deepEqual(again.arrivals, [])
})

test('spin：扣 30 暖豆，按随机数抽食物，保底，节气点心入池', async () => {
  const { repo, service } = setup({ camp: rich(), random: sequence([0.1, 0.0, 0.999, 0.0]) })
  const r = await service.spin('u1')
  assert.deepEqual([r.foodId, r.rarity, r.isNew, r.beans, r.pityLeft], ['xiaomi', 'common', true, 90, PITY - 1])
  const stored = await repo.getGarden('u1')
  assert.deepEqual(stored.foods, { xiaomi: 1 })
  assert.deepEqual(stored.tasted, ['xiaomi'])
  const r2 = await service.spin('u1')
  assert.equal(r2.rarity, 'legendary')
  assert.equal(r2.foodId, 'shanzha')
  assert.equal((await repo.getGarden('u1')).gacha.sincePity, 0)
  const poor = setup({ camp: rich({ beans: { earned: {}, bonus: 20, spent: 0 } }) })
  await assert.rejects(poor.service.spin('u1'), { code: 'NO_BEANS' })
})

test('putFood / takeFood：放进食盆就定下来引谁，拿回来清掉', async () => {
  const { repo, service } = setup({ camp: rich({ foods: { huluobo: 1, xiaomi: 1 } }), random: sequence([0]) })
  const v = await service.putFood('u1', { bowl: 0, foodId: 'huluobo' })
  assert.deepEqual(v.bowls[0], { food: 'huluobo', peeking: 'nuonuo' })
  assert.deepEqual(v.foods, [{ id: 'xiaomi', count: 1 }])
  // 小米：爱吃的豆豆已经住下了，不张望
  await assert.rejects(service.putFood('u1', { bowl: 0, foodId: 'xiaomi' }), { code: 'BAD_REQUEST', message: '这个食盆已经有吃的了' })
  const v2 = await service.putFood('u1', { bowl: 1, foodId: 'xiaomi' })
  assert.deepEqual(v2.bowls[1], { food: 'xiaomi', peeking: null })
  await assert.rejects(service.putFood('u1', { bowl: 2, foodId: 'xiaomi' }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.putFood('u1', { bowl: 0, foodId: 'nope' }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
  const back = await service.takeFood('u1', { bowl: 0 })
  assert.deepEqual(back.bowls[0], { food: null, peeking: null })
  assert.deepEqual(back.foods, [{ id: 'huluobo', count: 1 }])
  await assert.rejects(service.takeFood('u1', { bowl: 0 }), { code: 'BAD_REQUEST', message: '食盆是空的' })
  assert.deepEqual((await repo.getGarden('u1')).peeking, [null, null])
})

test('feed：爱吃 +3、不爱吃 +1、点心 +5，不限次数；升级后 level 变', async () => {
  const { service } = setup({ camp: rich({ foods: { xiaomi: 2, zhusun: 1, jiaozi: 1 } }) })
  let v = await service.feed('u1', { petId: 'doudou', foodId: 'xiaomi' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed, v.pets[0].level], [3, true, 3, 2])
  v = await service.feed('u1', { petId: 'doudou', foodId: 'zhusun' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed], [1, false, 4])
  v = await service.feed('u1', { petId: 'doudou', foodId: 'jiaozi' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed, v.pets[0].level], [5, true, 9, 3])
  await assert.rejects(service.feed('u1', { petId: 'sunbao', foodId: 'xiaomi' }), { code: 'NOT_FOUND', message: '它还没住进来' })
  await assert.rejects(service.feed('u1', { petId: 'doudou', foodId: 'zhusun' }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
})

test('buy / place / move / stash：买了进背包，摆到草地上，挪、收回', async () => {
  const { repo, service } = setup({ camp: rich({ beans: { earned: {}, bonus: 100, spent: 0 } }) })
  let v = await service.buy('u1', { decorId: 'ball' })
  assert.equal(v.beans, 60)
  assert.deepEqual(v.decor.owned, { ball: 1 })
  assert.deepEqual(v.decor.unplaced, [{ id: 'ball', count: 1 }])
  await assert.rejects(service.buy('u1', { decorId: 'ball' }), { code: 'BAD_REQUEST', message: '这件已经买过了' })
  await assert.rejects(service.buy('u1', { decorId: 'tent' }), { code: 'NO_BEANS', message: '暖豆不够啦，小帐篷要 120 暖豆，再攒攒' })
  await assert.rejects(service.buy('u1', { decorId: GOLD_TENT }), { code: 'BAD_REQUEST', message: '这件商店里没有' })
  await assert.rejects(service.buy('u1', { decorId: 'nope' }), { code: 'BAD_REQUEST', message: '这件商店里没有' })
  v = await service.place('u1', { decorId: 'ball', x: 1500, y: 1800 })
  assert.deepEqual(v.decor.placed, [{ uid: 'd1', id: 'ball', x: 1500, y: 1800 }])
  assert.deepEqual(v.decor.unplaced, [])
  await assert.rejects(service.place('u1', { decorId: 'ball', x: 2000, y: 1800 }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
  await assert.rejects(service.move('u1', { uid: 'd1', x: 2048, y: 2100 }), { code: 'BAD_REQUEST', message: '这儿放不下，挪开一点' })
  v = await service.move('u1', { uid: 'd1', x: 1510, y: 1810 })
  assert.deepEqual(v.decor.placed[0], { uid: 'd1', id: 'ball', x: 1510, y: 1810 })
  await assert.rejects(service.move('u1', { uid: 'zz', x: 1510, y: 1810 }), { code: 'NOT_FOUND' })
  v = await service.stash('u1', { uid: 'd1' })
  assert.deepEqual(v.decor.placed, [])
  assert.deepEqual(v.decor.unplaced, [{ id: 'ball', count: 1 }])
  assert.equal((await repo.getGarden('u1')).seq, 1)
  // 花坛能买三个（先补点豆）
  const stored = await repo.getGarden('u1')
  await repo.saveGarden('u1', { ...stored, beans: { ...stored.beans, bonus: stored.beans.bonus + 500 } })
  await service.buy('u1', { decorId: 'flowerbed' })
  await service.buy('u1', { decorId: 'flowerbed' })
  await service.buy('u1', { decorId: 'flowerbed' })
  await assert.rejects(service.buy('u1', { decorId: 'flowerbed' }), { code: 'BAD_REQUEST', message: '这件已经买够了' })
})

test('arrive：正餐打卡后全员 +1（一天最多 3 次）、张望的那只走进来、一次一只', async () => {
  const camp = rich({
    foods: {}, bowls: ['huluobo', 'xigua'], peeking: ['nuonuo', 'guigui'],
    pets: [{ id: 'doudou', since: TODAY, fed: 2, fedToday: { date: TODAY, n: 2 } }],
  })
  const { repo, service } = setup({ camp })
  const a = await service.arrive('u1')
  assert.deepEqual(a, { id: 'nuonuo', name: '糯糯', foodId: 'huluobo', foodName: '胡萝卜' })
  let stored = await repo.getGarden('u1')
  assert.deepEqual(stored.pets.map((p) => [p.id, p.fed, p.fedToday.n]), [['doudou', 3, 3], ['nuonuo', 0, 0]])
  assert.deepEqual(stored.bowls, [null, 'xigua'])
  assert.deepEqual(stored.peeking, [null, 'guigui'])
  assert.deepEqual(stored.arrivals, ['nuonuo'])
  // 第二顿：豆豆今天已经 3 次，不再加；龟龟进来
  const b = await service.arrive('u1')
  assert.equal(b.id, 'guigui')
  stored = await repo.getGarden('u1')
  assert.deepEqual(stored.pets.map((p) => [p.id, p.fed]), [['doudou', 3], ['nuonuo', 1], ['guigui', 0]])
  assert.deepEqual(stored.bowls, [null, null])
  // 没人张望：返回 null，但住户照样 +1
  assert.equal(await service.arrive('u1'), null)
  assert.equal((await repo.getGarden('u1')).pets[1].fed, 2)
})

test('arrive：食物没人可引（都住下了）→ 爱吃它的住户吃掉，+3，食盆空出来', async () => {
  const { repo, service } = setup({ camp: rich({ bowls: ['xiaomi', null], peeking: [null, null] }) })
  const a = await service.arrive('u1')
  assert.deepEqual(a, { id: null, ate: 'doudou', foodId: 'xiaomi', foodName: '小米' })
  const stored = await repo.getGarden('u1')
  assert.equal(stored.pets[0].fed, 4) // 打卡 +1，加餐 +3
  assert.deepEqual(stored.bowls, [null, null])
})

test('arrive：第 12 只住进来送金帐篷，只送一次', async () => {
  const ids = ['doudou', 'nuonuo', 'lianlian', 'shishi', 'huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha']
  const { repo, service } = setup({ camp: rich({ pets: ids.map((id) => ({ id, since: TODAY, fed: 0, fedToday: { date: '', n: 0 } })), bowls: ['shanzha', null], peeking: ['hehe', null] }) })
  const a = await service.arrive('u1')
  assert.equal(a.id, 'hehe')
  const stored = await repo.getGarden('u1')
  assert.deepEqual(stored.decor.owned, { [GOLD_TENT]: 1 })
  assert.equal((await service.get('u1')).full, true)
})

test('gift：5 点后每天一次，要有 4 级住户；70% 5 暖豆、30% 普通食物', async () => {
  const none = setup({ camp: rich(), hour: 8 })
  assert.equal((await none.service.get('u1')).giftReady, false)
  await assert.rejects(none.service.gift('u1'), { code: 'BAD_REQUEST', message: '今天没有礼物啦' })
  const lv4 = rich({ pets: [{ id: 'doudou', since: TODAY, fed: 15, fedToday: { date: '', n: 0 } }] })
  const beans = setup({ camp: lv4, hour: 8, random: sequence([0.5, 0.2]) })
  assert.equal((await beans.service.get('u1')).giftReady, true)
  const g = await beans.service.gift('u1')
  assert.deepEqual(g.gift, { petId: 'doudou', beans: 5, foodId: null })
  assert.equal(g.beans, 125)
  assert.equal(g.giftReady, false)
  await assert.rejects(beans.service.gift('u1'), { code: 'BAD_REQUEST' })
  const food = setup({ camp: lv4, hour: 8, random: sequence([0.5, 0.9, 0.0]) })
  const f = await food.service.gift('u1')
  assert.deepEqual(f.gift, { petId: 'doudou', beans: 0, foodId: 'xiaomi' })
  assert.deepEqual(f.foods, [{ id: 'xiaomi', count: 1 }])
  const early = setup({ camp: lv4, hour: 4 })
  assert.equal((await early.service.get('u1')).giftReady, false)
  // 页面传来叼礼物走过来的那只：按它算；不够 4 级的不认，照旧随机
  const two = (fedHehe) => rich({ pets: [{ id: 'doudou', since: TODAY, fed: 15, fedToday: { date: '', n: 0 } }, { id: 'hehe', since: TODAY, fed: fedHehe, fedToday: { date: '', n: 0 } }] })
  const named = setup({ camp: two(20), hour: 8, random: sequence([0.2]) })
  assert.equal((await named.service.gift('u1', { petId: 'hehe' })).gift.petId, 'hehe')
  const low = setup({ camp: two(2), hour: 8, random: sequence([0.5, 0.2]) })
  assert.equal((await low.service.gift('u1', { petId: 'hehe' })).gift.petId, 'doudou')
})

test('album：12 页宠物（没来的只给提示）、尝过的食物、买过的装饰、进度', async () => {
  const { service } = setup({ camp: rich({ tasted: ['xiaomi'], decor: { owned: { ball: 1 }, placed: [] }, pets: [{ id: 'doudou', since: TODAY, fed: 8, fedToday: { date: '', n: 0 } }] }) })
  const a = await service.album('u1')
  assert.equal(a.pets.length, 12)
  const dd = a.pets.find((p) => p.id === 'doudou')
  assert.deepEqual([dd.home, dd.level, dd.fed, dd.since, dd.story.length, dd.story[2].open, dd.story[3].open], [true, 3, 8, TODAY, 5, true, false])
  const nn = a.pets.find((p) => p.id === 'nuonuo')
  assert.deepEqual([nn.home, nn.hint, nn.name], [false, '它好像爱吃脆脆的', '糯糯'])
  assert.equal(nn.hook, undefined)
  assert.deepEqual(a.progress, { pets: 1, total: 12 })
  assert.equal(a.foods.find((f) => f.id === 'xiaomi').tasted, true)
  assert.equal(a.foods.find((f) => f.id === 'yumili').tasted, false)
  assert.equal(a.foods.filter((f) => f.term).length, 10)
  assert.equal(a.decor.find((d) => d.id === 'ball').owned, true)
  assert.equal(a.decor.some((d) => d.id === GOLD_TENT), false)
  assert.equal(a.full, false)
})

test('旧档进营地：迁完存一次，暖豆退回，住户搬来', async () => {
  const { repo, service } = setup({ camp: { estate: 2, welcomed: true, beans: { earned: { '2026-10-21': 60 }, bonus: 5060, spent: 900 }, residents: [{ id: 'panda', since: '2026-10-21' }], opened: ['front', 'main'], placed: [], inventory: { daisy: 1 } } })
  const v = await service.get('u1')
  assert.equal(v.beans, 120)
  assert.deepEqual(v.pets.map((p) => p.id), ['sunbao', 'doudou'])
  assert.equal(v.welcome, null)
  const stored = await repo.getGarden('u1')
  assert.equal(stored.camp, 1)
  assert.equal(stored.inventory, undefined)
})
