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
async function addMeal(repo, date, mealType, { rating = 'yellow', kcal = 300, timing = 'on' } = {}) {
  seq += 1
  return repo.addMeal({ _openid: 'u1', date, mealType, timing, status: 'done', analysis: { rating, totalKcal: kcal }, createdAt: seq })
}

test('syncDay：按当天打卡记下暖豆（准时 15、不在饭点 5）', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast', { timing: 'late' })
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 5, milestone: null })
  let garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 5 })

  await addMeal(repo, TODAY, 'lunch')
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 20, milestone: null })
  garden = await repo.getGarden('u1')
  assert.deepEqual(garden.beans.earned, { [TODAY]: 20 })
})

test('syncDay：重复同步不会重复记豆', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'breakfast')
  await forest.syncDay('u1', TODAY)
  await forest.syncDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 15 })
})

test('syncDay：只剩加餐时这天不算打卡，暖豆收回', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, TODAY, 'lunch')
  await forest.syncDay('u1', TODAY)
  repo.state.meals = []
  await addMeal(repo, TODAY, 'snack', { timing: null })
  assert.deepEqual(await forest.syncDay('u1', TODAY), { beans: 0, milestone: null })
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
  assert.equal(garden.camp, 4)
  assert.equal(garden.inventory, undefined)
  assert.deepEqual(garden.beans, { spent: 0, bonus: 0, earned: { [TODAY]: 15 } })
  assert.deepEqual(garden.days, { '2026-10-20': 'apple', [TODAY]: true })
  assert.equal(garden.currentSpecies, undefined)
  assert.equal(garden.unlocked, undefined)
  await repo.saveGarden('u1', { ...garden, foods: { xiaomi: 2 }, beans: { ...garden.beans, bonus: 60, spent: 30 } })
  await forest.syncDay('u1', TODAY)
  const again = await repo.getGarden('u1')
  assert.deepEqual(again.foods, { xiaomi: 2 })
  assert.deepEqual(again.beans, { spent: 30, bonus: 60, earned: { [TODAY]: 15 } })
})

test('today：今天的印章、暖豆、提示、连续天数、本月准时几顿', async () => {
  const { repo, forest } = setup()
  for (let i = 3; i >= 1; i--) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
  await addMeal(repo, TODAY, 'breakfast', { rating: 'green', timing: 'late' })
  await addMeal(repo, TODAY, 'lunch', { rating: 'green' })
  await forest.syncDay('u1', TODAY)
  const view = await forest.today('u1', TODAY, await repo.listMeals('u1', TODAY))
  assert.deepEqual(view.stamps.map((s) => [s.state, s.onTime]), [['green', false], ['green', true], ['none', false]])
  // 12:00 午饭已经拍了，提示看下一顿
  assert.equal(view.hint, '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(view.beansToday, 30)
  assert.equal(view.streak, 4)
  assert.equal(view.beans, 75)
  assert.equal(view.monthOnTime, 4)
  assert.deepEqual(view.mealTimes, { breakfast: '07:30', lunch: '12:00', dinner: '18:00' })
  assert.deepEqual(view.nextMilestone, { days: 7, left: 3 })
  assert.equal(view.nextGain, undefined)
})

test('today：按档案里的饭点算', async () => {
  const { repo, forest } = setup()
  const view = await forest.today('u1', TODAY, [], { mealTimes: { breakfast: '07:30', lunch: '11:00', dinner: '18:00' } })
  assert.equal(view.hint, '午饭 10:00～12:00 拍算准时，能得 15 暖豆')
})

test('today：还没有营地时也能返回，余额不显示负数', async () => {
  const { repo, forest } = setup()
  const empty = await forest.today('u1', TODAY, [])
  assert.equal(empty.beansToday, 0)
  assert.deepEqual(empty.stamps.map((s) => s.state), ['none', 'none', 'none'])
  assert.equal(empty.streak, 0)
  assert.deepEqual(empty.nextMilestone, { days: 3, left: 3 })
  assert.equal(empty.beans, 0)
  assert.equal(empty.monthOnTime, 0)
  await repo.saveGarden('u1', { beans: { earned: {}, bonus: 0, spent: 30 } })
  assert.equal((await forest.today('u1', TODAY, [])).beans, 0)
})

test('get：本月日历，每天的印章、暖豆、准时几顿，未来日期标 future', async () => {
  const { repo, forest } = setup()
  for (const t of ['breakfast', 'lunch', 'dinner']) await addMeal(repo, '2026-10-20', t, { rating: 'green', kcal: 400 })
  await addMeal(repo, '2026-10-21', 'lunch')
  await addMeal(repo, '2026-10-21', 'snack', { rating: 'red', kcal: 200, timing: null })
  await addMeal(repo, TODAY, 'breakfast', { timing: 'late' })
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
      { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
      { mealType: 'lunch', label: '午', state: 'green', onTime: true },
      { mealType: 'dinner', label: '晚', state: 'green', onTime: true },
    ],
    beans: 75,
    onTime: 3,
    mealsCount: 3,
    kcal: 1200,
  })
  assert.deepEqual(view.days[20].stamps.map((s) => s.state), ['none', 'yellow', 'none'])
  assert.equal(view.days[20].beans, 15)
  assert.equal(view.days[20].mealsCount, 2)
  assert.equal(view.days[21].beans, 20)
  assert.equal(view.days[21].onTime, 1)
  assert.equal(view.days[0].beans, 0)
  assert.equal(view.days[0].future, false)
  assert.equal(view.days[22].future, true)
  assert.deepEqual(view.days[22].stamps, [])
  assert.deepEqual(view.stats, { days: 3, beans: 110, onTime: 5 })
  assert.equal(view.prevMonth, '2026-09')
  assert.equal(view.nextMonth, null)
  assert.equal(view.today.beansToday, 20)
  assert.equal(view.today.streak, 3)
  assert.equal(view.today.monthOnTime, 5)
  assert.equal(view.totalDays, 3)
})

