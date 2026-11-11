// test/start-over-tour.test.js：从头再来（测试用）、新手导览、使用说明
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, loadComponent, settle, readWxml, readComponentWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const { TOURS, seen } = require('../miniprogram/utils/tours')
const { manualSections, DAY_MAX } = require('../miniprogram/utils/manual')

const config = require('../cloudfunctions/api/config')
const PROFILE = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }

test.afterEach(() => {
  config.testReset = null
  config.testUnlimited = null
})

async function app() {
  const cloud = createFakeCloud({ replies: [analysisJson(), analysisJson()] })
  const { main } = loadCloudFunction(cloud)
  return { cloud, main, wx: createWx(main) }
}

test('从头再来：只在 config.testReset 开着时能用；清空自己的档案、打卡和照片、体重、营地、提醒、份量，别人的不动', async (t) => {
  fixDate(t, '2026-11-01T12:10:00+08:00')
  const { cloud, main } = await app()
  // 关着：没有按钮、点了也不行
  assert.deepEqual((await main({ action: 'account.info' })).data, { canReset: false })
  assert.equal((await main({ action: 'account.reset' })).code, 'FORBIDDEN')

  config.testReset = { until: '2026-11-30' }
  assert.deepEqual((await main({ action: 'account.info' })).data, { canReset: true })
  // 别人（u2）也有一份
  cloud.setOpenid('u2')
  await main({ action: 'profile.save', data: { ...PROFILE, nickname: '爸爸' } })
  cloud.setOpenid('u1')
  await main({ action: 'profile.save', data: PROFILE })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', fileID: 'cloud://env/meals/a.jpg', note: '' } })
  await main({ action: 'weight.save', data: { weightKg: 69 } })
  await main({ action: 'camp.get' })
  await main({ action: 'remind.calendarDone', data: {} })
  assert.ok((await main({ action: 'day.get' })).data.meals.length)

  assert.deepEqual((await main({ action: 'account.reset' })).data, { reset: true })
  assert.equal((await main({ action: 'profile.get' })).data, null)
  const day = (await main({ action: 'day.get' })).data
  assert.equal(day.profile, null)
  assert.deepEqual(cloud.deletedFiles, ['cloud://env/meals/a.jpg'])
  for (const name of ['users', 'meals', 'weights', 'gardens', 'reminders']) {
    const left = [...(cloud.db.collections.get(name) || new Map()).values()].filter((d) => d._openid === 'u1' || d._id === 'u1')
    assert.deepEqual(left, [], `${name} 里还有 u1 的`)
  }
  // 营地也是第一次进来的样子：又送 60 暖豆、只有豆豆
  await main({ action: 'profile.save', data: PROFILE })
  const camp = (await main({ action: 'camp.get' })).data
  assert.deepEqual(camp.welcome, { beans: 60, petId: 'doudou' })
  assert.deepEqual(camp.pets.map((p) => p.id), ['doudou'])
  // 别人的还在
  cloud.setOpenid('u2')
  assert.equal((await main({ action: 'profile.get' })).data.nickname, '爸爸')
  // 过了日子就关了
  fixDate(t, '2026-12-01T12:00:00+08:00')
  cloud.setOpenid('u1')
  assert.equal((await main({ action: 'account.reset' })).code, 'FORBIDDEN')
})

test('测试福利只留暖豆无限：食物不补，要自己扭蛋抽', async (t) => {
  fixDate(t, '2026-11-01T12:10:00+08:00')
  const { main } = await app()
  config.testUnlimited = { until: '2026-11-30', beans: 99999, foods: 0 }
  await main({ action: 'profile.save', data: PROFILE })
  const camp = (await main({ action: 'camp.get' })).data
  assert.equal(camp.beans, 99999)
  assert.deepEqual(camp.foods, [])
})

