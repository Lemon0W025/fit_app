const test = require('node:test')
const assert = require('node:assert/strict')
const { createWeightService } = require('../cloudfunctions/api/services/weight')
const { createFakeRepo, PROFILE, NOW, TODAY } = require('./helpers/fake-repo')

function setup({ withProfile = true } = {}) {
  const repo = createFakeRepo()
  if (withProfile) repo.state.profiles.set('u1', { ...PROFILE })
  const service = createWeightService({ repo, now: () => NOW })
  return { repo, service }
}

test('save：同一天重复记录会覆盖', async () => {
  const { repo, service } = setup()
  await service.save('u1', { weightKg: 69.8 })
  await service.save('u1', { weightKg: '69.56' })
  assert.deepEqual(await repo.listWeights('u1', 30), [{ date: TODAY, weightKg: 69.6 }])
})

test('save：当天体重同步更新档案和每日预算', async () => {
  const { repo, service } = setup()
  const res = await service.save('u1', { weightKg: 65 })
  const profile = await repo.getProfile('u1')
  assert.equal(profile.weightKg, 65)
  // 10*65 + 1000 - 250 - 161 = 1239; *1.375 - 500 = 1203.6 -> 1200
  assert.equal(profile.dailyKcal, 1200)
  assert.equal(profile.updatedAt, NOW.getTime())
  assert.deepEqual(res, { date: TODAY, weightKg: 65, dailyKcal: 1200 })
})

test('save：补记过去的体重不改档案', async () => {
  const { repo, service } = setup()
  const res = await service.save('u1', { weightKg: 71, date: '2026-10-20' })
  assert.equal((await repo.getProfile('u1')).weightKg, 70)
  assert.equal(res.dailyKcal, null)
})

test('save：没有档案也能记体重', async () => {
  const { repo, service } = setup({ withProfile: false })
  await service.save('u1', { weightKg: 60 })
  assert.equal((await repo.listWeights('u1', 30)).length, 1)
})

test('save：体重或日期不合法时 BAD_REQUEST', async () => {
  const { service } = setup()
  await assert.rejects(service.save('u1', { weightKg: 10 }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.save('u1', { weightKg: '' }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.save('u1', {}), { code: 'BAD_REQUEST' })
  await assert.rejects(service.save('u1', { weightKg: 60, date: '2026-13-01' }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.save('u1', { weightKg: 60, date: '2026-10-23' }), { code: 'BAD_REQUEST' })
})

test('list：默认 30 条、最多 90 条，并返回目标体重', async () => {
  const { repo, service } = setup()
  for (let i = 1; i <= 100; i++) {
    const d = new Date(Date.UTC(2026, 0, i))
    await repo.saveWeight('u1', d.toISOString().slice(0, 10), 70 - i / 100)
  }
  const def = await service.list('u1', {})
  assert.equal(def.items.length, 30)
  assert.equal(def.items[29].date, '2026-04-10')
  assert.equal(def.targetWeightKg, 60)
  assert.equal((await service.list('u1', { limit: 500 })).items.length, 90)
  assert.equal((await service.list('u1', { limit: 'x' })).items.length, 30)
})

test('list：没有档案时目标体重为 null', async () => {
  const { service } = setup({ withProfile: false })
  assert.deepEqual(await service.list('u1'), { items: [], targetWeightKg: null })
})
