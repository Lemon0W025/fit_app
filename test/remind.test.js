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

test('planReminders：到了饭点、窗口结束前，这顿还没拍、今天还没发过才提醒', () => {
  const plan = (hhmm, meals = [], sent = {}) => planReminders({ times: TIMES, meals, now: at(hhmm), sent })
  assert.deepEqual(plan('11:59'), [])
  assert.deepEqual(plan('12:00'), ['lunch'])
  assert.deepEqual(plan('13:00'), ['lunch'])
  assert.deepEqual(plan('13:01'), [])
  assert.deepEqual(plan('07:30'), ['breakfast'])
  assert.deepEqual(plan('07:29'), [])
  assert.deepEqual(plan('18:00'), ['dinner'])
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
    thing1: { value: '到饭点啦，拍午饭吧' },
    time2: { value: '2026-10-29 12:00' },
    thing3: { value: '13:00 前拍还算准时' },
  })
  assert.deepEqual(messageFor({ fields: { name: 'thing9', nope: 'x1' } }, 'dinner', TIMES, at('18:40')), { thing9: { value: '小暖自律打卡' } })
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
  assert.deepEqual(await none.service.get('u1'), {
    templateId: '',
    notify: false,
    credits: 0,
    calendar: null,
    mealTimes: TIMES,
    nudgeAt: { breakfast: '7:30', lunch: '12:00', dinner: '18:00' },
    lastText: '',
    tickText: '⚠️ 自动检查一次都还没跑过：到饭点不会自动提醒，只能手动试发。告诉家里人',
    tickBad: true,
  })
  await assert.rejects(none.service.setNotify('u1', { on: true }), { code: 'BAD_REQUEST' })
  assert.equal(await none.service.isSet('u1'), false)
  // 一顿一顿加：记下加了哪顿；不带 mealType 的老版本当三顿都加了
  let done = await none.service.calendarDone('u1', { times: TIMES, mealType: 'lunch' })
  assert.deepEqual(done.calendar.meals, { lunch: '12:00' })
  done = await none.service.calendarDone('u1', { times: TIMES, mealType: 'dinner' })
  assert.deepEqual(done.calendar.meals, { lunch: '12:00', dinner: '18:00' })
  done = await none.service.calendarDone('u1', { times: TIMES })
  assert.deepEqual(done.calendar.times, TIMES)
  assert.deepEqual(done.calendar.meals, TIMES)
  // 11/09 以前的老记录没有 meals：那时一次点击连着加三个，微信只认第一个，所以只算早饭
  none.repo.state.reminders.set('u2', { _id: 'u2', calendar: { at: 1, times: TIMES } })
  assert.deepEqual((await none.service.get('u2')).calendar.meals, { breakfast: '07:30' })
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

