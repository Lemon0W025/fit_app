const test = require('node:test')
const assert = require('node:assert/strict')
const { createMealService } = require('../cloudfunctions/api/services/meal')
const { createForestService } = require('../cloudfunctions/api/services/forest')
const { createCampService } = require('../cloudfunctions/api/services/camp')
const { createFakeRepo, createFakeChat, PROFILE, NOW, TODAY, CONFIG, analysisJson } = require('./helpers/fake-repo')

function setup({ results = [], config = CONFIG, withProfile = true, imageUrlError = null, deleteError = null, garden: gardenDoc = null } = {}) {
  const repo = createFakeRepo()
  if (withProfile) repo.state.profiles.set('u1', { ...PROFILE })
  if (gardenDoc) repo.state.gardens.set('u1', gardenDoc)
  const chat = createFakeChat(results)
  const deleted = []
  const logs = []
  const service = createMealService({
    repo,
    chat,
    config,
    forest: createForestService({ repo, now: () => NOW }),
    camp: createCampService({ repo, now: () => NOW }),
    getImageUrl: async (fileID) => {
      if (imageUrlError) throw imageUrlError
      return `https://tmp/${fileID}`
    },
    deleteFile: async (fileID) => {
      deleted.push(fileID)
      if (deleteError) throw deleteError
    },
    now: () => NOW,
    log: (...args) => logs.push(args),
  })
  return { repo, chat, service, deleted, logs }
}

function lastUserText(messages) {
  const content = messages[messages.length - 1].content
  return Array.isArray(content) ? content.find((c) => c.type === 'text').text : content
}

