// test/today-cards.test.js：首页跟着状态出现的三样——问好旁边的连续天数、「微信提醒快用完了」、邀请亲友的提示；使用说明里的亲友看板
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const { streakPill, remindLowCard, familyHintCard } = require('../miniprogram/utils/guide')
const { manualSections } = require('../miniprogram/utils/manual')

const PROFILE = { nickname: '阿芳', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }
const TEMPLATE = { id: 'tmpl-1', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }

async function app({ template = null } = {}) {
  require('../cloudfunctions/api/config').remindTemplate = template
  const cloud = createFakeCloud({ replies: Array.from({ length: 12 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  return { cloud, main, wx: createWx(main) }
}

test.afterEach(() => {
  require('../cloudfunctions/api/config').remindTemplate = null
})

async function mealAt(t, main, when, mealType = 'breakfast') {
  fixDate(t, when)
  const res = await main({ action: 'meal.analyze', data: { mealType, note: '米饭青菜' } })
  assert.equal(res.ok, true)
}

function openToday(wx) {
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  return today
}

test('streakPill / remindLowCard / familyHintCard：什么时候出、写什么', () => {
  assert.equal(streakPill({ streak: 0 }), null)
  assert.equal(streakPill(null), null)
  assert.deepEqual(streakPill({ streak: 6 }), { days: 6, text: '连续 6 天' })

  const on = { notify: true, templateId: 't', credits: 1 }
  assert.equal(remindLowCard(null, '', '2026-11-11'), null)
  assert.equal(remindLowCard({ ...on, notify: false }, '', '2026-11-11'), null, '没开微信提醒不提')
  assert.equal(remindLowCard({ ...on, templateId: '' }, '', '2026-11-11'), null)
  assert.equal(remindLowCard({ ...on, credits: 2 }, '', '2026-11-11'), null, '还有 2 次不提')
  assert.equal(remindLowCard(on, '', '2026-11-11').title, '微信提醒只剩 1 次了')
  const empty = remindLowCard({ ...on, credits: 0 }, '', '2026-11-11')
  assert.deepEqual([empty.title, empty.button], ['微信提醒的次数用完了', '续上'])
  assert.match(empty.tip, /允许/)
  assert.equal(remindLowCard(on, '2026-11-11', '2026-11-11'), null, '今天点过「今天不提了」')
  assert.ok(remindLowCard(on, '2026-11-10', '2026-11-11'), '昨天点的，今天接着提')

  assert.equal(familyHintCard(2, 0, false), null, '才连 2 天不提')
  assert.equal(familyHintCard(5, 1, false), null, '已经有亲友在看')
  assert.equal(familyHintCard(5, 0, true), null, '点过「不用了」')
  const hint = familyHintCard(5, 0, false)
  assert.equal(hint.button, '邀请亲友')
  assert.match(hint.sub, /连续打卡 5 天/)
})

test('今日页：连上了，问好旁边写「连续 N 天」；还没打过卡不写', async (t) => {
  const { main, wx } = await app()
  fixDate(t, '2026-10-19T07:40:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  let today = openToday(wx)
  await settle()
  assert.equal(today.data.streak, null)
  today.onHide()
  await mealAt(t, main, '2026-10-19T07:40:00+08:00')
  await mealAt(t, main, '2026-10-20T07:40:00+08:00')
  today = openToday(wx)
  await settle()
  assert.deepEqual(today.data.streak, { days: 2, text: '连续 2 天' })
  assert.equal(today.data.familyHint, null, '才 2 天，不提亲友看板')
  const wxml = readWxml('today')
  assert.match(wxml, /class="streak-pill"[^>]*bindtap="goCalendar"/)
  today.onHide()
})

test('今日页：微信提醒只剩 1 次时出续上卡；点续上、允许了攒一次，今天不再提；没点允许卡片留着', async (t) => {
  fixDate(t, '2026-10-29T12:10:00+08:00')
  const { cloud, main, wx } = await app({ template: TEMPLATE })
  await main({ action: 'profile.save', data: PROFILE })
  // 开着微信提醒、「允许」只剩 1 次
  await main({ action: 'remind.subscribed', data: { accepted: true, version: 'trial' } })
  await main({ action: 'remind.setNotify', data: { on: true } })
  let answer = 'reject'
  let asked = 0
  wx.requestSubscribeMessage = (o) => {
    asked += 1
    setImmediate(() => o.success && o.success({ [o.tmplIds[0]]: answer }))
  }
  let today = openToday(wx)
  await settle()
  assert.equal(today.data.remindLow.title, '微信提醒只剩 1 次了')
  today.renewRemind()
  await settle()
  assert.equal(wx.log.toasts.pop(), '没点「允许」，这次没续上')
  assert.ok(today.data.remindLow, '没续上，卡片还在')
  answer = 'accept'
  today.renewRemind()
  await settle()
  assert.equal(asked, 2)
  assert.equal(wx.log.toasts.pop(), '续上了，还能提醒 2 次')
  assert.equal(today.data.remindLow, null)
  assert.equal(cloud.db.collections.get('reminders').get('u1').credits, 2)
  today.onHide()
  // 用掉一次又只剩 1 次：今天续过了，不再提；明天再提
  const reminders = cloud.db.collections.get('reminders')
  reminders.set('u1', { ...reminders.get('u1'), credits: 1 })
  today = openToday(wx)
  await settle()
  assert.equal(today.data.remindLow, null)
  today.onHide()
  fixDate(t, '2026-10-30T08:00:00+08:00')
  today = openToday(wx)
  await settle()
  assert.equal(today.data.remindLow.title, '微信提醒只剩 1 次了')
  today.hideRemindLow()
  assert.equal(today.data.remindLow, null)
  assert.equal(wx.storage.remindLowHidden, '2026-10-30')
  today.onHide()
})

test('今日页：没开微信提醒、或者还有好几次，不出续上卡', async (t) => {
  fixDate(t, '2026-10-29T12:10:00+08:00')
  const { main, wx } = await app({ template: TEMPLATE })
  await main({ action: 'profile.save', data: PROFILE })
  let today = openToday(wx)
  await settle()
  assert.equal(today.data.remindLow, null, '没开提醒')
  today.onHide()
  for (let i = 0; i < 3; i += 1) await main({ action: 'remind.subscribed', data: { accepted: true, version: 'trial' } })
  await main({ action: 'remind.setNotify', data: { on: true } })
  today = openToday(wx)
  await settle()
  assert.equal(today.data.remindLow, null, '还有 3 次')
  today.onHide()
})

test('今日页：连续 3 天、没有亲友在看，出邀请卡；按钮分享出去带邀请码；有亲友了 / 点过「不用了」不再出', async (t) => {
  const { cloud, main, wx } = await app()
  fixDate(t, '2026-10-19T07:40:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  await mealAt(t, main, '2026-10-19T07:40:00+08:00')
  await mealAt(t, main, '2026-10-20T07:40:00+08:00')
  await mealAt(t, main, '2026-10-21T07:40:00+08:00')
  let today = openToday(wx)
  await settle()
  assert.equal(today.data.streak.days, 3)
  assert.equal(today.data.familyHint.title, '让亲友也看看你的坚持')
  const mine = (await main({ action: 'family.mine' })).data
  assert.ok(mine.code)
  assert.deepEqual(today.onShareAppMessage({ from: 'button' }), { title: '来看看我今天吃得怎么样', path: `/pages/family/family?code=${mine.code}` })
  assert.equal(today.onShareAppMessage({ from: 'menu' }).path, '/pages/today/today')
  assert.match(readWxml('today'), /open-type="share"/)
  today.onHide()

  // 有一位亲友接受了邀请：不再提
  cloud.setOpenid('u2')
  assert.equal((await main({ action: 'family.accept', data: { code: mine.code, name: '小明' } })).ok, true)
  cloud.setOpenid('u1')
  today = openToday(wx)
  await settle()
  assert.equal(today.data.familyHint, null)
  today.onHide()

  // 亲友被移除了又会提；点「不用了」记住，以后不提
  const viewer = (await main({ action: 'family.mine' })).data.viewers[0].viewer
  await main({ action: 'family.remove', data: { viewer } })
  today = openToday(wx)
  await settle()
  assert.ok(today.data.familyHint)
  today.hideFamilyHint()
  assert.equal(today.data.familyHint, null)
  today.onHide()
  today = openToday(wx)
  await settle()
  assert.equal(today.data.familyHint, null)
  today.onHide()
})

test('使用说明：有「亲友看板」一节，说清怎么邀请、亲友看得到什么', () => {
  const family = manualSections().find((s) => s.key === 'family')
  assert.ok(family)
  assert.match(family.lines.join(''), /邀请亲友看我的打卡/)
  assert.match(family.lines.join(''), /看不到你的体重/)
  assert.ok(!/妈妈|家里人/.test(JSON.stringify(manualSections())))
})
