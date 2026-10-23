// 端到端：真实的 index.js + repo.js + services，配假的 wx-server-sdk
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { dateKey } = require('../cloudfunctions/api/lib/shared/date')
const { analysisJson } = require('./helpers/fake-repo')
const config = require('../cloudfunctions/api/config')

const profileInput = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }

test('完整流程：建档 → 打卡 → 重新分析 → 记体重 → 总结 → 删除', async () => {
  const cloud = createFakeCloud({
    replies: [
      analysisJson({ foods: [{ name: '米饭', kcal: 230 }, { name: '红烧肉', kcal: 400 }], totalKcal: 630 }),
      // 重新分析时看图在主分组和备用分组都失败，退回文字估算
      new Error('vision down'),
      new Error('vision down'),
      analysisJson({ foods: [{ name: '面条', kcal: 450 }], totalKcal: 450 }),
      '今天整体不错，明天早餐加个鸡蛋。',
    ],
  })
  const { main } = loadCloudFunction(cloud)
  const today = dateKey()

  // 首次使用：集合还不存在，也能正常返回
  assert.deepEqual(await main({ action: 'profile.get' }), { ok: true, data: null })

  const saved = await main({ action: 'profile.save', data: profileInput })
  assert.equal(saved.ok, true)
  assert.equal(saved.data.dailyKcal, 1270)
  assert.equal(cloud.db.collections.get('users').get('u1')._openid, 'u1')

  const analyzed = await main({ action: 'meal.analyze', data: { fileID: 'cloud://env/meals/a.jpg', mealType: 'lunch' } })
  assert.equal(analyzed.ok, true, analyzed.message)
  assert.equal(analyzed.data.status, 'done')
  assert.equal(analyzed.data.analysis.totalKcal, 630)
  assert.equal(cloud.aiCalls[0].provider, config.provider)
  assert.equal(cloud.aiCalls[0].model, config.visionModel)
  const image = cloud.aiCalls[0].messages[1].content.find((c) => c.type === 'image_url')
  assert.equal(image.image_url.url, 'https://tmp/cloud://env/meals/a.jpg')

  const mealId = analyzed.data._id
  const fetched = await main({ action: 'meal.get', data: { mealId } })
  assert.equal(fetched.data._id, mealId)

  // 视觉失败 → 按补充的描述重新估算，analysis 整体替换
  const re = await main({ action: 'meal.reanalyze', data: { mealId, note: '其实是一碗面条' } })
  assert.equal(re.ok, true, re.message)
  assert.equal(re.data.mode, 'text')
  // 视觉失败时 ai.js 会先试备用分组，再退回文字模型
  assert.equal(cloud.aiCalls[cloud.aiCalls.length - 1].model, config.textModel)
  const stored = cloud.db.collections.get('meals').get(mealId)
  assert.deepEqual(stored.analysis.foods, [{ name: '面条', portion: '', kcal: 450 }])
  assert.equal(stored.note, '其实是一碗面条')

  const day = await main({ action: 'day.get' })
  assert.equal(day.data.date, today)
  assert.equal(day.data.meals.length, 1)
  assert.equal(day.data.totals.kcal, 450)
  assert.equal(day.data.remainingKcal, 820)

  // 档案是从库里读出来的（带 _id），再 set 回去不能报错
  const weight = await main({ action: 'weight.save', data: { weightKg: 69.5 } })
  assert.equal(weight.ok, true, weight.message)
  const weights = await main({ action: 'weight.list' })
  assert.deepEqual(weights.data, { items: [{ date: today, weightKg: 69.5 }], targetWeightKg: 60 })
  assert.equal((await main({ action: 'profile.get' })).data.weightKg, 69.5)

  const summary = await main({ action: 'summary.generate' })
  assert.equal(summary.ok, true, summary.message)
  assert.equal(summary.data.text, '今天整体不错，明天早餐加个鸡蛋。')
  assert.equal((await main({ action: 'day.get' })).data.summary.text, summary.data.text)

  const removed = await main({ action: 'meal.delete', data: { mealId } })
  assert.deepEqual(removed, { ok: true, data: { removed: true } })
  assert.deepEqual(cloud.deletedFiles, ['cloud://env/meals/a.jpg'])
  assert.equal((await main({ action: 'day.get' })).data.meals.length, 0)
})

test('不同用户的数据互相隔离', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson()] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  const meal = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭' } })

  cloud.setOpenid('u2')
  assert.equal((await main({ action: 'profile.get' })).data, null)
  assert.equal((await main({ action: 'day.get' })).data.meals.length, 0)
  assert.equal((await main({ action: 'meal.get', data: { mealId: meal.data._id } })).code, 'NOT_FOUND')
})

test('没有 openid 与未知 action', async () => {
  const cloud = createFakeCloud({ openid: '' })
  const { main } = loadCloudFunction(cloud)
  assert.equal((await main({ action: 'day.get' })).code, 'NO_OPENID')
  cloud.setOpenid('u1')
  assert.equal((await main({ action: 'nope' })).code, 'UNKNOWN_ACTION')
})

