// test/camp-hungry.test.js：锅里空着，不够亲的出去找吃的；营地上提示「放点吃的就回来」，下锅后提示收掉
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')

test('锅空着：杞杞（1 级）找吃的去了、豆豆（4 级）在；提示条说放点吃的就回来；下锅后提示收掉', async () => {
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  camp.closeWelcome()
  const gardens = cloud.db.collections.get('gardens')
  const doc = gardens.get('u1')
  gardens.set('u1', {
    ...doc,
    foods: { xiaomi: 2 },
    pets: [{ id: 'doudou', since: '2026-10-20', fed: 20, fedToday: { date: '', n: 0 } }, { id: 'qiqi', since: '2026-10-21', fed: 0, fedToday: { date: '', n: 0 } }],
  })
  camp.life.stop()
  camp.life = null
  camp.onShow()
  await settle()
  assert.ok(/杞杞找吃的去了，放点吃的就回来/.test(camp.data.hungryText), camp.data.hungryText)
  assert.ok(!/豆豆/.test(camp.data.hungryText))
  camp.cook('xiaomi')
  await settle()
  assert.equal(camp.data.hungryText, '')
  camp.onUnload()
})
