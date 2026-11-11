// test/camp-hungry.test.js：锅里空着，住户都留在营地；营地上提示「点锅放点吃的」，下锅后提示收掉
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')

test('锅空着：杞杞（1 级）和豆豆（4 级）都在营地；提示条说大家等着开饭、点锅放点吃的；下锅后提示收掉', async () => {
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '小暖', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
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
  assert.equal(camp.data.hungryText, '🍲 锅里空空的，大家等着开饭呢，点锅放点吃的')
  assert.deepEqual(camp.data.pets.map((p) => [p.id, p.hidden]), [['doudou', false], ['qiqi', false]])
  assert.ok(camp.life.whereIs().every((w) => w.action !== 'away'))
  camp.cook('xiaomi')
  await settle()
  assert.equal(camp.data.hungryText, '')
  camp.onUnload()
})
