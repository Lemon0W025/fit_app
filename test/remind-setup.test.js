// test/remind-setup.test.js：一键开通微信提醒（自己找订阅消息模板）、点通知打开她在用的版本、首页拍照顺手攒「允许」
const test = require('node:test')
const assert = require('node:assert/strict')
const { setupTemplate, rolesOf, wordsOfContent } = require('../cloudfunctions/api/lib/remind-template')
const { createRemindService } = require('../cloudfunctions/api/services/remind')
const { createFakeRepo, PROFILE, analysisJson } = require('./helpers/fake-repo')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle, event, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')

// 假的订阅消息接口：mine 是「我的模板」，pub 是公共模板库 { tid: { title, words } }
function fakeApi({ mine = [], pub = {}, categories = [{ id: 616 }], refuse = {} } = {}) {
  const calls = { added: [], searched: [] }
  const list = mine.slice()
  return {
    calls,
    async getTemplateList() {
      return { data: list }
    },
    async getCategory() {
      return { data: categories }
    },
    async getPubTemplateTitleList({ keyword }) {
      calls.searched.push(keyword)
      return { data: Object.entries(pub).filter(([, t]) => t.title.indexOf(keyword) !== -1 || keyword === '提醒').map(([tid, t]) => ({ tid: Number(tid), title: t.title, type: t.type || 2 })) }
    },
    async getPubTemplateKeyWordsById({ tid }) {
      return { data: pub[tid].words }
    },
    async addTemplate({ tid, kidList }) {
      calls.added.push({ tid, kidList })
      // 真接口：新版模板（tid 10000001 起）kidList 只能是空数组、关键词全带上；老模板要 2～5 个数字；refuse[tid] 模拟某个模板加不上
      const fresh = Number(tid) >= 10000001 && Number(tid) < 20000000
      const badKids = !Array.isArray(kidList) || (fresh ? kidList.length !== 0 : kidList.length < 2 || kidList.length > 5 || kidList.some((k) => typeof k !== 'number'))
      if (badKids || (refuse[tid] && refuse[tid](kidList))) {
        const e = new Error('invalid kidList')
        e.errCode = 200020
        throw e
      }
      const t = pub[tid]
      const content = (fresh ? t.words.map((w) => w.kid) : kidList).map((kid) => {
        const w = t.words.find((x) => x.kid === kid)
        return `${w.name}:{{${w.rule}${kid}.DATA}}`
      }).join('\n')
      list.push({ priTmplId: `p-${tid}`, title: t.title, type: 2, content })
      return { priTmplId: `p-${tid}` }
    },
  }
}

const MEAL = {
  title: '用餐提醒',
  words: [{ kid: 1, name: '用餐时间', rule: 'time' }, { kid: 2, name: '提醒内容', rule: 'thing' }, { kid: 3, name: '温馨提示', rule: 'thing' }, { kid: 4, name: '人数', rule: 'number' }],
}
const TODO = { title: '待办事项提醒', words: [{ kid: 1, name: '事项', rule: 'thing' }, { kid: 2, name: '时间', rule: 'time' }] }

test('认模板字段：「哪顿没拍」放 thing（名字像内容 / 事项），饭点放 time / date，提示放另一个 thing；没有 thing 的不能用', () => {
  const words = wordsOfContent('提醒内容:{{thing2.DATA}}\n用餐时间:{{time1.DATA}}\n温馨提示：{{thing3.DATA}}\n')
  assert.deepEqual(words.map((w) => w.key), ['thing2', 'time1', 'thing3'])
  const roles = rolesOf(words)
  assert.deepEqual([roles.meal.key, roles.mealTime.key, roles.tip.key], ['thing2', 'time1', 'thing3'])
  assert.equal(rolesOf(wordsOfContent('状态:{{phrase1.DATA}}\n时间:{{time2.DATA}}')), null)
  // 只有一个 thing：没有提示也行
  assert.deepEqual(Object.keys(rolesOf(wordsOfContent('事项:{{thing1.DATA}}'))), ['meal'])
})

test('setupTemplate：「我的模板」里已经有合适的就直接用，不再加', async () => {
  const api = fakeApi({ mine: [{ priTmplId: 'mine-1', title: '打卡提醒', type: 2, content: '打卡项目:{{thing1.DATA}}\n打卡时间:{{time2.DATA}}' }, { priTmplId: 'long', title: '用餐提醒', type: 3, content: '提醒内容:{{thing1.DATA}}' }] })
  const found = await setupTemplate(api)
  assert.deepEqual(found, { id: 'mine-1', title: '打卡提醒', fields: { meal: 'thing1', mealTime: 'time2' }, added: false })
  assert.deepEqual(api.calls.added, [])
})