test('analyze：有照片时调用视觉模型并保存', async () => {
  const { repo, chat, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch', note: '' })
  assert.equal(meal.status, 'done')
  assert.equal(meal.mode, 'vision')
  assert.equal(meal.analysis.totalKcal, 230)
  assert.equal(meal.date, TODAY)
  assert.equal(meal._openid, 'u1')
  assert.equal(meal.createdAt, NOW.getTime())
  assert.ok(meal._id)
  assert.equal(chat.calls.length, 1)
  assert.equal(chat.calls[0].provider, 'hunyuan-exp')
  assert.equal(chat.calls[0].model, 'vision-model')
  const content = chat.calls[0].messages[1].content
  assert.equal(content.find((c) => c.type === 'image_url').image_url.url, 'https://tmp/cloud://a.jpg')
  // gain 只在响应里给页面做反馈，不存库
  const { gain, arrival, ...stored } = meal
  assert.equal(meal.timing, 'on')
  assert.equal(gain.beans, 20)
  assert.deepEqual(await repo.getMeal('u1', meal._id), stored)
  assert.match(lastUserText(chat.calls[0].messages), /【拍照时间】12:00，准时（午餐饭点 12:00）/)
})

test('analyze：视觉失败但有备注时退回文字分析', async () => {
  const { chat, service, logs } = setup({ results: [new Error('vision down'), analysisJson({ foods: [{ name: '面条', portion: '一碗', kcal: 400 }] })] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner', note: '一碗面' })
  assert.equal(meal.status, 'done')
  assert.equal(meal.mode, 'text')
  assert.equal(meal.analysis.totalKcal, 400)
  assert.equal(chat.calls[1].model, 'text-model')
  assert.equal(typeof chat.calls[1].messages[1].content, 'string')
  assert.match(chat.calls[1].messages[1].content, /一碗面/)
  assert.equal(logs.length, 1)
})

test('analyze：取图片地址失败也会退回文字分析', async () => {
  const { service } = setup({ results: [analysisJson()], imageUrlError: new Error('no url') })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner', note: '一碗面' })
  assert.equal(meal.mode, 'text')
})

test('analyze：AI 返回无法解析时视为失败并尝试文字分析', async () => {
  const { service } = setup({ results: ['看不清', analysisJson()] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner', note: '一碗面' })
  assert.equal(meal.mode, 'text')
})

test('analyze：视觉失败且没有备注时保存为 failed 并提示补充描述', async () => {
  const { repo, service } = setup({ results: [new Error('vision down')] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch' })
  assert.equal(meal.status, 'failed')
  assert.equal(meal.analysis, null)
  assert.match(meal.error, /描述/)
  assert.equal((await repo.listMeals('u1', TODAY)).length, 1)
})

test('analyze：有备注但 AI 全部失败时提示稍后重新分析', async () => {
  const { service } = setup({ results: [new Error('x'), new Error('y')] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch', note: '面条' })
  assert.equal(meal.status, 'failed')
  assert.match(meal.error, /重新分析/)
})

test('analyze：没配视觉模型时直接用文字分析', async () => {
  const { chat, service } = setup({ results: [analysisJson()], config: { ...CONFIG, visionModel: '' } })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch', note: '面条' })
  assert.equal(meal.mode, 'text')
  assert.equal(chat.calls.length, 1)
})

test('analyze：只写文字不拍照', async () => {
  const { chat, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'breakfast', note: '豆浆油条' })
  assert.equal(meal.mode, 'text')
  assert.equal(meal.fileID, '')
  assert.equal(chat.calls[0].model, 'text-model')
})

test('analyze：既没照片也没备注时 BAD_REQUEST', async () => {
  const { service } = setup()
  await assert.rejects(service.analyze('u1', { mealType: 'lunch', note: '  ' }), { code: 'BAD_REQUEST' })
})

test('analyze：餐次不合法时 BAD_REQUEST', async () => {
  const { service } = setup()
  await assert.rejects(service.analyze('u1', { mealType: 'tea', note: '面' }), { code: 'BAD_REQUEST' })
  await assert.rejects(service.analyze('u1', undefined), { code: 'BAD_REQUEST' })
})

test('analyze：没有档案时 NO_PROFILE', async () => {
  const { service } = setup({ withProfile: false })
  await assert.rejects(service.analyze('u1', { mealType: 'lunch', note: '面' }), { code: 'NO_PROFILE' })
})

test('analyze：已摄入只算当天分析成功的餐', async () => {
  const { repo, chat, service } = setup({ results: [analysisJson()] })
  await repo.addMeal({ _openid: 'u1', date: TODAY, status: 'done', analysis: { totalKcal: 300 }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, status: 'failed', analysis: null, createdAt: 2 })
  await repo.addMeal({ _openid: 'u1', date: '2026-10-21', status: 'done', analysis: { totalKcal: 999 }, createdAt: 3 })
  await repo.addMeal({ _openid: 'u2', date: TODAY, status: 'done', analysis: { totalKcal: 888 }, createdAt: 4 })
  await service.analyze('u1', { mealType: 'dinner', note: '面' })
  assert.match(lastUserText(chat.calls[0].messages), /已吃 300 千卡/)
})

test('analyze：备注截断 200 字', async () => {
  const { service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'dinner', note: '面'.repeat(300) })
  assert.equal(meal.note.length, 200)
})

test('reanalyze：补充备注后重新分析失败的打卡', async () => {
  const { repo, chat, service } = setup({ results: [new Error('vision down'), new Error('vision down'), analysisJson({ totalKcal: 500 })] })
  const failed = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch' })
  assert.equal(failed.status, 'failed')
  const meal = await service.reanalyze('u1', { mealId: failed._id, note: '红烧肉盖饭' })
  assert.equal(meal.status, 'done')
  assert.equal(meal.mode, 'text')
  assert.equal(meal.note, '红烧肉盖饭')
  assert.equal(meal.error, '')
  assert.equal(chat.calls.length, 3)
  const { gain, arrival, ...stored } = meal
  assert.deepEqual(await repo.getMeal('u1', failed._id), stored)
})

test('reanalyze：不把这一餐自己算进已摄入', async () => {
  const { repo, chat, service } = setup({ results: [analysisJson()] })
  const id = await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', fileID: '', note: '面', status: 'done', mode: 'text', analysis: { totalKcal: 600 }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'breakfast', status: 'done', analysis: { totalKcal: 200 }, createdAt: 0 })
  await service.reanalyze('u1', { mealId: id })
  assert.match(lastUserText(chat.calls[0].messages), /已吃 200 千卡/)
})

test('reanalyze：原本成功的打卡重新分析失败时保留原结果并报错', async () => {
  const { repo, service } = setup({ results: [new Error('down')] })
  const id = await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', fileID: '', note: '面', status: 'done', mode: 'text', analysis: { totalKcal: 600 }, createdAt: 1 })
  await assert.rejects(service.reanalyze('u1', { mealId: id }), { code: 'AI_FAILED' })
  assert.equal((await repo.getMeal('u1', id)).analysis.totalKcal, 600)
})

test('reanalyze / get / remove：别人的打卡 NOT_FOUND', async () => {
  const { repo, service } = setup()
  const id = await repo.addMeal({ _openid: 'u2', date: TODAY, mealType: 'lunch', note: '面', status: 'done', createdAt: 1 })
  await assert.rejects(service.reanalyze('u1', { mealId: id }), { code: 'NOT_FOUND' })
  await assert.rejects(service.get('u1', { mealId: id }), { code: 'NOT_FOUND' })
  await assert.rejects(service.remove('u1', { mealId: id }), { code: 'NOT_FOUND' })
  await assert.rejects(service.get('u1', {}), { code: 'BAD_REQUEST' })
})

test('get：返回自己的打卡', async () => {
  const { repo, service } = setup()
  const id = await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', note: '面', status: 'done', createdAt: 1 })
  assert.equal((await service.get('u1', { mealId: id }))._id, id)
})

test('remove：删除记录和图片，删图失败不影响结果', async () => {
  const { repo, service, deleted, logs } = setup({ deleteError: new Error('storage down') })
  const id = await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', fileID: 'cloud://a.jpg', status: 'done', createdAt: 1 })
  assert.deepEqual(await service.remove('u1', { mealId: id }), { removed: true })
  assert.equal(await repo.getMeal('u1', id), null)
  assert.deepEqual(deleted, ['cloud://a.jpg'])
  assert.equal(logs.length, 1)
})

test('remove：没有图片时不调用删图', async () => {
  const { repo, service, deleted } = setup()
  const id = await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', fileID: '', status: 'done', createdAt: 1 })
  await service.remove('u1', { mealId: id })
  assert.deepEqual(deleted, [])
})

test('analyze 正餐：返回这次多得的暖豆和今天的印章，并记下当天暖豆', async () => {
  const { repo, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'breakfast', note: '小米粥' })
  assert.equal(meal.timing, 'late')
  assert.deepEqual(meal.gain, {
    beans: 10,
    beansToday: 10,
    hint: '午饭 11:00～13:00 拍算准时，能得 15 暖豆',
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green', onTime: false },
      { mealType: 'lunch', label: '午', state: 'none', onTime: false },
      { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
    ],
    mealType: 'breakfast',
    timing: 'late',
    allOnTime: false,
    milestone: null,
  })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 10 })
})

test('analyze 加餐：不算暖豆', async () => {
  const { repo, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'snack', note: '一个苹果' })
  assert.equal(meal.gain, null)
  assert.equal(meal.timing, null)
  assert.equal(await repo.getGarden('u1'), null)
})

test('analyze：失败的打卡也算打卡，印章是灰的', async () => {
  const { service } = setup({ results: [new Error('down')] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch' })
  assert.equal(meal.status, 'failed')
  assert.equal(meal.gain.beans, 15)
  assert.equal(meal.gain.stamps[1].state, 'done')
  assert.equal(meal.gain.stamps[1].onTime, true)
})

test('reanalyze：评级变绿后多 5 暖豆', async () => {
  const { repo, service } = setup({ results: [new Error('down'), analysisJson({ rating: 'green' })] })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'breakfast', status: 'done', analysis: { rating: 'green', totalKcal: 200 }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', status: 'done', analysis: { rating: 'green', totalKcal: 500 }, createdAt: 2 })
  const failed = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner' })
  assert.equal(failed.gain.beans, 5)
  assert.equal(failed.gain.beansToday, 25)

  const meal = await service.reanalyze('u1', { mealId: failed._id, note: '清蒸鱼和青菜' })
  assert.equal(meal.timing, 'early')
  assert.equal(meal.gain.beans, 5)
  assert.equal(meal.gain.beansToday, 30)
  assert.equal(meal.gain.hint, '三顿都拍完啦！明天按饭点拍，暖豆更多')
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 30 })
})

test('remove：删掉当天唯一的正餐后，这天不再算种了树', async () => {
  const { repo, service } = setup({ results: [analysisJson(), analysisJson()] })
  const lunch = await service.analyze('u1', { mealType: 'lunch', note: '面' })
  await service.analyze('u1', { mealType: 'snack', note: '苹果' })
  await service.remove('u1', { mealId: lunch._id })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, {})
  assert.deepEqual(garden.beans.earned, {})
})

const peekingCamp = () => ({ camp: 4, welcomed: true, pets: [], pot: { date: TODAY, foods: ['zhusun'] }, visitors: [{ id: 'sunbao', foodId: 'zhusun', since: TODAY }] })

test('analyze：正餐打卡后，闻着锅里竹笋来的笋宝住下', async () => {
  const { repo, service } = setup({ results: [analysisJson()], garden: peekingCamp() })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭青菜' })
  assert.deepEqual(meal.arrival, { pets: [{ id: 'sunbao', name: '笋宝', foodId: 'zhusun', foodName: '竹笋' }] })
  assert.equal(repo.state.meals.find((m) => m._id === meal._id).arrival, undefined)
  assert.deepEqual((await repo.getGarden('u1')).pets.map((p) => p.id), ['sunbao'])
})

test('analyze：加餐不搬家；AI 失败的正餐照样搬', async () => {
  const snack = setup({ results: [analysisJson()], garden: peekingCamp() })
  const s = await snack.service.analyze('u1', { mealType: 'snack', note: '苹果' })
  assert.equal(s.arrival, null)
  assert.deepEqual((await snack.repo.getGarden('u1')).pets, [])
  const failed = setup({ results: [new Error('down'), new Error('down')], garden: peekingCamp() })
  const m = await failed.service.analyze('u1', { mealType: 'dinner', note: '面条' })
  assert.equal(m.status, 'failed')
  assert.equal(m.arrival.pets[0].id, 'sunbao')
})

test('reanalyze 不触发搬家', async () => {
  const { repo, service } = setup({ results: [analysisJson(), analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭' })
  repo.state.gardens.set('u1', peekingCamp())
  const again = await service.reanalyze('u1', { mealId: meal._id, note: '米饭半碗' })
  assert.equal(again.arrival, undefined)
  assert.deepEqual((await repo.getGarden('u1')).pets, [])
})

test('analyze 正餐：这顿让连续打卡到 3 天，gain 带 milestone；重新分析不带', async () => {
  const { addDays } = require('../cloudfunctions/api/lib/shared/date')
  const { service } = setup({
    results: [analysisJson(), analysisJson()],
    garden: { camp: 1, days: { [addDays(TODAY, -2)]: true, [addDays(TODAY, -1)]: true } },
  })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭' })
  assert.deepEqual(meal.gain.milestone, { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' })
  const again = await service.reanalyze('u1', { mealId: meal._id, note: '米饭半碗' })
  assert.equal(again.gain.milestone, null)
})

// ---------------------------------------------------------------- 改份量（meal.adjust）

// 米饭 150 克 174 千卡 + 红烧肉 100 克 400 千卡，每道菜都有营养素
const GRAMS_MEAL = {
  foods: [
    { name: '米饭', portion: '一碗', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
    { name: '红烧肉', portion: '六块', grams: 100, kcal: 400, protein: 12, carbs: 6, fat: 36 },
  ],
}

async function gramsMeal(results = [analysisJson(GRAMS_MEAL)], mealType = 'lunch') {
  const ctx = setup({ results })
  const meal = await ctx.service.analyze('u1', { fileID: 'cloud://a.jpg', mealType, note: '' })
  return { ...ctx, meal }
}

test('analyze：按菜加总的热量和营养素存下来', async () => {
  const { meal } = await gramsMeal()
  assert.equal(meal.analysis.totalKcal, 574)
  assert.deepEqual([meal.analysis.protein, meal.analysis.carbs, meal.analysis.fat], [15.9, 44.9, 36.5])
  assert.equal(meal.analysis.foods[0].grams, 150)
})

test('adjust：按克数改一道菜，热量和营养素按比例缩放、总数重算，存下 AI 原来的，评级点评不变', async () => {
  const { repo, service, meal } = await gramsMeal()
  const out = await service.adjust('u1', { mealId: meal._id, index: 0, grams: 75 })
  const a = out.analysis
  assert.deepEqual(a.foods[0], { name: '米饭', portion: '一碗', grams: 75, kcal: 87, protein: 2, carbs: 19.5, fat: 0.3, adjusted: true })
  assert.deepEqual(a.foods[1], GRAMS_MEAL.foods[1])
  assert.equal(a.totalKcal, 487)
  assert.deepEqual([a.protein, a.carbs, a.fat], [14, 25.5, 36.3])
  assert.equal(a.adjusted, true)
  assert.equal(a.aiTotalKcal, 574)
  assert.deepEqual(a.aiFoods, meal.analysis.foods)
  assert.equal(a.rating, meal.analysis.rating)
  assert.equal(a.comment, meal.analysis.comment)
  assert.deepEqual((await repo.getMeal('u1', meal._id)).analysis, a)

  // 再改一次：AI 原来的还是第一次的
  const again = await service.adjust('u1', { mealId: meal._id, index: 1, factor: 0.5 })
  assert.equal(again.analysis.foods[1].grams, 50)
  assert.equal(again.analysis.foods[1].kcal, 200)
  assert.equal(again.analysis.totalKcal, 287)
  assert.equal(again.analysis.aiTotalKcal, 574)
  assert.deepEqual(again.analysis.aiFoods, meal.analysis.foods)
})

test('adjust：删掉一道菜，总数减掉它；只剩一道时不能删', async () => {
  const { service, meal } = await gramsMeal()
  const out = await service.adjust('u1', { mealId: meal._id, index: 1, remove: true })
  assert.deepEqual(out.analysis.foods.map((f) => f.name), ['米饭'])
  assert.equal(out.analysis.totalKcal, 174)
  assert.deepEqual([out.analysis.protein, out.analysis.carbs, out.analysis.fat], [3.9, 38.9, 0.5])
  await assert.rejects(service.adjust('u1', { mealId: meal._id, index: 0, remove: true }), { code: 'BAD_REQUEST', message: /删掉整条打卡/ })
})

test('adjust：不改暖豆、不调 AI', async () => {
  const { repo, chat, service, meal } = await gramsMeal()
  const before = await repo.getGarden('u1')
  await service.adjust('u1', { mealId: meal._id, index: 0, grams: 300 })
  assert.equal(chat.calls.length, 1)
  assert.deepEqual(await repo.getGarden('u1'), before)
})

test('adjust：老打卡没有克数和每道菜的营养素，只能按比例改或删，总营养素按总热量的比例缩放', async () => {
  const { repo, service, meal } = await gramsMeal([analysisJson({
    foods: [{ name: '米饭', portion: '一碗', kcal: 200 }, { name: '炒菜', portion: '一盘', kcal: 300 }],
    totalKcal: 520, protein: 20, carbs: 60, fat: 20,
  })])
  // parse 现在按菜加总；模拟以前存下的老打卡（总数是 AI 给的，不等于菜之和）
  const old = { ...meal.analysis, totalKcal: 520, protein: 20, carbs: 60, fat: 20, foods: meal.analysis.foods.map(({ grams, ...f }) => f) }
  await repo.updateMeal(meal._id, { analysis: old })
  await assert.rejects(service.adjust('u1', { mealId: meal._id, index: 0, grams: 100 }), { code: 'BAD_REQUEST', message: /按比例/ })
  const out = await service.adjust('u1', { mealId: meal._id, index: 0, factor: 0.5 })
  assert.deepEqual(out.analysis.foods[0], { name: '米饭', portion: '一碗', kcal: 100, adjusted: true })
  // 总数按这道菜的变化量减：520 - 100（别的菜的那部分不动）
  assert.equal(out.analysis.totalKcal, 420)
  assert.deepEqual([out.analysis.protein, out.analysis.carbs, out.analysis.fat], [16.2, 48.5, 16.2])
})

test('adjust：参数不对 BAD_REQUEST；没分析好、不是食物、别人的打卡都不能改', async () => {
  const { service, meal } = await gramsMeal()
  const bad = [
    { mealId: meal._id, index: 2, grams: 100 },
    { mealId: meal._id, index: -1, grams: 100 },
    { mealId: meal._id, index: '0', grams: 100 },
    { mealId: meal._id, index: 0, grams: 0 },
    { mealId: meal._id, index: 0, grams: 3001 },
    { mealId: meal._id, index: 0, grams: 'abc' },
    { mealId: meal._id, index: 0, factor: 0 },
    { mealId: meal._id, index: 0, factor: 6 },
    { mealId: meal._id, index: 0 },
  ]
  for (const input of bad) await assert.rejects(service.adjust('u1', input), { code: 'BAD_REQUEST' }, JSON.stringify(input))
  await assert.rejects(service.adjust('u2', { mealId: meal._id, index: 0, grams: 100 }), { code: 'NOT_FOUND' })

  const failed = await gramsMeal([new Error('down')])
  await assert.rejects(failed.service.adjust('u1', { mealId: failed.meal._id, index: 0, grams: 100 }), { code: 'BAD_REQUEST', message: /还没算好/ })
  const cat = await gramsMeal([JSON.stringify({ isFood: false, comment: '一只猫' })])
  await assert.rejects(cat.service.adjust('u1', { mealId: cat.meal._id, index: 0, grams: 100 }), { code: 'BAD_REQUEST' })
})

test('adjust：改了克数就记进她家常用份量（同名覆盖、留最近 12 样），删掉不记；下次分析写进提示词', async () => {
  const { repo, chat, service, meal } = await gramsMeal([analysisJson(GRAMS_MEAL), analysisJson(GRAMS_MEAL)])
  await service.adjust('u1', { mealId: meal._id, index: 0, grams: 110 })
  await service.adjust('u1', { mealId: meal._id, index: 1, remove: true })
  assert.deepEqual(Object.keys(await repo.getPortions('u1')), ['米饭'])
  assert.equal((await repo.getPortions('u1'))['米饭'].grams, 110)

  await service.analyze('u1', { fileID: 'cloud://b.jpg', mealType: 'dinner', note: '' })
  assert.match(lastUserText(chat.calls[1].messages), /【她家常用份量】她自己改过的：米饭一般吃约 110 克/)

  const items = {}
  for (let i = 0; i < 14; i++) items[`菜${i}`] = { grams: 100, at: i }
  await repo.savePortions('u1', items)
  await service.adjust('u1', { mealId: meal._id, index: 0, grams: 120 })
  const kept = await repo.getPortions('u1')
  assert.equal(Object.keys(kept).length, 12)
  assert.equal(kept['米饭'].grams, 120)
  assert.equal(kept['菜0'], undefined)
  assert.equal(kept['菜1'], undefined)
  assert.equal(kept['菜2'], undefined)
  assert.ok(kept['菜13'])
})

test('analyze：读常用份量失败不影响打卡', async () => {
  const ctx = setup({ results: [analysisJson(GRAMS_MEAL)] })
  ctx.repo.getPortions = async () => {
    throw new Error('db down')
  }
  const meal = await ctx.service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch', note: '' })
  assert.equal(meal.status, 'done')
})

// ---------------------------------------------------------------- 几个人一起吃（meal.share）

const HOTPOT = {
  foods: [
    { name: '米饭', portion: '一碗', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5, shared: false },
    { name: '火锅', portion: '一锅', grams: 1500, kcal: 1500, protein: 90, carbs: 30, fat: 100, shared: true },
    { name: '青菜', portion: '一盘', grams: 300, kcal: 150, protein: 6, carbs: 12, fat: 9 },
  ],
}

test('analyze：带上几个人一起吃（存在打卡上、写进提示词），不对的人数当一个人；每道菜的 shared 存下', async () => {
  const { chat, service } = setup({ results: [analysisJson(HOTPOT), analysisJson(HOTPOT)] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner', note: '', people: 5 })
  assert.equal(meal.people, 5)
  assert.match(lastUserText(chat.calls[0].messages), /【几个人一起吃】5 个人/)
  assert.equal(meal.analysis.foods[0].shared, false)
  assert.equal(meal.analysis.foods[1].shared, true)
  assert.equal('shared' in meal.analysis.foods[2], false)
  const odd = await service.analyze('u1', { fileID: 'cloud://b.jpg', mealType: 'snack', note: '', people: 99 })
  assert.equal(odd.people, 1)
  assert.doesNotMatch(lastUserText(chat.calls[1].messages), /几个人一起吃/)
})

test('share：改成 5 个人，大家夹的菜（没标的也算）按 1/5 算、自己那碗饭不动；再改成 4 个人按 5/4；总数跟着变，存下 AI 原来的', async () => {
  const { repo, service, meal } = await gramsMeal([analysisJson(HOTPOT)])
  assert.equal(meal.analysis.totalKcal, 1824)
  const five = await service.share('u1', { mealId: meal._id, people: 5 })
  assert.equal(five.people, 5)
  const f = five.analysis.foods
  assert.deepEqual([f[0].grams, f[0].kcal], [150, 174])
  assert.deepEqual([f[1].grams, f[1].kcal, f[1].fat], [300, 300, 20])
  assert.deepEqual([f[2].grams, f[2].kcal], [60, 30])
  assert.equal(five.analysis.totalKcal, 504)
  assert.equal(five.analysis.aiTotalKcal, 1824)
  assert.equal(five.analysis.adjusted, true)
  assert.equal(f[1].adjusted, undefined, '按人数分的不算她单独改过')
  assert.deepEqual((await repo.getMeal('u1', meal._id)).people, 5)
  const four = await service.share('u1', { mealId: meal._id, people: 4 })
  assert.deepEqual([four.analysis.foods[1].grams, four.analysis.foods[1].kcal], [375, 375])
  assert.equal(four.analysis.totalKcal, 174 + 375 + 38)
  assert.equal(four.analysis.aiTotalKcal, 1824)
  // 同样的人数：不变
  const same = await service.share('u1', { mealId: meal._id, people: 4 })
  assert.equal(same.analysis.totalKcal, four.analysis.totalKcal)
  // 改回一个人：回到原来的
  const one = await service.share('u1', { mealId: meal._id, people: 1 })
  assert.equal(one.analysis.totalKcal, 1824)
})

test('share：她单独改过的份量按比例留着；人数不对 BAD_REQUEST；没算好的不能改', async () => {
  const { service, meal } = await gramsMeal([analysisJson(HOTPOT)])
  await service.adjust('u1', { mealId: meal._id, index: 1, grams: 1000 })
  const two = await service.share('u1', { mealId: meal._id, people: 2 })
  assert.equal(two.analysis.foods[1].grams, 500)
  assert.equal(two.analysis.foods[1].adjusted, true)
  for (const people of [0, 21, 2.5, '3', undefined]) {
    await assert.rejects(service.share('u1', { mealId: meal._id, people }), { code: 'BAD_REQUEST' }, String(people))
  }
  const failed = await gramsMeal([new Error('down')])
  await assert.rejects(failed.service.share('u1', { mealId: failed.meal._id, people: 3 }), { code: 'BAD_REQUEST' })
})