test('get：规则改过以前记下的日子，按当时得的暖豆显示', async () => {
  const { repo, forest } = setup()
  await repo.addMeal({ _openid: 'u1', date: '2026-10-19', mealType: 'lunch', status: 'done', analysis: { rating: 'green', totalKcal: 300 }, createdAt: 1 })
  await repo.saveGarden('u1', { camp: 1, days: { '2026-10-19': true }, beans: { earned: { '2026-10-19': 40 }, bonus: 0, spent: 0 } })
  const view = await forest.get('u1', {})
  assert.equal(view.days[18].beans, 40)
  assert.equal(view.days[18].onTime, 0)
})

test('get：查看过去的月份', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, '2026-09-30', 'lunch')
  await forest.syncDay('u1', '2026-09-30')
  const view = await forest.get('u1', { month: '2026-09' })
  assert.equal(view.days.length, 30)
  assert.equal(view.days[29].beans, 15)
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

async function lunchOn(repo, forest, ...daysAgo) {
  for (const i of daysAgo) {
    const d = addDays(TODAY, -i)
    await addMeal(repo, d, 'lunch')
    await forest.syncDay('u1', d)
  }
}

test('syncDay：当天第一顿正餐让连续天数正好到里程碑，带 milestone 并记下纪念章；第二顿不再带', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'breakfast')
  const first = await forest.syncDay('u1', TODAY)
  assert.deepEqual(first.milestone, { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
  assert.deepEqual((await repo.getGarden('u1')).streakBadges, { 3: { first: TODAY, last: TODAY, times: 1 } })
})

test('syncDay：删掉打卡这天不算了，纪念章不收回；同一天再拍不再庆祝', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'breakfast')
  await forest.syncDay('u1', TODAY)
  repo.state.meals = repo.state.meals.filter((m) => m.date !== TODAY)
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
  const garden = await repo.getGarden('u1')
  assert.equal(garden.days[TODAY], undefined)
  assert.deepEqual(garden.streakBadges, { 3: { first: TODAY, last: TODAY, times: 1 } })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone, null)
})

test('syncDay：断了以后再连到同一个天数，记第 2 次', async () => {
  const { repo, forest } = setup()
  await lunchOn(repo, forest, 10, 9, 8)
  await lunchOn(repo, forest, 2, 1)
  await addMeal(repo, TODAY, 'lunch')
  const m = (await forest.syncDay('u1', TODAY)).milestone
  assert.equal(m.days, 3)
  assert.equal(m.times, 2)
  assert.deepEqual((await repo.getGarden('u1')).streakBadges[3], { first: addDays(TODAY, -8), last: TODAY, times: 2 })
})

test('syncDay：milestone 带营地里喂得最多的那只，一样多取先来的', async () => {
  const { repo, forest } = setup()
  await repo.saveGarden('u1', {
    camp: 1,
    pets: [{ id: 'doudou', fed: 4 }, { id: 'nuonuo', fed: 9 }, { id: 'qiqi', fed: 9 }],
    days: { [addDays(TODAY, -2)]: true, [addDays(TODAY, -1)]: true },
  })
  await addMeal(repo, TODAY, 'lunch')
  assert.equal((await forest.syncDay('u1', TODAY)).milestone.petId, 'nuonuo')
})

test('get：纪念章列到下一个为止，已拿的带第一次的日期和次数；以前拿过更大的也列出来', async () => {
  const { repo, forest } = setup()
  const days = {}
  for (let i = 0; i < 5; i++) days[addDays(TODAY, -i)] = true
  await repo.saveGarden('u1', { camp: 1, days, streakBadges: { 3: { first: '2026-10-20', last: '2026-10-20', times: 1 } } })
  assert.deepEqual((await forest.get('u1', {})).badges, [
    { days: 3, tier: 'bronze', glow: false, got: true, first: '2026-10-20', times: 1 },
    { days: 7, tier: 'bronze', glow: false, got: false, left: 2 },
  ])
  await repo.saveGarden('u1', { camp: 1, days: { [TODAY]: true }, streakBadges: { 3: { first: '2026-09-03', last: '2026-09-03', times: 1 }, 7: { first: '2026-09-07', last: '2026-09-07', times: 1 } } })
  assert.deepEqual((await forest.get('u1', {})).badges.map((b) => [b.days, b.got, b.left]), [[3, true, undefined], [7, true, undefined]])
})