test('setupTemplate：公共模板库里「用餐提醒」优先，加上哪顿没拍 / 饭点 / 提示三个字段，字段名以加好的为准', async () => {
  const api = fakeApi({ pub: { 501: TODO, 502: MEAL } })
  const found = await setupTemplate(api)
  assert.deepEqual(api.calls.added, [{ tid: '502', kidList: [2, 1, 3] }])
  assert.deepEqual(found, { id: 'p-502', title: '用餐提醒', fields: { meal: 'thing2', mealTime: 'time1', tip: 'thing3' }, added: true })
  // 再开通一次：「我的模板」里有了，不再加
  const again = await setupTemplate(api)
  assert.equal(again.added, false)
  assert.equal(api.calls.added.length, 1)
})

test('setupTemplate：没设服务类目、模板库里没有能用的，说清楚要去后台做什么', async () => {
  await assert.rejects(setupTemplate(fakeApi({ categories: [] })), /服务类目/)
  await assert.rejects(setupTemplate(fakeApi({ pub: { 9: { title: '快递到达通知', words: [{ kid: 1, name: '单号', rule: 'character_string' }] } } })), /用餐提醒/)
  // 长期订阅的不要
  await assert.rejects(setupTemplate(fakeApi({ pub: { 7: { ...MEAL, type: 3 } } })), /用餐提醒/)
})

test('setupTemplate：只认得出一个关键词的模板跳过（微信要 2～5 个），phrase 字段填「还没拍」', async () => {
  const ONE = { title: '用餐提醒', words: [{ kid: 1, name: '提醒内容', rule: 'thing' }, { kid: 2, name: '人数', rule: 'number' }] }
  const CLOCK = { title: '打卡提醒', words: [{ kid: 1, name: '打卡项目', rule: 'thing' }, { kid: 2, name: '打卡状态', rule: 'phrase' }, { kid: 3, name: '金额', rule: 'amount' }] }
  const api = fakeApi({ pub: { 11: ONE, 12: CLOCK } })
  const found = await setupTemplate(api)
  assert.deepEqual(api.calls.added, [{ tid: '12', kidList: [1, 2] }])
  assert.deepEqual(found.fields, { meal: 'thing1', status: 'phrase2' })
  const { messageFor } = require('../cloudfunctions/api/lib/remind')
  const times = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  assert.deepEqual(messageFor(found, 'lunch', times, new Date('2026-11-07T12:40:00+08:00')), { thing1: { value: '午饭还没拍哦' }, phrase2: { value: '还没拍' } })
})

test('setupTemplate：加不上（200020）先少加几个关键词再试，还不行换下一个模板；都不行把错误码和试的哪个带出去', async () => {
  // 502 三个关键词加不上、两个可以
  const api = fakeApi({ pub: { 502: MEAL, 501: TODO }, refuse: { 502: (kids) => kids.length > 2 } })
  const found = await setupTemplate(api)
  assert.deepEqual(api.calls.added.map((a) => a.kidList), [[2, 1, 3], [2, 1]])
  assert.deepEqual(found.fields, { meal: 'thing2', mealTime: 'time1' })
  // 502 怎么都加不上：换 501
  const next = fakeApi({ pub: { 502: MEAL, 501: TODO }, refuse: { 502: () => true } })
  assert.equal((await setupTemplate(next)).id, 'p-501')
  // 全都加不上
  const none = fakeApi({ pub: { 502: MEAL, 501: TODO }, refuse: { 502: () => true, 501: () => true } })
  await assert.rejects(setupTemplate(none), (e) => e.errCode === 200020 && /待办事项提醒 501 1,2/.test(e.detail))
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { ...PROFILE })
  const service = createRemindService({ repo, now: () => new Date(), config: {}, wxapi: fakeApi({ pub: { 502: MEAL }, refuse: { 502: () => true } }) })
  await assert.rejects(service.setup('u1'), { code: 'BAD_REQUEST', message: /错误码 200020 · 用餐提醒 502 2,1/ })
})

