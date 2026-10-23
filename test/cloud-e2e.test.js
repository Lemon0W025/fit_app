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

test('养生森林：三顿全绿结果、森林月视图、切换未解锁树种、删除后回退', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green, green] })
  const { main } = loadCloudFunction(cloud)
  const today = dateKey()
  await main({ action: 'profile.save', data: profileInput })

  const stages = []
  const ids = []
  for (const mealType of ['breakfast', 'lunch', 'dinner']) {
    const res = await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
    assert.equal(res.ok, true, res.message)
    stages.push(res.data.tree.after)
    ids.push(res.data._id)
  }
  assert.deepEqual(stages, ['sprout', 'small', 'fruit'])

  const garden = cloud.db.collections.get('gardens').get('u1')
  assert.equal(garden._openid, 'u1')
  assert.deepEqual(garden.days, { [today]: 'apple' })

  const forest = await main({ action: 'forest.get' })
  assert.equal(forest.ok, true, forest.message)
  assert.equal(forest.data.today.stage, 'fruit')
  assert.equal(forest.data.today.streak, 1)
  assert.equal(forest.data.days.find((d) => d.date === today).stage, 'fruit')
  assert.deepEqual(forest.data.stats, { trees: 1, fruits: 1 })

  const day = await main({ action: 'day.get' })
  assert.equal(day.data.tree.stage, 'fruit')

  const locked = await main({ action: 'forest.setSpecies', data: { species: 'peach' } })
  assert.equal(locked.code, 'BAD_REQUEST')

  for (const mealId of ids) await main({ action: 'meal.delete', data: { mealId } })
  assert.deepEqual(cloud.db.collections.get('gardens').get('u1').days, {})
  assert.equal((await main({ action: 'forest.get' })).data.today.streak, 0)
})