test('「我的」：测试期间有「从头再来」，问一句再清空，手机上存的也清掉，整个小程序回到首页；「使用说明」所有人都有', async (t) => {
  fixDate(t, '2026-11-01T12:10:00+08:00')
  const { main, wx } = await app()
  await main({ action: 'profile.save', data: PROFILE })
  // 关着：没有按钮
  const off = loadPage('profile', wx)
  off.onLoad()
  await settle()
  assert.equal(off.data.canReset, false)
  assert.match(readWxml('profile'), /wx:if="\{\{canReset\}\}"[^>]*bindtap="startOver"/)
  off.goManual()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/manual/manual'])

  config.testReset = { until: '2026-11-30' }
  wx.storage = { guideHidden: true, toursSeen: { today: true }, campSpots: { doudou: { x: 1, y: 2 } } }
  wx.app.globalData.welcomed = true
  wx.app.globalData.mealTimes = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  const page = loadPage('profile', wx)
  page.onLoad()
  page.onShow()
  await settle()
  assert.equal(page.data.canReset, true)
  page.startOver()
  await settle()
  assert.match(wx.log.modals.pop(), /清掉就找不回来了/)
  assert.deepEqual(wx.log.nav.pop(), ['reLaunch', '/pages/today/today'])
  assert.deepEqual(wx.storage, {})
  assert.equal(wx.app.globalData.welcomed, null)
  assert.equal((await main({ action: 'profile.get' })).data, null)
  // 首页：没档案 → 欢迎页
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/welcome/welcome'])
})

test('导览组件：圈出目标（大一圈），目标在上半截卡片在下面、下半截卡片在上面；指 tab 的贴在最下面；下一步、跳过、结束', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  wx.rects = { '#a': { left: 16, top: 100, width: 343, height: 160 }, '#b': { left: 200, top: 520, width: 60, height: 60 } }
  const steps = [
    { selector: '#a', title: '一', text: '上面的' },
    { selector: '#b', title: '二', text: '下面的' },
    { tab: 1, tabs: 4, title: '三', text: '指营地' },
    { selector: '#none', title: '四', text: '找不到就放中间', done: '开始用' },
  ]
  const tour = loadComponent('tour', wx, { steps })
  tour.setData({ show: true })
  assert.equal(tour.data.ready, true)
  assert.deepEqual([tour.data.last, tour.data.nextText], [false, '下一步'])
  assert.deepEqual(tour.data.hole, { left: 8, top: 92, width: 359, height: 176 })
  assert.equal(tour.data.tip.side, 'up')
  assert.match(tour.data.tip.style, /top: 282px/)
  tour.next()
  assert.equal(tour.data.tip.side, 'down')
  assert.match(tour.data.tip.style, /bottom: 202px/) // 700 - (520 - 8) + 14
  assert.equal(tour.data.tip.arrow, 202) // 箭头对着目标中间
  tour.next()
  assert.equal(tour.data.hole, null)
  assert.match(tour.data.tip.style, /bottom: 14px/)
  assert.equal(tour.data.tip.arrow, 113) // 第二个 tab 的中间：375 × 1.5 / 4 - 16 - 12 ≈ 112.6
  tour.next()
  assert.equal(tour.data.hole, null)
  assert.equal(tour.data.tip.side, 'none')
  assert.deepEqual([tour.data.last, tour.data.nextText], [true, '开始用'])
  assert.doesNotMatch(readComponentWxml('tour'), /\{\{[^}]*</, '文字里不用 < 比较（真机编译不认）')
  tour.next()
  assert.deepEqual(tour.events.pop(), ['done', { skipped: false }])
  // 跳过
  const again = loadComponent('tour', wx, { steps })
  again.setData({ show: true })
  again.skip()
  assert.deepEqual(again.events.pop(), ['done', { skipped: true }])
  // 要滚的：先滚过去，过一会儿再量
  const clock = manualClock()
  const scroll = loadComponent('tour', wx, { steps: [{ selector: '#a', scroll: true, title: '滚', text: '滚过去' }] })
  scroll.clock = clock
  scroll.setData({ show: true })
  assert.deepEqual(wx.log.scrolls, ['#a'])
  assert.equal(scroll.data.ready, false)
  scroll.next() // 还没量好，点了不算
  assert.equal(scroll.data.i, 0)
  clock.advance(400)
  assert.equal(scroll.data.ready, true)
})

