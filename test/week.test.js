// test/week.test.js：每周小结（lib/week.js 怎么算、services/week.js 取哪一周）
const test = require('node:test')
const assert = require('node:assert/strict')
const { weekRange, buildWeek, weightChange } = require('../cloudfunctions/api/lib/week')
const { createWeekService } = require('../cloudfunctions/api/services/week')
const { createFakeRepo, PROFILE } = require('./helpers/fake-repo')

let seq = 0
function meal(date, mealType, { kcal = 400, rating = 'green', timing = 'on' } = {}) {
  seq += 1
  return { _id: `m${seq}`, _openid: 'u1', date, mealType, timing, status: 'done', analysis: { isFood: true, rating, totalKcal: kcal, protein: 10, carbs: 50, fat: 10 }, createdAt: seq }
}

test('weekRange：周一到周日；offset 往前数几周', () => {
  // 2026-10-22 是周四
  assert.deepEqual(weekRange('2026-10-22', 0), { start: '2026-10-19', end: '2026-10-25' })
  assert.deepEqual(weekRange('2026-10-22', 1), { start: '2026-10-12', end: '2026-10-18' })
  assert.deepEqual(weekRange('2026-10-19', 0), { start: '2026-10-19', end: '2026-10-25' }, '周一当天')
  assert.deepEqual(weekRange('2026-10-25', 0), { start: '2026-10-19', end: '2026-10-25' }, '周日当天')
  assert.deepEqual(weekRange('2026-11-02', 1), { start: '2026-10-26', end: '2026-11-01' }, '跨月')
})

test('buildWeek：七天的热量、印章、暖豆，和打卡几天、准时几顿、平均热量', () => {
  const meals = [
    meal('2026-10-12', 'breakfast'), meal('2026-10-12', 'lunch', { kcal: 600 }), meal('2026-10-12', 'dinner', { kcal: 500 }),
    meal('2026-10-13', 'lunch', { kcal: 900, rating: 'red', timing: 'late' }), meal('2026-10-13', 'snack', { kcal: 300 }),
    meal('2026-10-15', 'dinner', { kcal: 700, rating: 'yellow', timing: 'early' }),
  ]
  const w = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals, dailyKcal: 1400, minKcal: 1200, earned: { '2026-10-12': 99 }, days: { '2026-10-14': 'patch' } })
  assert.equal(w.label, '10月12日～10月18日')
  assert.equal(w.current, false)
  assert.deepEqual(w.days.map((d) => d.weekday).join(''), '一二三四五六日')
  assert.deepEqual(w.days.map((d) => d.kcal), [1500, 1200, 0, 700, 0, 0, 0])
  assert.deepEqual(w.days.map((d) => d.over), [true, false, false, false, false, false, false])
  assert.deepEqual(w.days.map((d) => d.logged), [3, 1, 0, 1, 0, 0, 0])
  assert.equal(w.days[0].beans, 99, '记过的日子按当时得的')
  assert.equal(w.days[1].beans, 5)
  assert.equal(w.days[2].patched, true)
  assert.deepEqual(w.stats, {
    days: 7, daysLogged: 3, mainMeals: 5, onTime: 3, beans: 99 + 5 + 5, fullDays: 1, avgKcal: 1500, overDays: 1, dailyKcal: 1400,
    ratings: { green: 3, yellow: 1, red: 1 },
  })
  assert.equal(w.empty, false)
  assert.match(w.lines[0].text, /打了 3 天卡，有几天没拍/)
  assert.match(w.lines[1].text, /拍了 5 顿正餐，其中 3 顿是准时拍的/)
  assert.match(w.lines[1].text, /早饭漏得最多（6 次）/)
  assert.match(w.lines[2].text, /三顿都拍了的 1 天，平均每天 1500 千卡，和预算（1400）差不多/)
  assert.match(w.lines[3].text, /没记体重/)
  assert.equal(w.goal, '下一周的小目标：打卡 5 天。')
})

test('buildWeek：这一周还没过完，后面的日子是 future；一顿没拍是 empty', () => {
  const w = buildWeek({ start: '2026-10-19', today: '2026-10-22', meals: [meal('2026-10-19', 'lunch')], dailyKcal: 1400 })
  assert.equal(w.current, true)
  assert.deepEqual(w.days.map((d) => d.future), [false, false, false, false, true, true, true])
  assert.deepEqual(w.days.map((d) => d.today), [false, false, false, true, false, false, false])
  assert.equal(w.stats.days, 4)
  assert.match(w.lines[0].text, /^这周到今天打了 1 天卡/)
  const none = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: [], dailyKcal: 1400 })
  assert.equal(none.empty, true)
  assert.equal(none.goal, '下一周的小目标：每天至少拍一顿。')
})

