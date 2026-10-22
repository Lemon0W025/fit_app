const test = require('node:test')
const assert = require('node:assert/strict')
const { createDayService } = require('../cloudfunctions/api/services/day')
const { createFakeRepo, createFakeChat, PROFILE, NOW, TODAY, CONFIG } = require('./helpers/fake-repo')

function setup({ results = [], withProfile = true } = {}) {
  const repo = createFakeRepo()
  if (withProfile) repo.state.profiles.set('u1', { ...PROFILE })
  const chat = createFakeChat(results)
  const logs = []
  const service = createDayService({ repo, chat, config: CONFIG, now: () => NOW, log: (...a) => logs.push(a) })
  return { repo, chat, service, logs }
}

async function seedMeals(repo) {
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', status: 'done', analysis: { foods: [{ name: '面' }], totalKcal: 500, protein: 20, carbs: 70, fat: 10, rating: 'yellow' }, createdAt: 2 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'breakfast', status: 'done', analysis: { foods: [{ name: '粥' }], totalKcal: 200, protein: 5, carbs: 40, fat: 1, rating: 'green' }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'snack', status: 'failed', analysis: null, createdAt: 3 })
}

test('get：汇总当天热量与剩余预算', async () => {
  const { repo, service } = setup()
  await seedMeals(repo)
  const day = await service.get('u1', {})
  assert.equal(day.date, TODAY)
  assert.equal(day.dailyKcal, 1270)
  assert.equal(day.meals.length, 3)
  assert.deepEqual(day.totals, { kcal: 700, protein: 25, carbs: 110, fat: 11 })
  assert.equal(day.remainingKcal, 570)
  assert.equal(day.summary, null)
  assert.equal(day.profile.nickname, '妈妈')
})

test('get：没有档案时 profile 为 null', async () => {
  const { service } = setup({ withProfile: false })
  const day = await service.get('u1')
  assert.equal(day.profile, null)
  assert.equal(day.dailyKcal, null)
  assert.equal(day.remainingKcal, null)
})

test('get：可以查指定日期，并带上已有总结', async () => {
  const { repo, service } = setup()
  await repo.saveSummary('u1', '2026-10-20', { text: '不错', totalKcal: 1000, createdAt: 1 })
  const day = await service.get('u1', { date: '2026-10-20' })
  assert.equal(day.date, '2026-10-20')
  assert.equal(day.summary.text, '不错')
})

test('get：日期格式错误 BAD_REQUEST', async () => {
  const { service } = setup()
  await assert.rejects(service.get('u1', { date: '10/20' }), { code: 'BAD_REQUEST' })
})

test('summarize：生成并保存总结，消息包含餐食与最近两次体重', async () => {
  const { repo, chat, service } = setup({ results: ['## 今日总结\n今天吃得不错！'] })
  await seedMeals(repo)
  await repo.saveWeight('u1', '2026-10-20', 71)
  await repo.saveWeight('u1', '2026-10-21', 70.4)
  await repo.saveWeight('u1', '2026-10-22', 70)
  const summary = await service.summarize('u1', {})
  assert.equal(summary.text, '今日总结\n今天吃得不错！')
  assert.equal(summary.totalKcal, 700)
  assert.equal(summary.date, TODAY)
  assert.equal(chat.calls[0].model, 'text-model')
  const user = chat.calls[0].messages[1].content
  assert.match(user, /粥/)
  assert.match(user, /面/)
  assert.match(user, /最近 70 kg/)
  assert.match(user, /-0\.4/)
  assert.doesNotMatch(user, /分析失败/)
  assert.equal((await repo.getSummary('u1', TODAY)).text, summary.text)
})

test('summarize：没有成功的打卡时 NO_MEALS', async () => {
  const { repo, service } = setup()
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'snack', status: 'failed', analysis: null, createdAt: 3 })
  await assert.rejects(service.summarize('u1', {}), { code: 'NO_MEALS' })
})

test('summarize：没有档案时 NO_PROFILE', async () => {
  const { service } = setup({ withProfile: false })
  await assert.rejects(service.summarize('u1', {}), { code: 'NO_PROFILE' })
})

test('summarize：AI 失败或返回空时 AI_FAILED', async () => {
  const a = setup({ results: [new Error('down')] })
  await seedMeals(a.repo)
  await assert.rejects(a.service.summarize('u1', {}), { code: 'AI_FAILED' })
  assert.equal(a.logs.length, 1)

  const b = setup({ results: ['   '] })
  await seedMeals(b.repo)
  await assert.rejects(b.service.summarize('u1', {}), { code: 'AI_FAILED' })
})