test('首页导览：建好档第一次进首页过一会儿开始，圈「下一顿」、暖豆、热量、营地 tab；看完记住，再进来不出来', async (t) => {
  fixDate(t, '2026-11-01T12:10:00+08:00')
  const { main, wx } = await app()
  await main({ action: 'profile.save', data: PROFILE })
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.tourShow, false)
  today.clock.advance(700)
  assert.equal(today.data.tourShow, true)
  assert.deepEqual(today.data.tourSteps.map((s) => s.selector || (s.tab != null ? `tab${s.tab}` : '')), ['#tour-next', '#tour-ring', '#tour-beans', 'tab1', ''])
  const wxml = readWxml('today')
  ;['tour-next', 'tour-beans', 'tour-ring'].forEach((id) => assert.match(wxml, new RegExp(`id="${id}"`)))
  assert.match(wxml, /<tour steps="\{\{tourSteps\}\}" show="\{\{tourShow\}\}" bind:done="onTourDone"/)
  today.onTourDone()
  assert.equal(today.data.tourShow, false)
  global.wx = wx
  assert.equal(seen('today'), true)
  today.onHide()
  today.onShow()
  await settle()
  today.clock.advance(2000)
  assert.equal(today.data.tourShow, false)
  today.onHide()
})

test('营地导览：先看欢迎卡（第一步改成「点锅放进去煮上」），关了再圈锅、扭蛋、背包、住户、商店、图册；看过不再出来', async (t) => {
  fixDate(t, '2026-11-01T10:10:00+08:00')
  const { main, wx } = await app()
  await main({ action: 'profile.save', data: PROFILE })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  assert.ok(camp.data.welcome)
  camp.clock.advance(2000)
  assert.equal(camp.data.tourShow, false, '欢迎卡还开着')
  camp.closeWelcome()
  camp.clock.advance(900)
  assert.equal(camp.data.tourShow, true)
  const wxml = readWxml('camp')
  TOURS.camp.filter((s) => s.selector.startsWith('#')).forEach((s) => assert.match(wxml, new RegExp(`id="${s.selector.slice(1)}"`)))
  assert.match(wxml, /class="pot-hit"/)
  assert.match(wxml, /点锅放进去煮上/)
  camp.onTourDone()
  global.wx = wx
  assert.equal(seen('camp'), true)
  camp.onHide()
  camp.onShow()
  await settle()
  camp.clock.advance(2000)
  assert.equal(camp.data.tourShow, false)
  camp.onUnload()
})

test('使用说明：数字都从规则里来（准时 15 / 不准时 5 / 吃得好 5 / 三顿准时 15，一天最多 75；扭蛋 30；12 只）；饭点按她设的；能再看一遍导览', () => {
  assert.equal(DAY_MAX, 75)
  const sections = manualSections({ breakfast: '07:00', lunch: '12:00', dinner: '18:30' })
  const text = sections.map((s) => s.lines.join('')).join('')
  assert.match(text, /准时拍一顿得 15 暖豆，不在饭点拍得 5 暖豆/)
  assert.match(text, /一天最多 75 暖豆/)
  assert.match(text, /30 暖豆抽一样/)
  assert.match(text, /一共 12 只/)
  assert.match(text, /晚饭 17:30～19:30/)
  assert.ok(sections.every((s) => s.title && s.lines.length && (s.icon || s.emoji)))
  const wx = createWx(async () => ({ ok: true, data: null }))
  wx.storage = { toursSeen: { today: true, camp: true } }
  const page = loadPage('manual', wx)
  page.onLoad()
  assert.equal(page.data.sections.length, sections.length)
  page.replayTour()
  assert.equal(wx.storage.toursSeen, undefined)
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/today/today'])
  assert.match(readWxml('manual'), /bindtap="replayTour"/)
})

test('首页导览的字：每一步都有标题和说明，最后一步按钮写「开始用」；营地最后写「去玩吧」', () => {
  ;[TOURS.today, TOURS.camp].forEach((steps) => steps.forEach((s) => assert.ok(s.title && s.text)))
  assert.equal(TOURS.today[TOURS.today.length - 1].done, '开始用')
  assert.equal(TOURS.camp[TOURS.camp.length - 1].done, '去玩吧')
})