test('setupTemplate：新版一次性模板（tid 10000001 起）kidList 传空数组、关键词全带上；有填不上的字段（人数）的新模板跳过', async () => {
  const NEW_MEAL = { title: '用餐提醒', words: [{ kid: 1, name: '用餐时间', rule: 'time' }, { kid: 2, name: '提醒内容', rule: 'thing' }, { kid: 3, name: '人数', rule: 'number' }] }
  const NEW_CLOCK = {
    title: '打卡提醒',
    words: [{ kid: 1, name: '打卡项目', rule: 'thing' }, { kid: 2, name: '开始时间', rule: 'time' }, { kid: 3, name: '截止时间', rule: 'time' }, { kid: 4, name: '备注', rule: 'thing' }, { kid: 5, name: '小程序', rule: 'thing' }],
  }
  const api = fakeApi({ pub: { 10000123: NEW_MEAL, 10000456: NEW_CLOCK } })
  const found = await setupTemplate(api)
  assert.deepEqual(api.calls.added, [{ tid: '10000456', kidList: [] }])
  assert.deepEqual(found.fields, { meal: 'thing1', mealTime: 'time2', tip: 'thing4', name: 'thing5', endTime: 'time3' })
  const { messageFor } = require('../cloudfunctions/api/lib/remind')
  const times = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  assert.deepEqual(messageFor(found, 'breakfast', times, new Date('2026-11-07T08:00:00+08:00')), {
    thing1: { value: '早饭还没拍哦' },
    time2: { value: '2026-11-07 07:30' },
    thing4: { value: '8:30 前拍还算准时' },
    thing5: { value: '小暖自律打卡' },
    time3: { value: '2026-11-07 08:30' },
  })
  // 再开通：「我的模板」里这个字段全填得上，直接用
  const again = await setupTemplate(api)
  assert.equal(again.added, false)
  assert.equal(again.id, 'p-10000456')
  // 新模板加不上：错误里带 tid，不带关键词
  const none = fakeApi({ pub: { 10000456: NEW_CLOCK }, refuse: { 10000456: () => true } })
  await assert.rejects(setupTemplate(none), (e) => e.errCode === 200020 && e.detail === '打卡提醒 10000456')
})

test('setupTemplate：报错时记下是哪一步；某个模板读不到关键词就换下一个', async () => {
  const fail = (code) => async () => {
    const e = new Error('x')
    e.errCode = code
    throw e
  }
  await assert.rejects(setupTemplate({ ...fakeApi(), getCategory: fail(48001) }), (e) => e.errCode === 48001 && e.detail === '读服务类目')
  const api = fakeApi({ pub: { 502: MEAL, 501: TODO } })
  const words = api.getPubTemplateKeyWordsById
  api.getPubTemplateKeyWordsById = async (q) => (q.tid === 502 ? fail(200014)() : words(q))
  assert.equal((await setupTemplate(api)).id, 'p-501')
})

test('setupTemplate：「我的模板」里有填不上的字段（人数）就不直接用，另外加一个', async () => {
  const api = fakeApi({ mine: [{ priTmplId: 'mine-x', title: '用餐提醒', type: 2, content: '提醒内容:{{thing1.DATA}}\n人数:{{number2.DATA}}' }], pub: { 502: MEAL } })
  const found = await setupTemplate(api)
  assert.equal(found.id, 'p-502')
  assert.equal(found.added, true)
})

test('remind.setup：开通后存进 settings 大家共用，再开通不重复加；config 填了模板就用 config 的；接口报错带错误码', async () => {
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { ...PROFILE })
  const api = fakeApi({ pub: { 502: MEAL } })
  const service = createRemindService({ repo, now: () => new Date('2026-11-03T04:00:00Z'), config: { remindTemplate: null }, send: async () => {}, wxapi: api })
  assert.equal((await service.get('u1')).templateId, '')
  const view = await service.setup('u1')
  assert.equal(view.templateId, 'p-502')
  assert.deepEqual((await repo.getSetting('remindTemplate')).fields, { meal: 'thing2', mealTime: 'time1', tip: 'thing3' })
  await service.setup('u1')
  assert.equal(api.calls.added.length, 1)
  // 别人也能用（模板是小程序的，不是哪个人的）
  repo.state.profiles.set('u2', { ...PROFILE })
  assert.equal((await service.get('u2')).templateId, 'p-502')

  const withConfig = createRemindService({ repo, now: () => new Date(), config: { remindTemplate: { id: 'cfg', fields: { meal: 'thing1' } } }, wxapi: api })
  assert.equal((await withConfig.get('u1')).templateId, 'cfg')

  const broken = createRemindService({ repo: createFakeRepo(), now: () => new Date(), config: {}, wxapi: { getTemplateList: async () => { const e = new Error('no permission'); e.errCode = -604101; throw e } } })
  await assert.rejects(broken.setup('u1'), { code: 'BAD_REQUEST', message: /错误码 -604101/ })
  await assert.rejects(createRemindService({ repo: createFakeRepo(), now: () => new Date(), config: {} }).setup('u1'), { code: 'BAD_REQUEST' })
})

