// 饭点提醒（准时打卡设计第二块）：什么时候提醒、发什么、攒「允许」的次数、日历闹钟、定时触发器
const test = require('node:test')
const assert = require('node:assert/strict')
const { planReminders, messageFor, recordSent, CREDITS_MAX } = require('../cloudfunctions/api/lib/remind')
const { createRemindService } = require('../cloudfunctions/api/services/remind')
const { createFakeRepo, PROFILE } = require('./helpers/fake-repo')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')

const TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const at = (hhmm, day = '2026-10-29') => new Date(`${day}T${hhmm}:00+08:00`)
const TEMPLATE = { id: 'tmpl-1', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }

test('planReminders：饭点过了 30 分钟起、窗口结束前，这顿还没拍、今天还没发过才提醒', () => {
  const plan = (hhmm, meals = [], sent = {}) => planReminders({ times: TIMES, meals, now: at(hhmm), sent })
  assert.deepEqual(plan('12:29'), [])
  assert.deepEqual(plan('12:30'), ['lunch'])
  assert.deepEqual(plan('13:00'), ['lunch'])
  assert.deepEqual(plan('13:01'), [])
  assert.deepEqual(plan('08:00'), ['breakfast'])
  assert.deepEqual(plan('18:45'), ['dinner'])
  // 拍过了（什么时候拍的都算）
  assert.deepEqual(plan('12:40', [{ mealType: 'lunch', timing: 'early' }]), [])
  // 加餐不算拍了午饭
  assert.deepEqual(plan('12:40', [{ mealType: 'snack', timing: null }]), ['lunch'])
  // 今天这顿发过了
  assert.deepEqual(plan('12:50', [], { '2026-10-29': { lunch: 1 } }), [])
  assert.deepEqual(plan('12:50', [], { '2026-10-28': { lunch: 1 } }), ['lunch'])
  // 改过的饭点
  assert.deepEqual(planReminders({ times: { ...TIMES, lunch: '11:30' }, meals: [], now: at('12:10'), sent: {} }), ['lunch'])
})

test('messageFor：按模板字段填，time 类字段用「日期 时间」，thing 不超过 20 个字；recordSent 只留 7 天', () => {
  assert.deepEqual(messageFor(TEMPLATE, 'lunch', TIMES, at('12:40')), {
    thing1: { value: '午饭还没拍哦' },
    time2: { value: '2026-10-29 12:00' },
    thing3: { value: '13:00 前拍还算准时' },
  })
  assert.deepEqual(messageFor({ fields: { name: 'thing9', nope: 'x1' } }, 'dinner', TIMES, at('18:40')), { thing9: { value: '小暖养生' } })
  const sent = recordSent({ '2026-10-20': { lunch: 1 }, '2026-10-23': { dinner: 2 }, '2026-10-29': { breakfast: 3 } }, at('12:40'), 'lunch')
  assert.deepEqual(Object.keys(sent).sort(), ['2026-10-23', '2026-10-29'])
  assert.equal(sent['2026-10-29'].breakfast, 3)
  assert.equal(sent['2026-10-29'].lunch, at('12:40').getTime())
})

function setup({ template = TEMPLATE, now = at('12:40'), sendError = null } = {}) {
  const repo = createFakeRepo()
  repo.state.profiles.set('u1', { ...PROFILE })
  const messages = []
  const clock = { now }
  const service = createRemindService({
    repo,
    now: () => clock.now,
    config: { remindTemplate: template },
    send: async (msg) => {
      if (sendError) throw sendError
      messages.push(msg)
    },
  })
  return { repo, service, messages, clock }
}

test('remind.get / subscribed / setNotify / calendarDone：没模板时没有微信提醒；允许一次攒一次（最多 30）；日历记下当时的饭点', async () => {
  const none = setup({ template: null })
  assert.deepEqual(await none.service.get('u1'), { templateId: '', notify: false, credits: 0, calendar: null, mealTimes: TIMES })
  await assert.rejects(none.service.setNotify('u1', { on: true }), { code: 'BAD_REQUEST' })
  assert.equal(await none.service.isSet('u1'), false)
  const done = await none.service.calendarDone('u1', { times: TIMES })
  assert.deepEqual(done.calendar.times, TIMES)
  assert.equal(await none.service.isSet('u1'), true)

  const { service } = setup()
  assert.equal((await service.get('u1')).templateId, 'tmpl-1')
  assert.equal((await service.subscribed('u1', { accepted: true })).credits, 1)
  assert.equal((await service.subscribed('u1', { accepted: false })).credits, 1)
  for (let i = 0; i < 40; i++) await service.subscribed('u1', { accepted: true })
  assert.equal((await service.get('u1')).credits, CREDITS_MAX)
  assert.equal((await service.setNotify('u1', { on: true })).notify, true)
  assert.equal(await service.isSet('u1'), true)
  assert.equal((await service.setNotify('u1', { on: false })).notify, false)
})

