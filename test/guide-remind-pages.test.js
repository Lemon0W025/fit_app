// 新手指引 + 饭点提醒页（docs/superpowers/specs/2026-10-29-guide-remind-share-design.md）
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, loadComponent, settle, event, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const { guideCard, WELCOME_CARDS } = require('../miniprogram/utils/guide')
const { remindView, calendarEvents, nextAt } = require('../miniprogram/utils/remind')

const PROFILE = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }
const TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const TEMPLATE = { id: 'tmpl-1', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }

async function app({ template = null } = {}) {
  require('../cloudfunctions/api/config').remindTemplate = template
  const cloud = createFakeCloud({ replies: [analysisJson(), analysisJson()] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  return { cloud, main, wx }
}

test.afterEach(() => {
  require('../cloudfunctions/api/config').remindTemplate = null
})

test('欢迎页：四张大卡，下一步一张张翻，最后一张「开始」去建档；跳过直接到最后；打开过就记下', () => {
  assert.equal(WELCOME_CARDS.length, 4)
  assert.deepEqual(WELCOME_CARDS[3].steps, ['填一下身高体重', '设好饭点提醒', '拍第一顿饭'])
  const wx = createWx(async () => ({ ok: true, data: null }))
  const page = loadPage('welcome', wx)
  page.onLoad()
  assert.equal(wx.app.globalData.welcomed, true)
  page.next()
  page.next()
  assert.equal(page.data.current, 2)
  page.onSwipe(event({}, { current: 1 }))
  assert.equal(page.data.current, 1)
  page.skip()
  assert.equal(page.data.current, 3)
  assert.equal(wx.log.nav.length, 0)
  page.next()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/profile/profile'])
  assert.match(readWxml('welcome'), /<swiper class="cards" current="\{\{current\}\}" bindchange="onSwipe">/)
})

test('新手三步：建档以后显示还差几步，点没做的那步去做；都做了、点过「不用了」就不显示', () => {
  assert.deepEqual(guideCard({ remind: false, meal: false }).steps.map((s) => s.done), [true, false, false])
  assert.equal(guideCard({ remind: false, meal: false }).title, '新手三步，还差 2 步')
  assert.equal(guideCard({ remind: true, meal: false }).title, '新手三步，还差 1 步')
  assert.equal(guideCard({ remind: true, meal: true }), null)
  assert.equal(guideCard({ remind: false, meal: false }, true), null)
  assert.equal(guideCard(null), null)
})

test('今日页：刚建档有「新手三步」卡；点「设好饭点提醒」去提醒页，「拍第一顿饭」去打卡；「不用了」藏起来并记住', async (t) => {
  fixDate(t, '2026-10-29T10:00:00+08:00')
  const { main, wx } = await app()
  await main({ action: 'profile.save', data: PROFILE })
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.guide.title, '新手三步，还差 2 步')
  today.guideStep(event({ action: 'goRemind' }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/remind/remind'])
  today.guideStep(event({ action: 'goCheckin' }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin'])
  today.hideGuide()
  assert.equal(today.data.guide, null)
  today.onShow()
  await settle()
  assert.equal(today.data.guide, null, '点过不用了，回来也不显示')
  today.onHide()
})

test('提醒页的样子：饭点、日历加没加、饭点改过要提示删旧的；没模板不显示微信提醒；日历三个事件饭点那一刻响、每天重复', () => {
  const none = remindView({ mealTimes: TIMES, calendar: null, templateId: '', notify: false, credits: 0 })
  assert.deepEqual(none.times.map((x) => [x.word, x.time, x.window]), [['早饭', '07:30', '06:30～08:30'], ['午饭', '12:00', '11:00～13:00'], ['晚饭', '18:00', '17:00～19:00']])
  assert.equal(none.calendarButton, '在手机日历里加三个饭点闹钟')
  assert.equal(none.wechat, false)
  const done = remindView({ mealTimes: TIMES, calendar: { at: 1, times: TIMES }, templateId: 't', notify: true, credits: 3 })
  assert.equal(done.calendarText, '已加好（07:30 / 12:00 / 18:00）')
  assert.equal(done.calendarStale, false)
  assert.equal(done.creditsText, '还能提醒 3 次')
  const stale = remindView({ mealTimes: { ...TIMES, lunch: '12:30' }, calendar: { at: 1, times: TIMES }, templateId: '', credits: 0 })
  assert.equal(stale.calendarStale, true)
  assert.equal(stale.calendarText, '')
  assert.equal(stale.calendarButton, '按新饭点再加一次')
  const now = new Date(2026, 9, 29, 12, 30) // 手机本地 12:30
  const events = calendarEvents(TIMES, now)
  assert.deepEqual(events.map((e) => new Date(e.startTime * 1000).toTimeString().slice(0, 5)), ['07:30', '12:00', '18:00'])
  assert.deepEqual(events.map((e) => new Date(e.startTime * 1000).getDate()), [30, 30, 29], '过了的明天开始')
  events.forEach((e) => {
    assert.equal(e.alarm, true)
    assert.equal(e.alarmOffset, 0)
    assert.equal(e.repeatInterval, 'day')
  })
  assert.equal(events[1].title, '小暖提醒：拍午饭（11:00～13:00 准时）')
  assert.ok(nextAt('12:30', now) > now.getTime() / 1000)
})

test('提醒页：加日历（三个一个个加），加好了记下、显示已加好、新手三步那步打勾；第一次进来「设好了，去拍第一顿」回今日页', async (t) => {
  fixDate(t, '2026-10-29T10:00:00+08:00')
  const { main, wx } = await app()
  await main({ action: 'profile.save', data: PROFILE })
  const added = []
  wx.canIUse = () => true
  wx.addPhoneRepeatCalendar = (o) => {
    added.push(o.title)
    setImmediate(() => o.success({}))
  }
  const page = loadPage('remind', wx)
  page.onLoad({ first: '1' })
  page.onShow()
  await settle()
  assert.equal(page.data.first, true)
  assert.equal(page.data.view.wechat, false)
  page.addCalendar()
  await settle()
  assert.equal(added.length, 3)
  assert.equal(page.data.view.calendarText, '已加好（07:30 / 12:00 / 18:00）')
  assert.ok(wx.log.toasts.includes('三个闹钟加好了'))
  assert.deepEqual((await main({ action: 'day.get' })).data.guide, { remind: true, meal: false })
  page.done()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/today/today'])
  // 拒绝了授权：提示去设置
  wx.addPhoneRepeatCalendar = (o) => o.fail({ errMsg: 'addPhoneRepeatCalendar:fail auth deny' })
  page.addCalendar()
  await settle()
  assert.match(wx.log.modals.pop(), /设置里打开/)
  assert.equal(page.data.working, false)
  // 微信太旧
  wx.canIUse = () => false
  page.addCalendar()
  assert.match(wx.log.modals.pop(), /升级微信/)
})

test('提醒页：有模板时能开微信提醒（先申请「允许」、允许了攒一次再打开），关掉不用申请；打卡提交时开着的顺手攒一次', async (t) => {
  fixDate(t, '2026-10-29T12:10:00+08:00')
  const { main, wx } = await app({ template: TEMPLATE })
  await main({ action: 'profile.save', data: PROFILE })
  let asked = 0
  let answer = 'accept'
  wx.requestSubscribeMessage = (o) => {
    asked += 1
    setImmediate(() => {
      if (o.success) o.success({ [o.tmplIds[0]]: answer })
      if (o.complete) o.complete()
    })
  }
  const page = loadPage('remind', wx)
  page.onLoad({})
  page.onShow()
  await settle()
  assert.equal(page.data.view.wechat, true)
  assert.equal(page.data.view.notify, false)
  answer = 'reject'
  page.toggleNotify(event({}, { value: true }))
  await settle()
  assert.equal(page.data.view.notify, false)
  assert.match(wx.log.modals.pop(), /允许/)
  answer = 'accept'
  page.toggleNotify(event({}, { value: true }))
  await settle()
  assert.equal(page.data.view.notify, true)
  assert.equal(page.data.view.creditsText, '还能提醒 1 次')
  page.toggleNotify(event({}, { value: false }))
  await settle()
  assert.equal(asked, 2, '关掉不用申请')
  assert.equal(page.data.view.notify, false)
  page.toggleNotify(event({}, { value: true }))
  await settle()

  // 今日页拿到「开着」，打卡提交时先申请一次再上传
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  today.onHide()
  assert.deepEqual(wx.app.globalData.remind, { templateId: 'tmpl-1', notify: true })
  const checkin = loadPage('checkin', wx)
  checkin.onLoad({})
  checkin.onNote(event({}, { value: '米饭青菜' }))
  checkin.submit()
  await settle()
  assert.equal(asked, 4)
  assert.equal(wx.log.nav.pop()[0], 'redirectTo')
  assert.equal((await main({ action: 'remind.get' })).data.credits, 3)
})

test('开关组件：点了发 change（新的值），页面决定改不改；禁用时不发；按住时有按下的样子', () => {
  const sw = loadComponent('switch', createWx(async () => ({ ok: true, data: null })), { checked: false })
  sw.onPress()
  assert.equal(sw.data.pressed, true)
  sw.onRelease()
  sw.onTap()
  assert.deepEqual(sw.events, [['change', { value: true }]])
  assert.equal(sw.data.checked, false, '页面没改就还是关着')
  sw.setData({ checked: true })
  sw.onTap()
  assert.deepEqual(sw.events.pop(), ['change', { value: false }])
  sw.setData({ disabled: true })
  sw.onPress()
  sw.onTap()
  assert.equal(sw.data.pressed, false)
  assert.equal(sw.events.length, 1)
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../miniprogram/components/switch/switch.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) assert.ok(m[1] === 'sw' || m[1].startsWith('sw-'), m[1])
  for (const m of css.matchAll(/transition:\s*([^;]+);/g)) m[1].split(/,(?![^(]*\))/).forEach((part) => assert.ok(/^(transform|opacity)\b/.test(part.trim()), part))
})

test('建档以后接着进提醒页（?first=1）；「我的」里有饭点提醒入口', async () => {
  const { wx } = await app()
  const profile = loadPage('profile', wx)
  profile.onShow()
  await settle()
  for (const [field, value] of Object.entries({ nickname: '妈妈', age: '50', heightCm: '160', weightKg: '70', targetWeightKg: '60' })) {
    profile.onInput(event({ field }, { value }))
  }
  profile.onPick(event({ field: 'activity', value: 'light' }))
  profile.save()
  await settle()
  await new Promise((r) => setTimeout(r, 850))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/remind/remind?first=1'])
  profile.goRemind()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/remind/remind'])
  assert.match(readWxml('profile'), /bindtap="goRemind"/)
})
