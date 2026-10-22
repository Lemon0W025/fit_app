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

test('recordDay：当天第一次记录用当前树种，重复调用不变', async () => {
  const { repo, forest } = setup()
  await forest.recordDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).days, { [TODAY]: 'apple' })
  await forest.recordDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).days, { [TODAY]: 'apple' })
})

test('recordDay：种满 7 棵解锁橘子树，并记为待庆祝', async () => {
  const { repo, forest } = setup()
  for (let i = 6; i >= 1; i--) await forest.recordDay('u1', addDays(TODAY, -i))
  assert.deepEqual((await repo.getGarden('u1')).unlocked, ['apple'])
  const garden = await forest.recordDay('u1', TODAY)
  assert.deepEqual(garden.unlocked, ['apple', 'orange'])
  assert.deepEqual(garden.unseen, ['orange'])
})

test('pruneDay：当天已没有正餐时删掉这一天，还有正餐则保留', async () => {
  const { repo, forest } = setup()
  await forest.recordDay('u1', TODAY)
  await addMeal(repo, TODAY, 'lunch')
  await forest.pruneDay('u1', TODAY)
  assert.ok((await repo.getGarden('u1')).days[TODAY])

  repo.state.meals = []
  await addMeal(repo, TODAY, 'snack')
  await forest.pruneDay('u1', TODAY)
  assert.deepEqual((await repo.getGarden('u1')).days, {})
})

test('pruneDay：没有记录时什么也不做', async () => {
  const { repo, forest } = setup()
  await forest.pruneDay('u1', TODAY)
  assert.equal(await repo.getGarden('u1'), null)
})

test('today：返回今天的树、提示、连续天数，新解锁只返回一次', async () => {
  const { repo, forest } = setup()
  for (let i = 6; i >= 0; i--) await forest.recordDay('u1', addDays(TODAY, -i))
  await addMeal(repo, TODAY, 'breakfast', 'green')
  await addMeal(repo, TODAY, 'lunch', 'green')
  const meals = await repo.listMeals('u1', TODAY)

  const first = await forest.today('u1', TODAY, meals)
  assert.equal(first.stage, 'small')
  assert.equal(first.stageLabel, '小树')
  assert.equal(first.species, 'apple')
  assert.equal(first.speciesName, '苹果树')
  assert.equal(first.hint, '再打卡晚餐就能长成大树')
  assert.equal(first.streak, 7)
  assert.equal(first.totalTrees, 7)
  assert.deepEqual(first.newlyUnlocked, [{ id: 'orange', name: '橘子树' }])

  const second = await forest.today('u1', TODAY, meals)
  assert.deepEqual(second.newlyUnlocked, [])
})

test('today：还没有花园时也能返回', async () => {
  const { forest } = setup()
  const view = await forest.today('u1', TODAY, [])
  assert.equal(view.stage, 'empty')
  assert.equal(view.species, 'apple')
  assert.equal(view.streak, 0)
  assert.equal(view.totalTrees, 0)
})

test('get：默认本月日历，未来日期为 future，统计种树和结果数', async () => {
  const { repo, forest } = setup()
  // 10 月 20 日：三顿全绿 → 结果；10 月 21 日：一顿 → 树苗；10 月 22 日（今天）：两顿 → 小树
  for (const t of ['breakfast', 'lunch', 'dinner']) await addMeal(repo, '2026-10-20', t, 'green', 400)
  await addMeal(repo, '2026-10-21', 'lunch')
  await addMeal(repo, '2026-10-21', 'snack', 'red', 200)
  await addMeal(repo, TODAY, 'breakfast')
  await addMeal(repo, TODAY, 'lunch')
  await addMeal(repo, '2026-09-30', 'lunch')
  for (const d of ['2026-10-20', '2026-10-21', TODAY]) await forest.recordDay('u1', d)

  const view = await forest.get('u1', {})
  assert.equal(view.month, '2026-10')
  assert.equal(view.monthLabel, '2026年10月')
  assert.equal(view.firstWeekday, 4)
  assert.equal(view.days.length, 31)
  assert.deepEqual(view.days[19], { date: '2026-10-20', day: 20, stage: 'fruit', species: 'apple', mealsCount: 3, kcal: 1200 })
  assert.equal(view.days[20].stage, 'sprout')
  assert.equal(view.days[20].mealsCount, 2)
  assert.equal(view.days[20].kcal, 500)
  assert.equal(view.days[21].stage, 'small')
  assert.equal(view.days[0].stage, 'empty')
  assert.equal(view.days[22].stage, 'future')
  assert.deepEqual(view.stats, { trees: 3, fruits: 1 })
  assert.equal(view.prevMonth, '2026-09')
  assert.equal(view.nextMonth, null)
  assert.equal(view.today.stage, 'small')
  assert.equal(view.today.streak, 3)
  assert.equal(view.totalTrees, 3)
  assert.equal(view.currentSpecies, 'apple')
  assert.deepEqual(view.species.map((s) => [s.id, s.unlocked]), [
    ['apple', true], ['orange', false], ['peach', false], ['pomegranate', false], ['persimmon', false], ['cherry', false],
  ])
  assert.deepEqual(view.nextUnlock, { id: 'orange', name: '橘子树', remaining: 4 })
})

test('get：查看过去的月份', async () => {
  const { repo, forest } = setup()
  await addMeal(repo, '2026-09-30', 'lunch')
  await forest.recordDay('u1', '2026-09-30')
  const view = await forest.get('u1', { month: '2026-09' })
  assert.equal(view.days.length, 30)
  assert.equal(view.days[29].stage, 'sprout')
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

test('setSpecies：未解锁或不存在的树种 BAD_REQUEST', async () => {
  const { forest } = setup()
  await assert.rejects(forest.setSpecies('u1', { species: 'orange' }), (e) => {
    assert.equal(e.code, 'BAD_REQUEST')
    assert.match(e.message, /橘子树还没解锁/)
    return true
  })
  await assert.rejects(forest.setSpecies('u1', { species: 'banana' }), { code: 'BAD_REQUEST' })
})

test('setSpecies：切换后今天的树一起换，过去的日子不变', async () => {
  const { repo, forest } = setup()
  for (let i = 6; i >= 0; i--) await forest.recordDay('u1', addDays(TODAY, -i))
  assert.deepEqual(await forest.setSpecies('u1', { species: 'orange' }), { currentSpecies: 'orange' })
  const garden = await repo.getGarden('u1')
  assert.equal(garden.currentSpecies, 'orange')
  assert.equal(garden.days[TODAY], 'orange')
  assert.equal(garden.days[addDays(TODAY, -1)], 'apple')
  await forest.recordDay('u1', addDays(TODAY, 1))
  assert.equal((await repo.getGarden('u1')).days[addDays(TODAY, 1)], 'orange')
})
