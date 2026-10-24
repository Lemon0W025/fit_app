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
  assert.equal(gain.beans, 10)
  assert.deepEqual(await repo.getMeal('u1', meal._id), stored)
})

test('analyze：视觉失败但有备注时退回文字分析', async () => {
  const { chat, service, logs } = setup({ results: [new Error('vision down'), analysisJson({ totalKcal: 400 })] })
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
  assert.deepEqual(meal.gain, {
    beans: 10,
    beansToday: 10,
    hint: '再打卡午餐还能得 10 暖豆',
    stamps: [
      { mealType: 'breakfast', label: '早', state: 'green' },
      { mealType: 'lunch', label: '午', state: 'none' },
      { mealType: 'dinner', label: '晚', state: 'none' },
    ],
  })
  const garden = await repo.getGarden('u1')
  assert.deepEqual(garden.days, { [TODAY]: true })
  assert.deepEqual(garden.beans.earned, { [TODAY]: 10 })
})

test('analyze 加餐：不算暖豆', async () => {
  const { repo, service } = setup({ results: [analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'snack', note: '一个苹果' })
  assert.equal(meal.gain, null)
  assert.equal(await repo.getGarden('u1'), null)
})

test('analyze：失败的打卡也算打卡，印章是灰的', async () => {
  const { service } = setup({ results: [new Error('down')] })
  const meal = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'lunch' })
  assert.equal(meal.status, 'failed')
  assert.equal(meal.gain.beans, 10)
  assert.equal(meal.gain.stamps[1].state, 'done')
})

test('reanalyze：评级变绿后暖豆拿满', async () => {
  const { repo, service } = setup({ results: [new Error('down'), analysisJson({ rating: 'green' })] })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'breakfast', status: 'done', analysis: { rating: 'green', totalKcal: 200 }, createdAt: 1 })
  await repo.addMeal({ _openid: 'u1', date: TODAY, mealType: 'lunch', status: 'done', analysis: { rating: 'green', totalKcal: 500 }, createdAt: 2 })
  const failed = await service.analyze('u1', { fileID: 'cloud://a.jpg', mealType: 'dinner' })
  assert.equal(failed.gain.beans, 30)
  assert.equal(failed.gain.beansToday, 50)

  const meal = await service.reanalyze('u1', { mealId: failed._id, note: '清蒸鱼和青菜' })
  assert.equal(meal.gain.beans, 10)
  assert.equal(meal.gain.beansToday, 60)
  assert.equal(meal.gain.hint, '三顿都吃得好，今天的暖豆拿满啦！')
  assert.deepEqual((await repo.getGarden('u1')).beans.earned, { [TODAY]: 60 })
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

const peekingCamp = () => ({ camp: 1, welcomed: true, pets: [], bowls: ['zhusun', null], peeking: ['sunbao', null] })

test('analyze：正餐打卡后，食盆里有竹笋、笋宝在张望 → 笋宝搬来', async () => {
  const { repo, service } = setup({ results: [analysisJson()], garden: peekingCamp() })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭青菜' })
  assert.deepEqual(meal.arrival, { id: 'sunbao', name: '笋宝', foodId: 'zhusun', foodName: '竹笋' })
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
  assert.equal(m.arrival.id, 'sunbao')
})

test('reanalyze 不触发搬家', async () => {
  const { repo, service } = setup({ results: [analysisJson(), analysisJson()] })
  const meal = await service.analyze('u1', { mealType: 'lunch', note: '米饭' })
  repo.state.gardens.set('u1', peekingCamp())
  const again = await service.reanalyze('u1', { mealId: meal._id, note: '米饭半碗' })
  assert.equal(again.arrival, undefined)
  assert.deepEqual((await repo.getGarden('u1')).pets, [])
})