test('tick：开了提醒、有次数、到了饭点这顿还没拍的发一条（点了直接进拍照页、这顿选好），次数减一、这顿记下不再发；拍了的不发；没开的不发', async () => {
  const { repo, service, messages, clock } = setup()
  await service.subscribed('u1', { accepted: true })
  await service.subscribed('u1', { accepted: true })
  // 没开提醒：不发
  assert.deepEqual(await service.tick(), { sent: 0 })
  await service.setNotify('u1', { on: true })
  assert.deepEqual(await service.tick(), { sent: 1 })
  assert.deepEqual(messages[0], {
    touser: 'u1', templateId: 'tmpl-1', page: 'pages/checkin/checkin?mealType=lunch&from=remind', miniprogramState: 'trial',
    data: { thing1: { value: '到饭点啦，拍午饭吧' }, time2: { value: '2026-10-29 12:00' }, thing3: { value: '13:00 前拍还算准时' } },
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

test('提醒页看得出定时检查在不在跑、上次提醒发没发出去；别的错也记下错误码', async () => {
  const { service, clock } = setup()
  await service.subscribed('u1', { accepted: true })
  await service.subscribed('u1', { accepted: true })
  await service.setNotify('u1', { on: true })
  await service.tick()
  let view = await service.get('u1')
  assert.equal(view.tickText, '定时检查：今天 12:40 看过一次（每 10 分钟一次）')
  assert.equal(view.tickBad, false)
  clock.now = at('13:00')
  assert.equal((await service.get('u1')).tickBad, false, '20 分钟还算在跑')
  assert.equal(view.lastText, '今天 12:40 午饭的提醒发出去了')
  clock.now = at('08:10', '2026-10-30')
  view = await service.get('u1')
  assert.equal(view.tickText, '⚠️ 自动检查最后一次是 昨天 12:40，之后停了：到饭点不会自动提醒。告诉家里人')
  assert.equal(view.tickBad, true)

  const flaky = setup({ sendError: { errCode: 47003, message: 'argument invalid' } })
  await flaky.service.subscribed('u1', { accepted: true })
  await flaky.service.setNotify('u1', { on: true })
  await flaky.service.tick()
  assert.equal((await flaky.service.get('u1')).lastText, '今天 12:40 午饭的提醒没发出去（错误码 47003）')
})

test('tick：一进来先记一笔；半路出错也记下错误，提醒页写出来', async () => {
  const { repo, service } = setup()
  repo.listReminders = async () => {
    throw new Error('database timeout')
  }
  assert.deepEqual(await service.tick({ trigger: 'remind' }), { sent: 0, error: true })
  const tick = await repo.getSetting('remindTick')
  assert.equal(tick.stage, 'error')
  assert.equal(tick.trigger, 'remind')
  const view = await service.get('u1')
  assert.equal(view.tickBad, true)
  assert.match(view.tickText, /今天 12:40 跑了，但出错了（database timeout）/)
})

test('remind.test：现在发一条试试（按现在这顿，和真的提醒一样），用掉一次；没次数 / 发不出去说清楚', async () => {
  const { service, messages, clock } = setup()
  await assert.rejects(service.test('u1'), { code: 'BAD_REQUEST', message: /允许/ })
  await service.subscribed('u1', { accepted: true, version: 'develop' })
  clock.now = at('15:00')
  const view = await service.test('u1')
  assert.equal(messages.length, 1)
  // 15:00 不在哪顿的窗口里：按下一顿晚饭发
  assert.equal(messages[0].page, 'pages/checkin/checkin?mealType=dinner&from=remind')
  assert.equal(messages[0].miniprogramState, 'developer')
  assert.equal(view.credits, 0)
  assert.equal(view.lastText, '今天 15:00 晚饭的试发发出去了')

  const broken = setup({ sendError: { errCode: 47003, message: 'argument invalid' } })
  await broken.service.subscribed('u1', { accepted: true })
  await assert.rejects(broken.service.test('u1'), { code: 'BAD_REQUEST', message: /错误码 47003/ })
  assert.equal((await broken.service.get('u1')).credits, 1)
  const refused = setup({ sendError: { errCode: 43101, message: 'user refuse' } })
  await refused.service.subscribed('u1', { accepted: true })
  await assert.rejects(refused.service.test('u1'), { message: /次数用完/ })
  assert.equal((await refused.service.get('u1')).credits, 0)
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
    // 事件格式稍有不同也认：小写 timer、只有 TriggerName
    assert.ok(typeof (await main({ Type: 'timer' })).sent === 'number')
    assert.ok(typeof (await main({ TriggerName: 'remind' })).sent === 'number')
    // 跑过就记一笔，提醒页能看到
    assert.match((await main({ action: 'remind.get' })).data.tickText, /^定时检查：今天 /)
    // 没有 OPENID、也没有 action 的（不是小程序发来的）当定时触发
    const bare = loadCloudFunction(createFakeCloud({ openid: '' }))
    assert.ok(typeof (await bare.main({})).sent === 'number')
  } finally {
    config.remindTemplate = null
  }
})
