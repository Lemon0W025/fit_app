// test/services-camp.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createCampService } = require('../cloudfunctions/api/services/camp')
const { createTestPerks } = require('../cloudfunctions/api/lib/test-perks')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')
const { PITY } = require('../cloudfunctions/api/lib/shared/garden')
const { POT_STAY_MS } = require('../cloudfunctions/api/lib/shared/camp')
const { dailyMenu } = require('../cloudfunctions/api/lib/menu')
const NOW_MS = NOW.getTime()
const UNTIL = NOW_MS + POT_STAY_MS
const FED = { date: '', n: 0 }
// 一只在场的常客 / 不在场的常客
const regular = (id, fed = 0, here = true) => ({ id, since: TODAY, fed, fedToday: FED, home: false, until: here ? UNTIL : 0 })
const { GOLD_SWING } = require('../cloudfunctions/api/lib/shared/decor')

function sequence(values) {
  const queue = [...values]
  return () => (queue.length ? queue.shift() : 0)
}

// NOW 是 2026-10-22 04:00Z，即北京时间 12 点；hourOf 可注入；tests：测试福利的 config（testGrant / testPets / testVisitors / testUnlimited）
function setup({ random = sequence([]), camp, now = NOW, hour = 12, tests = null } = {}) {
  const repo = createFakeRepo()
  if (camp) repo.state.gardens.set('u1', camp)
  const perks = tests ? createTestPerks({ config: tests, now: () => now }) : undefined
  const service = createCampService({ repo, now: () => now, random, hourOf: () => hour, perks })
  return { repo, service }
}

// 默认就是现在的形状（camp 5）；要测迁移的自己写 camp: 4
const rich = (extra = {}) => ({ camp: 5, welcomed: true, beans: { earned: { [TODAY]: 60 }, bonus: 60, spent: 0 }, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: { date: '', n: 0 } }], ...extra })

test('get：第一次进来送 60 暖豆，豆豆住进来，只送一次', async () => {
  const { repo, service } = setup()
  const first = await service.get('u1')
  assert.deepEqual(first.welcome, { beans: 60, petId: 'doudou' })
  assert.equal(first.beans, 60)
  assert.deepEqual(first.pets.map((p) => [p.id, p.level, p.next, p.home]), [['doudou', 1, 3, true]])
  assert.deepEqual([first.pot, first.met], [{ foods: [], until: 0 }, ['doudou']])
  assert.ok(!('bowls' in first) && !('visitors' in first) && !('arrivals' in first))
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
  assert.equal((await repo.getGarden('u1')).camp, 6)
})