test('每日暖豆：三顿全绿拿满、日历印章、删除后回退', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green, green] })
  const { main } = loadCloudFunction(cloud)
  const today = dateKey()
  await main({ action: 'profile.save', data: profileInput })

  const beans = []
  const ids = []
  for (const mealType of ['breakfast', 'lunch', 'dinner']) {
    const res = await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
    assert.equal(res.ok, true, res.message)
    beans.push(res.data.gain.beans)
    ids.push(res.data._id)
  }
  assert.deepEqual(beans, [10, 10, 40])

  const garden = cloud.db.collections.get('gardens').get('u1')
  assert.equal(garden._openid, 'u1')
  assert.deepEqual(garden.days, { [today]: true })
  assert.deepEqual(garden.beans.earned, { [today]: 60 })

  const forest = await main({ action: 'forest.get' })
  assert.equal(forest.ok, true, forest.message)
  assert.equal(forest.data.today.beansToday, 60)
  assert.equal(forest.data.today.streak, 1)
  assert.equal(forest.data.today.beans, 60)
  assert.equal(forest.data.days.find((d) => d.date === today).beans, 60)
  assert.deepEqual(forest.data.stats, { days: 1, beans: 60 })

  const day = await main({ action: 'day.get' })
  assert.equal(day.data.daily.beansToday, 60)
  assert.deepEqual(day.data.daily.stamps.map((s) => s.state), ['green', 'green', 'green'])

  assert.equal((await main({ action: 'forest.setSpecies', data: { species: 'peach' } })).code, 'UNKNOWN_ACTION')

  for (const mealId of ids) await main({ action: 'meal.delete', data: { mealId } })
  const after = cloud.db.collections.get('gardens').get('u1')
  assert.deepEqual(after.days, {})
  assert.deepEqual(after.beans.earned, {})
  assert.equal((await main({ action: 'forest.get' })).data.today.streak, 0)
})

test('养生庭院：打卡赚豆 → 新手礼 → 扭蛋 → 摆放 → 移动 → 收回', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' }), analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  const first = await main({ action: 'garden.get' })
  assert.equal(first.ok, true, first.message)
  assert.deepEqual(first.data.welcome, { beans: 60, itemId: 'starter_tree' })
  assert.equal(first.data.beans, 80)

  const spin = await main({ action: 'garden.spin' })
  assert.equal(spin.ok, true, spin.message)
  assert.equal(spin.data.beans, 50)
  assert.equal(spin.data.isNew, true)
  const itemId = spin.data.itemId

  const placed = await main({ action: 'garden.place', data: { itemId, c: 6, r: 6 } })
  assert.equal(placed.ok, true, placed.message)
  const uid = placed.data.placed.find((p) => p.itemId === itemId).uid
  assert.deepEqual(placed.data.inventory, [])

  const blocked = await main({ action: 'garden.move', data: { uid, c: 8, r: 8 } })
  assert.equal(blocked.code, 'BAD_REQUEST')
  const moved = await main({ action: 'garden.move', data: { uid, c: 11, r: 11 } })
  assert.deepEqual(moved.data.placed.find((p) => p.uid === uid), { uid, itemId, c: 11, r: 11 })

  const stashed = await main({ action: 'garden.stash', data: { uid } })
  assert.deepEqual(stashed.data.inventory, [{ itemId, count: 1 }])

  await main({ action: 'garden.spin' })
  const broke = await main({ action: 'garden.spin' })
  assert.equal(broke.code, 'NO_BEANS')

  const stored = cloud.db.collections.get('gardens').get('u1')
  assert.equal(stored.beans.spent, 60)
  assert.deepEqual(stored.beans.earned, { [dateKey()]: 20 })
})

test('庭院小动物：摆翠竹 → 打卡午餐 → 熊猫搬来 → 庭院看到一次', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 6, r: 6 }) })

  const waiting = await main({ action: 'garden.get' })
  assert.deepEqual(waiting.data.waiting, ['panda'])

  const meal = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭青菜' } })
  assert.equal(meal.ok, true, meal.message)
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫' })

  const first = await main({ action: 'garden.get', data: { markSeen: true } })
  assert.deepEqual(first.data.residents, ['panda'])
  assert.deepEqual(first.data.arrivals, ['panda'])
  assert.deepEqual(first.data.waiting, [])
  const second = await main({ action: 'garden.get', data: { markSeen: true } })
  assert.deepEqual(second.data.arrivals, [])
  assert.deepEqual(cloud.db.collections.get('gardens').get('u1').residents.map((r) => r.id), ['panda'])
})

test('开荒：豆不够提示、开垦后能往新地上摆', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  await main({ action: 'garden.get' })
  const poor = await main({ action: 'garden.expand', data: { plot: '1,0' } })
  assert.equal(poor.code, 'NO_BEANS')

  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: 500 }, inventory: { daisy: 1 } })
  const opened = await main({ action: 'garden.expand', data: { plot: '1,0' } })
  assert.equal(opened.ok, true, opened.message)
  assert.deepEqual(opened.data.plots, ['1,1', '1,0'])
  assert.equal(opened.data.expandCost, 150)
  const placed = await main({ action: 'garden.place', data: { itemId: 'daisy', c: 8, r: 2 } })
  assert.equal(placed.ok, true, placed.message)
})

test('测试福利：按 config.testGrant 送一次暖豆', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  config.testGrant = { id: 'e2e', beans: 300, until: '2999-12-31' }
  try {
    const first = await main({ action: 'garden.get' })
    assert.equal(first.data.testGift, 300)
    assert.equal(first.data.beans, 360)
    assert.equal((await main({ action: 'garden.get' })).data.testGift, 0)
  } finally {
    config.testGrant = null
  }
})