test('buildWeek：话按情况挑（全勤、准时、超了、吃太少）', () => {
  const full = []
  for (let i = 12; i <= 18; i++) for (const t of ['breakfast', 'lunch', 'dinner']) full.push(meal(`2026-10-${i}`, t, { kcal: 460 }))
  const good = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: full, dailyKcal: 1400, minKcal: 1200 })
  assert.match(good.lines[0].text, /七天都打卡了/)
  assert.match(good.lines[1].text, /按点吃饭做得很好/)
  assert.match(good.lines[2].text, /和预算（1400）差不多/)
  assert.equal(good.goal, '下一周的小目标：照这样保持。')
  const over = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: full.map((m) => ({ ...m, analysis: { ...m.analysis, totalKcal: 600 } })), dailyKcal: 1400, minKcal: 1200 })
  assert.match(over.lines[2].text, /^平均每天 1800 千卡，比预算多 400；这一周有 7 天超了/)
  assert.equal(over.goal, '下一周的小目标：超预算的日子少一两天。')
  const low = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: full.map((m) => ({ ...m, analysis: { ...m.analysis, totalKcal: 300 } })), dailyKcal: 1400, minKcal: 1200 })
  assert.match(low.lines[2].text, /只吃了 900 千卡，太少了/)
  // 只拍了零星几顿：不拿它算平均（会低得离谱）
  const few = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: [meal('2026-10-12', 'lunch'), meal('2026-10-13', 'dinner')], dailyKcal: 1400, minKcal: 1200 })
  assert.equal(few.stats.avgKcal, 0)
  assert.match(few.lines[2].text, /没有哪天三顿都拍全/)
})

test('weightChange：这周里最后一次和它之前最近的一次比；这周没称就没有', () => {
  const ws = [{ date: '2026-10-05', weightKg: 70.5 }, { date: '2026-10-13', weightKg: 70.2 }, { date: '2026-10-17', weightKg: 69.8 }, { date: '2026-10-20', weightKg: 69.5 }]
  assert.deepEqual(weightChange(ws, '2026-10-12', '2026-10-18'), { from: 70.5, to: 69.8, diff: -0.7 })
  assert.deepEqual(weightChange(ws.slice(1), '2026-10-12', '2026-10-18'), { from: 70.2, to: 69.8, diff: -0.4 }, '以前没称过：和这周第一次比')
  assert.deepEqual(weightChange(ws.slice(2, 3), '2026-10-12', '2026-10-18'), { from: null, to: 69.8, diff: null })
  assert.equal(weightChange(ws.slice(0, 1), '2026-10-12', '2026-10-18'), null)
  assert.equal(weightChange([], '2026-10-12', '2026-10-18'), null)
  const w = buildWeek({ start: '2026-10-12', today: '2026-10-22', meals: [meal('2026-10-12', 'lunch')], dailyKcal: 1400, weights: ws })
  assert.match(w.lines.at(-1).text, /体重 70.5 → 69.8 公斤，轻了 0.7 公斤/)
})

test('week.get：默认上一周，offset 0 是这一周；没建档、不对的 offset 报错', async () => {
  const repo = createFakeRepo()
  const service = createWeekService({ repo, now: () => new Date('2026-10-22T12:00:00+08:00') })
  await assert.rejects(service.get('u1', {}), { code: 'NO_PROFILE' })
  repo.state.profiles.set('u1', { ...PROFILE })
  await repo.addMeal(meal('2026-10-13', 'lunch'))
  await repo.addMeal(meal('2026-10-20', 'lunch'))
  const last = await service.get('u1', {})
  assert.deepEqual([last.offset, last.start, last.end, last.older, last.newer], [1, '2026-10-12', '2026-10-18', 2, 0])
  assert.equal(last.stats.mainMeals, 1)
  assert.equal(last.stats.dailyKcal, PROFILE.dailyKcal)
  const cur = await service.get('u1', { offset: 0 })
  assert.deepEqual([cur.start, cur.current, cur.newer], ['2026-10-19', true, null])
  for (const offset of [-1, 27, 1.5, '1']) await assert.rejects(service.get('u1', { offset }), { code: 'BAD_REQUEST' }, String(offset))
})