test('get：测试福利只送一次', async () => {
  const { service } = setup({ camp: rich(), tests: { testGrant: { id: 'g1', beans: 500, until: '2026-12-31' } } })
  const v = await service.get('u1')
  assert.equal(v.testGift, 500)
  assert.equal(v.beans, 620)
  const again = await service.get('u1')
  assert.equal(again.testGift, 0)
  assert.equal(again.beans, 620)
})
test('get：测试期间（config.testPets）还没来的宠物一次全放出来，1 级、都算住下；只放一次，过了日子不放', async () => {
  const { PETS } = require('../cloudfunctions/api/lib/shared/pets')
  const { repo, service } = setup({ camp: rich({ camp: 4, pets: [{ id: 'doudou', since: '2026-10-20', fed: 9, fedToday: FED }], visitors: [{ id: 'nuonuo', foodId: 'huluobo', since: TODAY }] }), tests: { testPets: { id: 'all-pets-1', until: '2026-12-31' } } })
  const v = await service.get('u1')
  assert.deepEqual(v.pets.map((p) => p.id).sort(), PETS.map((p) => p.id).sort(), '都在场')
  assert.deepEqual(v.pets.find((p) => p.id === 'doudou').fed, 9, '已经住着的不动')
  assert.ok(v.pets.filter((p) => p.id !== 'doudou' && p.id !== 'nuonuo').every((p) => p.fed === 0 && p.level === 1 && p.since === TODAY && p.home))
  assert.equal(v.full, true)
  assert.equal((await repo.getGarden('u1')).pets.length, PETS.length)
  const again = await service.get('u1')
  assert.equal(again.pets.length, PETS.length)

  const late = setup({ camp: rich(), tests: { testPets: { id: 'all-pets-1', until: '2026-10-21' } } })
  assert.deepEqual((await late.service.get('u1')).pets.map((p) => p.id), ['doudou'])
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

test('spinMany：十连扣 300 暖豆、十个结果一次存，保底照常往下数（十次里至少一个珍稀以上）；暖豆不够不扭', async () => {
  const { repo, service } = setup({ camp: rich({ beans: { earned: {}, bonus: 400, spent: 0 } }), random: () => 0.1 })
  const r = await service.spinMany('u1')
  assert.equal(r.results.length, 10)
  assert.equal(r.beans, 100)
  assert.equal(r.pityLeft, PITY, '第十个保底出了珍稀，计数归零')
  assert.deepEqual(r.results.slice(0, 9).map((x) => x.rarity), Array(9).fill('common'))
  assert.equal(r.results[9].rarity, 'epic')
  // 同一样只有第一次算新
  const firsts = {}
  r.results.forEach((x) => {
    assert.equal(x.isNew, !firsts[x.foodId], x.foodId)
    firsts[x.foodId] = true
  })
  const stored = await repo.getGarden('u1')
  assert.equal(Object.values(stored.foods).reduce((t, n) => t + n, 0), 10)
  assert.equal(stored.gacha.pulls, 10)
  assert.equal(stored.beans.spent, 300)
  const poor = setup({ camp: rich({ beans: { earned: {}, bonus: 200, spent: 0 } }) })
  await assert.rejects(poor.service.spinMany('u1'), { code: 'NO_BEANS' })
  assert.equal((await poor.service.get('u1')).spinManyCost, 300)
})

test('get：测试客人（config.testVisitors）：挪走几只、送能引它们来的食物，锅里煮的退回背包；每个账号一次，过了日子不做', async () => {
  const { PETS } = require('../cloudfunctions/api/lib/shared/pets')
  const all = PETS.map((p) => ({ id: p.id, since: TODAY, fed: p.id === 'doudou' ? 9 : 0, fedToday: { date: '', n: 0 } }))
  const conf = { id: 'visitors-1', until: '2026-11-30', remove: ['nuonuo', 'qiqi'], foods: { huluobo: 1, kaohongshu: 1 } }
  const camp = rich({ camp: 4, pets: all.map((p) => ({ ...p, home: true })), foods: { xiaomi: 1 }, pot: { date: TODAY, foods: ['xiaomi', 'yumili', 'lianzi'] }, grants: ['all-pets-1'] })
  const { repo, service } = setup({ camp, random: () => 0, tests: { testPets: { id: 'all-pets-1', until: '2026-12-31' }, testVisitors: conf } })
  const v = await service.get('u1')
  assert.deepEqual(v.pets.map((p) => p.id).sort(), PETS.map((p) => p.id).filter((id) => id !== 'nuonuo' && id !== 'qiqi').sort())
  assert.equal(v.pets.find((p) => p.id === 'doudou').fed, 9, '留下的不动')
  assert.deepEqual(v.pot, { foods: [], until: 0 }, '锅清空，今天能再煮三样')
  assert.deepEqual(v.foods, [{ id: 'xiaomi', count: 2 }, { id: 'yumili', count: 1 }, { id: 'huluobo', count: 1 }, { id: 'lianzi', count: 1 }, { id: 'kaohongshu', count: 1 }])
  assert.equal(v.full, false)
  // 胡萝卜下锅：糯糯闻着香味来（常客）
  const cooked = await service.putFood('u1', { foodId: 'huluobo' })
  assert.ok(cooked.cooked.comers.includes('nuonuo'))
  // 只做一次（testPets 也不会再把它们放回来）
  const again = await service.get('u1')
  assert.deepEqual(again.pets.find((p) => p.id === 'nuonuo').home, false)
  assert.equal(again.pets.length, PETS.length - 2 + cooked.cooked.comers.length)
  const late = setup({ camp: rich(), tests: { testVisitors: { ...conf, until: '2026-10-21' } } })
  assert.equal((await late.service.get('u1')).foods.length, 0)
})

test('测试无限资源（config.testUnlimited）：暖豆和每样食物每次都补满，花了、下锅了也补回来；过了日子不补', async () => {
  const { FOODS, TREATS } = require('../cloudfunctions/api/lib/shared/foods')
  const conf = { until: '2026-11-30', beans: 99999, foods: 9 }
  const { repo, service } = setup({ camp: rich({ foods: { xiaomi: 20 } }), random: () => 0, tests: { testUnlimited: conf } })
  const v = await service.get('u1')
  assert.equal(v.beans, 99999)
  assert.equal(v.foods.length, FOODS.length + TREATS.length)
  assert.ok(v.foods.every((f) => f.count >= 9))
  assert.equal(v.foods.find((f) => f.id === 'xiaomi').count, 20, '多的不收')
  assert.equal((await repo.getGarden('u1')).foods.huluobo, 9, '存下来了（首页的暖豆也是满的）')
  const spun = await service.spin('u1')
  assert.equal(spun.beans, 99999)
  assert.equal((await service.buy('u1', { decorId: 'swing' })).beans, 99999)
  const cooked = await service.putFood('u1', { foodId: 'huluobo' })
  assert.equal(cooked.foods.find((f) => f.id === 'huluobo').count, 9)
  const late = setup({ camp: rich(), tests: { testUnlimited: { ...conf, until: '2026-10-21' } } })
  const lv = await late.service.get('u1')
  assert.deepEqual([lv.beans, lv.foods.length], [120, 0])
})

test('putFood：下锅点火、一样管 8 小时；在场爱吃的 +3、点心 +5；菜单里不在场的闻着香味来（第一次来也算一顿）；一天最多 3 样、同一样不能两次', async () => {
  const menu = dailyMenu(TODAY)
  const { repo, service } = setup({ camp: rich({ foods: { huluobo: 2, xiaomi: 1, lianzi: 1, shibing: 1 } }), random: () => 0 })
  const v = await service.putFood('u1', { foodId: 'huluobo' })
  assert.deepEqual(v.pot, { foods: ['huluobo'], until: UNTIL })
  const comers = menu.huluobo.filter((id) => id !== 'doudou') // 豆豆在场（它在菜单里也不算来）
  assert.deepEqual(v.cooked, { foodId: 'huluobo', eaters: [], comers, movedIn: [] })
  assert.ok(comers.includes('nuonuo'))
  // 来的都在场了，常客、吃了一顿（+3）、能待到锅到期
  const nn = v.pets.find((p) => p.id === 'nuonuo')
  assert.deepEqual([nn.home, nn.fed, nn.since], [false, 3, TODAY])
  assert.deepEqual(v.pets.map((p) => p.id), ['doudou'].concat(comers))
  assert.deepEqual(v.met, ['doudou'].concat(comers))
  assert.equal((await repo.getGarden('u1')).pets.find((p) => p.id === 'nuonuo').until, UNTIL)
  assert.equal(v.foods.find((f) => f.id === 'huluobo').count, 1)
  await assert.rejects(service.putFood('u1', { foodId: 'huluobo' }), { code: 'BAD_REQUEST', message: '锅里已经有胡萝卜了，换一样吧' })
  // 小米：豆豆（住下的）爱吃，走过来吃（+3）；菜单里小米的别的那几只来
  const v2 = await service.putFood('u1', { foodId: 'xiaomi' })
  assert.deepEqual(v2.cooked.eaters, ['doudou'])
  assert.deepEqual(v2.cooked.comers, menu.xiaomi.filter((id) => id !== 'doudou' && !comers.includes(id)))
  assert.equal(v2.pets[0].fed, 3)
  // 节气点心：在场的都爱吃（+5）；没有新的来
  const v3 = await service.putFood('u1', { foodId: 'shibing' })
  assert.deepEqual(v3.cooked.eaters.sort(), v2.pets.map((p) => p.id).sort())
  assert.deepEqual(v3.cooked.comers, [])
  assert.equal(v3.pets[0].fed, 8)
  assert.deepEqual(v3.pot.foods, ['huluobo', 'xiaomi', 'shibing'])
  await assert.rejects(service.putFood('u1', { foodId: 'lianzi' }), { code: 'BAD_REQUEST', message: '今天已经煮过三样啦，明天再放' })
  await assert.rejects(service.putFood('u1', { foodId: 'nope' }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
  const stored = await repo.getGarden('u1')
  assert.equal(stored.foods.lianzi, 1)
  assert.deepEqual(stored.pot, { items: ['huluobo', 'xiaomi', 'shibing'].map((foodId) => ({ foodId, at: NOW_MS, date: TODAY })) })
  // 存着的（没到期的）读出来还是这三样、到期时间不变
  assert.deepEqual((await service.get('u1')).pot, { foods: ['huluobo', 'xiaomi', 'shibing'], until: UNTIL })
})

test('锅到期：最后一样下锅 8 小时后锅空了、火熄了，没住下的常客不在场了；再煮它爱吃的就回来（亲密度记着）；过了 8 小时今天还是最多 3 样', async () => {
  const later = new Date(NOW_MS + POT_STAY_MS + 60000)
  const stored = { ...rich({ foods: { huluobo: 1, niangao: 1 } }), camp: 5, pot: { items: [{ foodId: 'huluobo', at: NOW_MS, date: TODAY }] }, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 }, regular('nuonuo', 7), regular('qiqi', 30)] }
  stored.pets[2].home = true // 5 级的住下了
  const before = setup({ camp: stored })
  assert.deepEqual((await before.service.get('u1')).pets.map((p) => p.id), ['doudou', 'nuonuo', 'qiqi'])
  const { repo, service } = setup({ camp: stored, now: later, random: () => 0 })
  const v = await service.get('u1')
  assert.deepEqual(v.pot, { foods: [], until: 0 })
  assert.deepEqual(v.pets.map((p) => p.id), ['doudou', 'qiqi'], '糯糯走了，住下的在')
  assert.deepEqual(v.met, ['doudou', 'nuonuo', 'qiqi'])
  // 年糕：糯糯爱吃、来过，回来（+3，亲密度接着算）；菜单里年糕的别的也来
  const cooked = await service.putFood('u1', { foodId: 'niangao' })
  assert.ok(cooked.cooked.comers.includes('nuonuo'))
  assert.equal(cooked.pets.find((p) => p.id === 'nuonuo').fed, 10)
  assert.equal(cooked.pot.until, later.getTime() + POT_STAY_MS)
  assert.equal((await repo.getGarden('u1')).pot.items.length, 2, '今天到期的那样还记着（算今天的三样之一），只是不在煮了')
  // 今天已经煮过一样（到期了也算），再煮两样就满了
  await repo.saveGarden('u1', { ...(await repo.getGarden('u1')), foods: { xiaomi: 1, lianzi: 1, shibing: 1 } })
  await service.putFood('u1', { foodId: 'xiaomi' })
  await assert.rejects(service.putFood('u1', { foodId: 'lianzi' }), { code: 'BAD_REQUEST', message: '今天已经煮过三样啦，明天再放' })
})
test('putFood：来的是今日菜单里这样的 ∪ 来过、爱吃它的；在场的不重复来；view 带今天的菜单', async () => {
  const menu = dailyMenu(TODAY)
  const food = ['xiaomi', 'yumili'].find((id) => menu[id].some((p) => p !== 'doudou'))
  assert.ok(food, '这天小米、玉米粒的名单里都只有豆豆，换个日子测')
  const { service } = setup({ camp: rich({ foods: { [food]: 1 } }), random: () => 0 })
  const v = await service.putFood('u1', { foodId: food })
  assert.deepEqual(v.menu, menu)
  assert.deepEqual(v.cooked.comers, menu[food].filter((p) => p !== 'doudou'))
  // 名单里的都在场了：没人来，都算吃了一顿
  const all = setup({ camp: rich({ foods: { [food]: 1 }, pets: menu[food].map((id) => (id === 'doudou' ? { id, since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 } : regular(id))) }) })
  const w = await all.service.putFood('u1', { foodId: food })
  assert.deepEqual(w.cooked.comers, [])
  // 在场、本来就爱吃的过来吃（菜单里轮换来的不算爱吃）
  const { petById } = require('../cloudfunctions/api/lib/shared/pets')
  assert.deepEqual(w.cooked.eaters.sort(), menu[food].filter((id) => petById(id).foods.includes(food)).sort())
  // 来过、爱吃它但不在今天菜单里的（鹤鹤也爱吃莲子）：也回来
  const fan = setup({ camp: rich({ foods: { lianzi: 1 }, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 }, regular('hehe', 4, false)] }) })
  assert.ok((await fan.service.putFood('u1', { foodId: 'lianzi' })).cooked.comers.includes('hehe'))
})
test('putFood：旧档的客人迁成常客（锅是昨天的就当空锅、先不在场）；背包没有的不下锅', async () => {
  const camp = rich({
    camp: 4,
    foods: { huluobo: 1, niangao: 1 },
    pot: { date: '2026-10-21', foods: ['xiaomi', 'yumili', 'lianzi'] },
    visitors: [{ id: 'nuonuo', foodId: 'huluobo', since: '2026-10-21' }],
  })
  const { service } = setup({ camp, random: () => 0 })
  const g = await service.get('u1')
  assert.deepEqual(g.pot, { foods: [], until: 0 })
  assert.deepEqual([g.pets.map((p) => p.id), g.met], [['doudou'], ['doudou', 'nuonuo']])
  const v = await service.putFood('u1', { foodId: 'niangao' })
  assert.deepEqual(v.pot, { foods: ['niangao'], until: UNTIL })
  assert.ok(v.cooked.comers.includes('nuonuo'), '爱吃年糕的糯糯回来了')
  assert.equal(v.pets.find((p) => p.id === 'nuonuo').since, '2026-10-21', '来过的，不是新的')
  await assert.rejects(service.putFood('u1', { foodId: 'xiaomi' }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
})
test('feed：只能喂在场的；爱吃 +3、不爱吃 +1、点心 +5，不限次数；升级后 level 变；喂够了就住下（普通的 15 顿）', async () => {
  const { service } = setup({ camp: rich({ foods: { xiaomi: 2, zhusun: 1, jiaozi: 1, huluobo: 2 }, pets: [{ id: 'doudou', since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 }, regular('nuonuo', 12), regular('qiqi', 0, false)] }) })
  let v = await service.feed('u1', { petId: 'doudou', foodId: 'xiaomi' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed, v.pets[0].level, v.movedIn], [3, true, 3, 2, []])
  v = await service.feed('u1', { petId: 'doudou', foodId: 'zhusun' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed], [1, false, 4])
  v = await service.feed('u1', { petId: 'doudou', foodId: 'jiaozi' })
  assert.deepEqual([v.gain, v.liked, v.pets[0].fed, v.pets[0].level], [5, true, 9, 3])
  await assert.rejects(service.feed('u1', { petId: 'sunbao', foodId: 'xiaomi' }), { code: 'NOT_FOUND', message: '它这会儿不在营地' })
  await assert.rejects(service.feed('u1', { petId: 'qiqi', foodId: 'xiaomi' }), { code: 'NOT_FOUND', message: '它这会儿不在营地' })
  await assert.rejects(service.feed('u1', { petId: 'doudou', foodId: 'zhusun' }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
  // 糯糯是常见的，喂到 15 顿住下（12 + 3）：这时才 4 级，锅空了也不走
  assert.deepEqual([v.pets.find((p) => p.id === 'nuonuo').home, v.pets.find((p) => p.id === 'nuonuo').homeAt], [false, 15])
  v = await service.feed('u1', { petId: 'nuonuo', foodId: 'huluobo' })
  assert.deepEqual(v.movedIn, ['nuonuo'])
  const nn = v.pets.find((p) => p.id === 'nuonuo')
  assert.deepEqual([nn.home, nn.fed, nn.level], [true, 15, 4])
  v = await service.feed('u1', { petId: 'nuonuo', foodId: 'huluobo' })
  assert.deepEqual(v.movedIn, [])
})
test('住下要喂几顿按稀有度分档：普通 15、稀有 25、珍稀 40、传说 60；差一顿不住下，够了才住下；view 和图册带 homeAt', async () => {
  const { homeNeed, HOME_FEEDS } = require('../cloudfunctions/api/lib/shared/camp')
  assert.deepEqual(HOME_FEEDS, { common: 15, rare: 25, epic: 40, legendary: 60 })
  assert.deepEqual(['common', 'rare', 'epic', 'legendary', 'nope'].map(homeNeed), [15, 25, 40, 60, 25])
  // 每档一只，都差一顿：柿柿 14、杞杞 24、笋宝 39、鹤鹤 59
  const pets = [{ id: 'doudou', since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 }, regular('shishi', 14), regular('qiqi', 24), regular('sunbao', 39), regular('hehe', 56)]
  const { service } = setup({ camp: rich({ foods: { shanzha: 1, xiaomi: 4 }, pets }) })
  let v = await service.get('u1')
  assert.deepEqual(v.pets.map((p) => [p.id, p.homeAt, p.home]), [['doudou', 15, true], ['shishi', 15, false], ['qiqi', 25, false], ['sunbao', 40, false], ['hehe', 60, false]])
  // 鹤鹤 56 + 3 = 59：早就 5 级了，还没住下
  v = await service.feed('u1', { petId: 'hehe', foodId: 'shanzha' })
  assert.deepEqual(v.movedIn, [])
  assert.deepEqual(((p) => [p.fed, p.level, p.home])(v.pets.find((p) => p.id === 'hehe')), [59, 5, false])
  const a = await service.album('u1')
  assert.deepEqual(['shishi', 'qiqi', 'sunbao', 'hehe'].map((id) => a.pets.find((p) => p.id === id).homeAt), [15, 25, 40, 60])
  // 再各喂一口不爱吃的（+1）：正好够，一只一只住下
  for (const id of ['hehe', 'sunbao', 'qiqi', 'shishi']) {
    v = await service.feed('u1', { petId: id, foodId: 'xiaomi' })
    assert.deepEqual(v.movedIn, [id])
  }
  assert.deepEqual(v.pets.map((p) => [p.id, p.fed, p.home]), [['doudou', 0, true], ['shishi', 15, true], ['qiqi', 25, true], ['sunbao', 40, true], ['hehe', 60, true]])
})
test('buy / place / move / stash：买了进背包，摆到草地上，挪、收回', async () => {
  const { repo, service } = setup({ camp: rich({ beans: { earned: {}, bonus: 100, spent: 0 } }) })
  let v = await service.buy('u1', { decorId: 'ball' })
  assert.equal(v.beans, 60)
  assert.deepEqual(v.decor.owned, { ball: 1 })
  assert.deepEqual(v.decor.unplaced, [{ id: 'ball', count: 1 }])
  await assert.rejects(service.buy('u1', { decorId: 'ball' }), { code: 'BAD_REQUEST', message: '这件已经买过了' })
  await assert.rejects(service.buy('u1', { decorId: 'swing' }), { code: 'NO_BEANS', message: '暖豆不够啦，秋千要 120 暖豆，再攒攒' })
  await assert.rejects(service.buy('u1', { decorId: GOLD_SWING }), { code: 'BAD_REQUEST', message: '这件商店里没有' })
  await assert.rejects(service.buy('u1', { decorId: 'tent' }), { code: 'BAD_REQUEST', message: '这件商店里没有' }) // 下架了
  await assert.rejects(service.buy('u1', { decorId: 'nope' }), { code: 'BAD_REQUEST', message: '这件商店里没有' })
  v = await service.place('u1', { decorId: 'ball', x: 1500, y: 1800 })
  assert.deepEqual(v.decor.placed, [{ uid: 'd1', id: 'ball', x: 1500, y: 1800 }])
  assert.deepEqual(v.decor.unplaced, [])
  await assert.rejects(service.place('u1', { decorId: 'ball', x: 2000, y: 1800 }), { code: 'BAD_REQUEST', message: '背包里没有这个了' })
  await assert.rejects(service.move('u1', { uid: 'd1', x: 2130, y: 2600 }), { code: 'BAD_REQUEST', message: '这儿放不下，挪开一点' })
  v = await service.move('u1', { uid: 'd1', x: 1510, y: 1810 })
  assert.deepEqual(v.decor.placed[0], { uid: 'd1', id: 'ball', x: 1510, y: 1810 })
  await assert.rejects(service.move('u1', { uid: 'zz', x: 1510, y: 1810 }), { code: 'NOT_FOUND' })
  v = await service.stash('u1', { uid: 'd1' })
  assert.deepEqual(v.decor.placed, [])
  assert.deepEqual(v.decor.unplaced, [{ id: 'ball', count: 1 }])
  assert.equal((await repo.getGarden('u1')).seq, 1)
  // 向日葵能买三个（先补点豆）；下架的买不到
  const stored = await repo.getGarden('u1')
  await repo.saveGarden('u1', { ...stored, beans: { ...stored.beans, bonus: stored.beans.bonus + 500 } })
  await service.buy('u1', { decorId: 'sunflower' })
  await service.buy('u1', { decorId: 'sunflower' })
  await service.buy('u1', { decorId: 'sunflower' })
  await assert.rejects(service.buy('u1', { decorId: 'sunflower' }), { code: 'BAD_REQUEST', message: '这件已经买够了' })
  await assert.rejects(service.buy('u1', { decorId: 'hammock' }), { code: 'BAD_REQUEST' })
})

test('arrive：正餐打卡后在场的全员 +1（一天最多 3 次），不在场的不加；这一顿喂够了的住下、返回名单；没有就 null', async () => {
  const camp = rich({
    pets: [{ id: 'doudou', since: TODAY, fed: 2, fedToday: { date: TODAY, n: 2 }, home: true, until: 0 }, regular('nuonuo', 14), regular('guigui', 1, false)],
  })
  const { repo, service } = setup({ camp })
  const a = await service.arrive('u1')
  assert.deepEqual(a, { pets: [{ id: 'nuonuo', name: '糯糯' }] })
  let stored = await repo.getGarden('u1')
  assert.deepEqual(stored.pets.map((p) => [p.id, p.fed, p.fedToday.n, p.home]), [['doudou', 3, 3, true], ['nuonuo', 15, 1, true], ['guigui', 1, 0, false]])
  // 第二顿：豆豆今天已经 3 次，不再加；没人住下返回 null，别的照样 +1
  assert.equal(await service.arrive('u1'), null)
  stored = await repo.getGarden('u1')
  assert.deepEqual(stored.pets.map((p) => [p.id, p.fed]), [['doudou', 3], ['nuonuo', 16], ['guigui', 1]])
})
test('第 12 只来过就送金色秋千，只送一次', async () => {
  const ids = ['doudou', 'nuonuo', 'lianlian', 'shishi', 'huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha']
  const { repo, service } = setup({ camp: rich({ foods: { shanzha: 1, lianzi: 1 }, pets: ids.map((id) => (id === 'doudou' ? { id, since: TODAY, fed: 0, fedToday: FED, home: true, until: 0 } : regular(id, 0, false))) }) })
  assert.equal((await service.get('u1')).full, false)
  // 山楂：鹤鹤爱吃，第一次来
  const v = await service.putFood('u1', { foodId: 'shanzha' })
  assert.ok(v.cooked.comers.includes('hehe'))
  assert.equal(v.full, true)
  assert.deepEqual((await repo.getGarden('u1')).decor.owned, { [GOLD_SWING]: 1 })
  await service.putFood('u1', { foodId: 'lianzi' })
  assert.deepEqual((await repo.getGarden('u1')).decor.owned, { [GOLD_SWING]: 1 })
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
  const two = (fedHehe) => rich({ pets: [{ id: 'doudou', since: TODAY, fed: 15, fedToday: { date: '', n: 0 } }, regular('hehe', fedHehe)] })
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
  assert.deepEqual([dd.met, dd.home, dd.here, dd.level, dd.fed, dd.since, dd.story.length, dd.story[2].open, dd.story[3].open], [true, true, true, 3, 8, TODAY, 5, true, false])
  const nn = a.pets.find((p) => p.id === 'nuonuo')
  assert.deepEqual([nn.met, nn.home, nn.hint, nn.name], [false, false, '它好像爱吃脆脆的', '糯糯'])
  assert.equal(nn.hook, undefined)
  assert.deepEqual(a.progress, { pets: 1, home: 1, total: 12 })
  assert.equal(a.foods.find((f) => f.id === 'xiaomi').tasted, true)
  assert.equal(a.foods.find((f) => f.id === 'yumili').tasted, false)
  assert.equal(a.foods.filter((f) => f.term).length, 10)
  assert.equal(a.decor.find((d) => d.id === 'ball').owned, true)
  assert.equal(a.decor.some((d) => d.id === GOLD_SWING), false)
  assert.equal(a.full, false)
})

test('旧档进营地：迁完存一次，暖豆退回，住户搬来', async () => {
  const { repo, service } = setup({ camp: { estate: 2, welcomed: true, beans: { earned: { '2026-10-21': 60 }, bonus: 5060, spent: 900 }, residents: [{ id: 'panda', since: '2026-10-21' }], opened: ['front', 'main'], placed: [], inventory: { daisy: 1 } } })
  const v = await service.get('u1')
  assert.equal(v.beans, 120)
  // 笋宝是常客（锅空着，先不在场），豆豆住着
  assert.deepEqual([v.pets.map((p) => p.id), v.met], [['doudou'], ['sunbao', 'doudou']])
  assert.equal(v.welcome, null)
  const stored = await repo.getGarden('u1')
  assert.equal(stored.camp, 6)
  assert.equal(stored.inventory, undefined)
})

// 住下的（home）；regulars 是常客：来过、没住下，这会儿不在
const residents = (ids, fed = 0) => ids.map((id) => ({ id, since: TODAY, fed, fedToday: { date: '', n: 0 }, home: true }))
const regulars = (ids, fed = 0) => ids.map((id) => ({ id, since: TODAY, fed, fedToday: { date: '', n: 0 }, home: false, until: 0 }))
const TWELVE = ['doudou', 'nuonuo', 'lianlian', 'shishi', 'huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha', 'hehe']

test('住户里程碑：住下 4 / 8 / 12 只各奖一次暖豆（100 / 200 / 500），get 时发；常客来过不算；别的页面来读也发，庆祝留给营地页（markSeen），只弹一次', async () => {
  // 住下 3 只，另外来过 5 位常客（没住下的不算）
  const { repo, service } = setup({ camp: rich({ pets: residents(TWELVE.slice(0, 3)).concat(regulars(TWELVE.slice(7))) }) })
  let v = await service.get('u1', { markSeen: true })
  assert.deepEqual([v.beans, v.cheers, v.goal], [120, [], { pets: 4, beans: 100 }])
  // 第 4 只住下了；商店页来读（不带 markSeen）：暖豆到账，庆祝先留着
  const doc = await repo.getGarden('u1')
  await repo.saveGarden('u1', { ...doc, pets: residents(TWELVE.slice(0, 4)).concat(regulars(TWELVE.slice(7))) })
  v = await service.get('u1')
  assert.deepEqual([v.beans, v.cheers, v.goal], [220, [], { pets: 8, beans: 200 }])
  let stored = await repo.getGarden('u1')
  assert.deepEqual([stored.goals, stored.cheers, stored.beans.bonus], [[4], [{ kind: 'residents', pets: 4, beans: 100 }], 160])
  // 营地页来读：带上庆祝，读完就清；再读不重复发、不重复弹
  v = await service.get('u1', { markSeen: true })
  assert.deepEqual([v.beans, v.cheers], [220, [{ kind: 'residents', pets: 4, beans: 100 }]])
  v = await service.get('u1', { markSeen: true })
  assert.deepEqual([v.beans, v.cheers], [220, []])
  stored = await repo.getGarden('u1')
  assert.deepEqual([stored.goals, stored.cheers], [[4], []])
  // 一下子到了 12 只：8 只和 12 只的一起发
  await repo.saveGarden('u1', { ...stored, pets: residents(TWELVE) })
  v = await service.get('u1', { markSeen: true })
  assert.deepEqual([v.beans, v.goal], [920, null])
  assert.deepEqual(v.cheers, [{ kind: 'residents', pets: 8, beans: 200 }, { kind: 'residents', pets: 12, beans: 500 }])
  assert.deepEqual((await repo.getGarden('u1')).goals, [4, 8, 12])
  assert.equal((await service.get('u1', { markSeen: true })).beans, 920)
})

test('满级之后的星星：每再喂 30 顿一颗、最多 5 颗，每颗奖一次 20 暖豆；喂出来的当场带回去庆祝；老档里早就喂够的一次补齐', async () => {
  // 豆豆 53 顿（5 级、0 颗星），糯糯老档里已经喂了 120 顿（3 颗星，没发过），莲莲早就满星
  const pets = residents(['doudou'], 53).concat(residents(['nuonuo'], 120), residents(['lianlian'], 999))
  const { repo, service } = setup({ camp: rich({ pets, foods: { xiaomi: 3 } }) })
  let v = await service.get('u1', { markSeen: true })
  assert.deepEqual(v.pets.map((p) => [p.id, p.level, p.stars, p.nextStar]), [['doudou', 5, 0, 55], ['nuonuo', 5, 3, 145], ['lianlian', 5, 5, null]])
  assert.deepEqual(v.cheers, [{ kind: 'star', petId: 'nuonuo', stars: 3, beans: 60 }, { kind: 'star', petId: 'lianlian', stars: 5, beans: 100 }])
  assert.equal(v.beans, 120 + 160)
  assert.deepEqual((await repo.getGarden('u1')).pets.map((p) => p.stars), [0, 3, 5])
  // 喂豆豆一口小米（+3 → 56 顿）：第一颗星，当场带回来，暖豆 +20
  v = await service.feed('u1', { petId: 'doudou', foodId: 'xiaomi' })
  assert.deepEqual([v.pets[0].fed, v.pets[0].stars, v.pets[0].nextStar], [56, 1, 85])
  assert.deepEqual(v.cheers, [{ kind: 'star', petId: 'doudou', stars: 1, beans: 20 }])
  assert.equal(v.beans, 300)
  // 再喂一口不到下一颗：没有；下次进营地也不重复弹
  v = await service.feed('u1', { petId: 'doudou', foodId: 'xiaomi' })
  assert.deepEqual([v.cheers, v.beans], [[], 300])
  v = await service.get('u1', { markSeen: true })
  assert.deepEqual([v.cheers, v.beans], [[], 300])
  // 下锅喂出来的也当场带回来（豆豆爱吃小米 +3 → 62；手动改到 84 再下锅 → 87，第二颗）
  const doc = await repo.getGarden('u1')
  await repo.saveGarden('u1', { ...doc, pets: doc.pets.map((p) => (p.id === 'doudou' ? { ...p, fed: 84 } : p)) })
  v = await service.putFood('u1', { foodId: 'xiaomi' })
  assert.deepEqual(v.cheers, [{ kind: 'star', petId: 'doudou', stars: 2, beans: 20 }])
  assert.equal(v.beans, 320)
  // 打卡喂出来的（arrive 不弹）：下次进营地弹
  const d2 = await repo.getGarden('u1')
  await repo.saveGarden('u1', { ...d2, pets: d2.pets.map((p) => (p.id === 'doudou' ? { ...p, fed: 114 } : p)) })
  await service.arrive('u1')
  v = await service.get('u1', { markSeen: true })
  assert.deepEqual(v.cheers, [{ kind: 'star', petId: 'doudou', stars: 3, beans: 20 }])
  assert.equal(v.beans, 340)
})

test('album：满级的带星星和下一颗要喂到几顿；封面的下一个里程碑按住下的只数算', async () => {
  const { service } = setup({ camp: rich({ pets: residents(['doudou'], 60).concat(regulars(['nuonuo'], 4), regulars(['qiqi', 'shushu', 'huahua'])) }) })
  const a = await service.album('u1')
  const of = (id) => a.pets.find((p) => p.id === id)
  assert.deepEqual([of('doudou').level, of('doudou').stars, of('doudou').nextStar], [5, 1, 85])
  assert.deepEqual([of('nuonuo').level, of('nuonuo').stars, of('nuonuo').nextStar], [2, 0, null])
  assert.deepEqual([a.progress, a.goal], [{ pets: 5, home: 1, total: 12 }, { pets: 4, beans: 100 }])
})