test('点通知打开她「允许」时用的那个版本：开发版预览 developer、体验版 trial；没记就按模板的（默认体验版）', async () => {
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { ...PROFILE })
  await repo.saveSetting('remindTemplate', { id: 'p-502', fields: { meal: 'thing2', mealTime: 'time1' }, state: 'trial' })
  const messages = []
  const clock = { now: new Date('2026-11-03T12:40:00+08:00') }
  const service = createRemindService({ repo, now: () => clock.now, config: {}, send: async (m) => messages.push(m) })
  await service.subscribed('u1', { accepted: true, version: 'develop' })
  await service.subscribed('u1', { accepted: true, version: 'nonsense' })
  await service.setNotify('u1', { on: true })
  assert.deepEqual(await service.tick(), { sent: 1 })
  assert.equal(messages[0].miniprogramState, 'developer')
  assert.deepEqual(messages[0].data, { thing2: { value: '午饭还没拍哦' }, time1: { value: '2026-11-03 12:00' } })
  await service.subscribed('u1', { accepted: true, version: 'trial' })
  clock.now = new Date('2026-11-03T18:40:00+08:00')
  await service.tick()
  assert.equal(messages[1].miniprogramState, 'trial')
})

test('提醒页：没开通时微信提醒在最上面、有「开通微信提醒」，点了云函数自己找模板开通，开关出来；手机闹钟写着可选', async (t) => {
  fixDate(t, '2026-11-03T12:10:00+08:00')
  const cloud = createFakeCloud({ replies: [analysisJson()] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  let asked = 0
  wx.requestSubscribeMessage = (o) => {
    asked += 1
    setImmediate(() => {
      if (o.success) o.success({ [o.tmplIds[0]]: 'accept' })
      if (o.complete) o.complete()
    })
  }
  const page = loadPage('remind', wx)
  page.onLoad({})
  page.onShow()
  await settle()
  assert.equal(page.data.view.wechat, false)
  const wxml = readWxml('remind')
  assert.ok(wxml.indexOf('setupWechat') < wxml.indexOf('addCalendar'), '微信提醒在手机闹钟前面')
  assert.match(wxml, /手机闹钟（可选）/)
  page.setupWechat()
  await settle()
  assert.match(wx.log.modals.pop(), /总是保持以上选择/)
  assert.equal(page.data.view.wechat, true)
  assert.deepEqual(cloud.addedTemplates, [{ tid: '1888', kidList: [2, 1, 3] }])
  // 模板接口不能让 SDK 把 kidList 转成 kid_list（真机报 200020 就是这个）；发通知的 send 照旧转
  const adminCalls = cloud.openapiCalls.filter((c) => c.api !== 'send')
  assert.ok(adminCalls.length > 0)
  assert.ok(adminCalls.every((c) => c.convertCase === false), JSON.stringify(adminCalls))
  page.toggleNotify(event({}, { value: true }))
  await settle()
  assert.equal(asked, 1)
  assert.equal(page.data.view.notify, true)
  assert.equal(page.data.view.creditsText, '还能提醒 1 次')
  assert.match(page.data.view.whenText, /午饭 12:30/)
  assert.match(readWxml('remind'), /testSend/)
  // 现在发一条试试：先再要一次「允许」补上，按现在这顿（午饭）发，和真的提醒一样
  page.testSend()
  await settle()
  assert.equal(asked, 2)
  assert.match(wx.log.modals.pop(), /服务通知/)
  assert.equal(cloud.messages.length, 1)
  assert.equal(cloud.messages[0].page, 'pages/checkin/checkin?mealType=lunch&from=remind')
  assert.deepEqual(cloud.messages[0].data, { thing2: { value: '午饭还没拍哦' }, time1: { value: '2026-11-03 12:00' }, thing3: { value: '13:00 前拍还算准时' } })
  assert.equal(page.data.view.creditsText, '还能提醒 1 次')
  assert.equal(page.data.view.lastText, '今天 12:10 午饭的试发发出去了')
  // 首页：勾了「总是保持」的，点拍照不弹窗地再攒一次；没勾的不在首页问
  wx.subscriptionItems = { 'tmpl-auto': 'accept' }
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  today.goCheckin(event({ mealType: 'lunch' }))
  await settle()
  assert.equal(asked, 3)
  assert.equal((await main({ action: 'remind.get' })).data.credits, 2)
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin?mealType=lunch'])
  wx.subscriptionItems = {}
  today.onShow()
  await settle()
  today.goCheckin(event({ mealType: 'lunch' }))
  await settle()
  assert.equal(asked, 3, '没勾「总是保持」：首页不问')
  today.onHide()
})
