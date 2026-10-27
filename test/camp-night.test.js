// test/camp-night.test.js：夜里火着时整片草坪亮起来（点火版夜景盖在夜景上），下锅点火时慢慢显出来
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')

async function nightCamp(cloud, main) {
  const wx = createWx(main)
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 22
  camp.onLoad()
  camp.onShow()
  await settle()
  return camp
}

test('夜里：锅空着只有夜景；下锅点火，点火版盖上来、慢慢显出来；块不重发；火着时再进来直接亮、不淡入', async () => {
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const camp = await nightCamp(cloud, main)
  camp.closeWelcome()
  assert.equal(camp.data.world.night, true)
  assert.equal(camp.data.lit, null)
  assert.ok(camp.data.base[0].image.endsWith('night-t00.jpg'))
  // 火没点：木盖、帐篷用夜景那套
  assert.ok(/night-tent\./.test(camp.data.cuts.find((c) => c.key === 'tent-0').image))
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, foods: { xiaomi: 2 } })
  camp.onShow()
  await settle()
  camp.cook('xiaomi')
  await settle()
  assert.ok(camp.data.lit, '火点着：盖上点火版')
  assert.equal(camp.data.lit.backdrop, '/images/camp/base/lit-world.jpg')
  assert.equal(camp.data.lit.tiles.length, 24)
  assert.ok(camp.data.lit.tiles.every((t) => /\/lit-[td]\d\d\.jpg$/.test(t.image)))
  assert.equal(camp.data.litFade, true, '正看着时点火：慢慢显出来')
  assert.ok(/lit-tent\./.test(camp.data.cuts.find((c) => c.key === 'tent-0').image))
  // 小动物按位置上色：不再一律「本来的颜色」
  assert.ok(camp.data.pets.every((p) => /brightness/.test(p.light)))
  // 再渲染一次：点火版的块不重发（云存储的图重设一次会闪）
  const tiles = camp.data.lit
  camp.onShow()
  await settle()
  assert.equal(camp.data.lit, tiles)
  // 火着时再进来：直接亮，不淡入
  const again = await nightCamp(cloud, main)
  assert.ok(again.data.lit)
  assert.equal(again.data.litFade, false)
  // 天亮了：点火版收掉
  again.hour = () => 10
  again.onShow()
  await settle()
  assert.equal(again.data.lit, null)
})