test('tick：开了提醒、有次数、过了饭点 30 分钟还没拍的发一条（进首页），次数减一、这顿记下不再发；拍了的不发；没开的不发', async () => {
  const { repo, service, messages, clock } = setup()
  await service.subscribed('u1', { accepted: true })
  await service.subscribed('u1', { accepted: true })
  // 没开提醒：不发
  assert.deepEqual(await service.tick(), { sent: 0 })
  await service.setNotify('u1', { on: true })
  assert.deepEqual(await service.tick(), { sent: 1 })
  assert.deepEqual(messages[0], {
    touser: 'u1', templateId: 'tmpl-1', page: 'pages/today/today', miniprogramState: 'trial',
    data: { thing1: { value: '午饭还没拍哦' }, time2: { value: '2026-10-29 12:00' }, thing3: { value: '13:00 前拍还算准时' } },
  })
  assert.equal((await service.get('u1')).credits, 1)
  // 同一顿不再发
  clock.now = at('12:50')
  assert.deepEqual(await service.tick(), { sent: 0 })
  // 晚饭拍了：不发
  clock.now = at('18:40')
  await repo.addMeal({ _openid: 'u1', date: '2026-10-29', mealType: 'dinner', timing: 'on', createdAt: 1 })
  assert.deepEqual(await service.tick(), { sent: 0 })
  // 第二天早饭没拍：用掉最后一次
  clock.now = at('08:05', '2026-10-30')
  assert.deepEqual(await service.tick(), { sent: 1 })
  assert.equal((await service.get('u1')).credits, 0)
  // 没次数了：不在名单里
  clock.now = at('12:40', '2026-10-30')
  assert.deepEqual(await service.tick(), { sent: 0 })
  assert.equal(messages.length, 2)
})

test('tick：用户拒收（43101）次数清零、这顿记下；别的错误不记，下个 10 分钟再试；没模板什么都不做', async () => {
  const refused = setup({ sendError: { errCode: 43101, message: 'user refuse' } })
  await refused.service.subscribed('u1', { accepted: true })
  await refused.service.setNotify('u1', { on: true })
  assert.deepEqual(await refused.service.tick(), { sent: 0 })
  assert.equal((await refused.service.get('u1')).credits, 0)
  assert.ok(refused.repo.state.reminders.get('u1').sent['2026-10-29'].lunch)

  const flaky = setup({ sendError: { errCode: -1, message: 'system busy' } })
  await flaky.service.subscribed('u1', { accepted: true })
  await flaky.service.setNotify('u1', { on: true })
  await flaky.service.tick()
  assert.equal((await flaky.service.get('u1')).credits, 1)
  assert.deepEqual(flaky.repo.state.reminders.get('u1').sent, {})

  const none = setup({ template: null })
  assert.deepEqual(await none.service.tick(), { sent: 0 })
})

test('云函数：remind.* 走路由；定时触发器（Type: Timer）不走路由、调 tick；day.get 带新手三步和模板 ID', async () => {
  const config = require('../cloudfunctions/api/config')
  config.remindTemplate = TEMPLATE
  try {
    const cloud = createFakeCloud()
    const { main } = loadCloudFunction(cloud)
    await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
    let day = await main({ action: 'day.get' })
    assert.deepEqual(day.data.guide, { remind: false, meal: false })
    assert.deepEqual(day.data.remind, { templateId: 'tmpl-1', notify: false })
    assert.equal((await main({ action: 'remind.subscribed', data: { accepted: true } })).data.credits, 1)
    assert.equal((await main({ action: 'remind.setNotify', data: { on: true } })).data.notify, true)
    day = await main({ action: 'day.get' })
    assert.deepEqual(day.data.guide, { remind: true, meal: false })
    assert.deepEqual(day.data.remind, { templateId: 'tmpl-1', notify: true })
    const res = await main({ Type: 'Timer', TriggerName: 'remind', Time: new Date().toISOString() })
    assert.ok(typeof res.sent === 'number')
  } finally {
    config.remindTemplate = null
  }
})
