const test = require('node:test')
const assert = require('node:assert/strict')
const { createForestService } = require('../cloudfunctions/api/services/forest')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')
const { addDays } = require('../cloudfunctions/api/lib/shared/date')

function setup() {
  const repo = createFakeRepo()
  const forest = createForestService({ repo, now: () => NOW })
  return { repo, forest }
}

let seq = 0
async function addMeal(repo, date, mealType, rating = 'yellow', kcal = 300) {
  seq += 1
  return repo.addMeal({ _openid: 'u1', date, mealType, status: 'done', analysis: { rating, totalKcal: kcal }, createdAt: seq })
}

test('syncDay：按当天打卡记下种树和暖豆', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast')
  assert.deepEqual(await forest.syncDay('u1', TODAY), { stage: 'sprout', beans: 10 })
  let garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 10 })

  await addMeal(repo, TODAY, 'lunch')
  assert.deepEqual(await forest.syncDay('u1', TODAY), { stage: 'small', beans: 20 })
  garden = await repo.getGarden('u1')
  assert.deepEqual(garden.beans.earned, { [TODAY]: 20 })
})

test('syncDay：重复同步不会重复记豆', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast')
  await forest.syncDay('u1', TODAY)
  await forest.syncDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 10 })
})

test('syncDay：只剩加餐时这天不算种树，暖豆收回', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'lunch')
  await forest.syncDay('u1', TODAY)
  repo.state.meals = []
  await addMeal(repo, TODAY, 'snack')
  assert.deepEqual(await forest.syncDay('u1', TODAY), { stage: 'empty', beans: 0 })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, {})
  assert.deepEqual(garden.beans.earned, {})
})

test('syncDay：旧档先迁成营地再记豆；营地文档里其他字段保留', async () => {
  const { repo, forest } = setup()
  await repo.saveGarden('u1', { currentSpecies: 'peach', unlocked: ['apple'], unseen: [], days: { '2026-10-20': 'apple' }, inventory: { daisy: 2 }, beans: { spent: 30, bonus: 60, earned: {} } })
  await addMeal(repo, TODAY, 'lunch')
  await forest.syncDay('u1', TODAY)
  const garden = await repo.getGarden('u1')
  assert.equal(garden.camp, 1)
  assert.equal(garden.inventory, undefined)
  assert.deepEqual(garden.beans, { spent: 0, bonus: 0, earned: { [TODAY]: 10 } })
  assert.deepEqual(garden.days, { '2026-10-20': 'apple', [TODAY]: true })
  assert.equal(garden.currentSpecies, undefined)
  assert.equal(garden.unlocked, undefined)
  await repo.saveGarden('u1', { ...garden, foods: { xiaomi: 2 }, beans: { ...garden.beans, bonus: 60, spent: 30 } })
  await forest.syncDay('u1', TODAY)
  const again = await repo.getGarden('u1')
  assert.deepEqual(again.foods, { xiaomi: 2 })
  assert.deepEqual(again.beans, { spent: 30, bonus: 60, earned: { [TODAY]: 10 } })
})

test('today：今天的印章、暖豆、提示和连续天数', async () => {
  const { repo, forest } = setup()
  for (let i = 3; i >= 1; i--) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
  await addMeal(repo, TODAY, 'breakfast', 'green')
  await addMeal(repo, TODAY, 'lunch', 'green')
  await forest.syncDay('u1', TODAY)
  const view = await forest.today('u1', TODAY, await repo.listMeals('u1', TODAY))
  assert.deepEqual(view.stamps.map((s) => s.state), ['green', 'green', 'none'])
  assert.equal(view.hint, '再打卡晚餐还能得 20 暖豆')
  assert.equal(view.beansToday, 20)
  assert.equal(view.nextGain, 20)
  assert.equal(view.streak, 4)
  assert.equal(view.beans, 50)
  assert.equal(view.stage, undefined)
})

test('today：还没有花园时也能返回，余额不显示负数', async () => {
  const { repo, forest } = setup()
  const empty = await forest.today('u1', TODAY, [])
  assert.equal(empty.beansToday, 0)
  assert.deepEqual(empty.stamps.map((s) => s.state), ['none', 'none', 'none'])
  assert.equal(empty.streak, 0)
  assert.equal(empty.beans, 0)
  await repo.saveGarden('u1', { beans: { earned: {}, bonus: 0, spent: 30 } })
  assert.equal((await forest.today('u1', TODAY, [])).beans, 0)
})

test('get：本月日历，每天的印章和暖豆，未来日期标 future', async () => {
  const { repo, forest } = setup()
  for (const t of ['breakfast', 'lunch', 'dinner']) await addMeal(repo, '2026-10-20', t, 'green', 400)
  await addMeal(repo, '2026-10-21', 'lunch')
  await addMeal(repo, '2026-10-21', 'snack', 'red', 200)
  await addMeal(repo, TODAY, 'breakfast')
  await addMeal(repo, TODAY, 'lunch')
  await addMeal(repo, '2026-09-30', 'lunch')
  for (const d of ['2026-10-20', '2026-10-21', TODAY]) await forest.syncDay('u1', d)

  const view = await forest.get('u1', {})
  assert.equal(view.month, '2026-10')
  assert.equal(view.monthLabel, '2026年10月')
  assert.equal(view.firstWeekday, 4)
  assert.equal(view.days.length, 31)
  assert.deepEqual(view.days[19], {
    date: '2026-10-20',
    day: 20,
    future: false,
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green' },
      { mealType: 'lunch', label: '午', state: 'green' },
      { mealType: 'dinner', label: '晚', state: 'green' },
    ],
    beans: 60,
    mealsCount: 3,
    kcal: 1200,
  })
  assert.deepEqual(view.days[20].stamps.map((s) => s.state), ['none', 'yellow', 'none'])
  assert.equal(view.days[20].beans, 10)
  assert.equal(view.days[20].mealsCount, 2)
  assert.equal(view.days[21].beans, 20)
  assert.equal(view.days[0].beans, 0)
  assert.equal(view.days[0].future, false)
  assert.equal(view.days[22].future, true)
  assert.deepEqual(view.days[22].stamps, [])
  assert.deepEqual(view.stats, { days: 3, beans: 90 })
  assert.equal(view.prevMonth, '2026-09')
  assert.equal(view.nextMonth, null)
  assert.equal(view.today.beansToday, 20)
  assert.equal(view.today.streak, 3)
  assert.equal(view.totalDays, 3)
})

test('get：查看过去的月份', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, '2026-09-30', 'lunch')
  await forest.syncDay('u1', '2026-09-30')
  const view = await forest.get('u1', { month: '2026-09' })
  assert.equal(view.days.length, 30)
  assert.equal(view.days[29].beans, 10)
  assert.equal(view.firstWeekday, 2)
  assert.equal(view.nextMonth, '2026-10')
  assert.equal(view.today.date, TODAY)
})

test('get：月份不合法或在未来时 BAD_REQUEST', async () => {
  const { forest } = setup()
  await assert.rejects(forest.get('u1', { month: '2026-13' }), { code: 'BAD_REQUEST' })
  await assert.rejects(forest.get('u1', { month: '10/2026' }), { code: 'BAD_REQUEST' })
  await assert.rejects(forest.get('u1', { month: '2026-11' }), { code: 'BAD_REQUEST' })
})
