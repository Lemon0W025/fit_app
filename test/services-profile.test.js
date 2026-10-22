const test = require('node:test')
const assert = require('node:assert/strict')
const { createProfileService } = require('../cloudfunctions/api/services/profile')
const { createFakeRepo, NOW, TODAY } = require('./helpers/fake-repo')

const input = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }

function setup() {
  const repo = createFakeRepo()
  const service = createProfileService({ repo, now: () => NOW })
  return { repo, service }
}

test('get 没有档案时返回 null', async () => {
  const { service } = setup()
  assert.equal(await service.get('u1'), null)
})

test('首次 save 计算每日预算并记录当天体重', async () => {
  const { repo, service } = setup()
  const saved = await service.save('u1', input)
  assert.equal(saved.dailyKcal, 1270)
  assert.equal(saved.createdAt, NOW.getTime())
  assert.deepEqual(await service.get('u1'), saved)
  assert.deepEqual(await repo.listWeights('u1', 30), [{ date: TODAY, weightKg: 70 }])
})

test('再次 save 保留 createdAt、不重复写体重', async () => {
  const { repo, service } = setup()
  await repo.saveProfile('u1', { ...input, dailyKcal: 1270, createdAt: 123, updatedAt: 123 })
  const saved = await service.save('u1', { ...input, targetWeightKg: 70 })
  assert.equal(saved.createdAt, 123)
  assert.equal(saved.updatedAt, NOW.getTime())
  assert.equal(saved.dailyKcal, 1770)
  assert.deepEqual(await repo.listWeights('u1', 30), [])
})

test('非法输入抛 BAD_REQUEST，多条错误用分号连接', async () => {
  const { service } = setup()
  await assert.rejects(service.save('u1', { ...input, age: 5, heightCm: 999 }), (e) => {
    assert.equal(e.code, 'BAD_REQUEST')
    assert.match(e.message, /年龄.*；.*身高/)
    return true
  })
})
