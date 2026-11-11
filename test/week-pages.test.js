// test/week-pages.test.js：补签卡、每周小结、晚饭后自动出今日总结在页面上的样子（规则的单测在 services-forest.test.js、week.test.js）
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const { patchCard, weekCard, weekView } = require('../miniprogram/utils/week')

const PROFILE = { nickname: '阿芳', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }

// 在某一天的某个钟点打一顿卡
async function mealAt(t, main, when, mealType) {
  fixDate(t, when)
  const res = await main({ action: 'meal.analyze', data: { mealType, note: '米饭青菜' } })
  assert.equal(res.ok, true)
  return res.data
}

async function app(replies = 30) {
  const cloud = createFakeCloud({ replies: Array.from({ length: replies }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  return { cloud, main, wx: createWx(main) }
}

function openToday(wx) {
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  return today
}

test('patchCard：够暖豆给按钮，不够只说一声；点过「算了」的那天不再出', () => {
  const offer = { date: '2026-10-21', streak: 4, left: 2, cost: 80, can: true }
  const card = patchCard(offer, '')
  assert.equal(card.title, '昨天漏了一天，连续 4 天要断了')
  assert.equal(card.sub, '用 80 暖豆补上昨天，接着连（这个月还能补 2 次）')
  assert.equal(card.button, '用 80 暖豆补上')
  assert.equal(patchCard({ ...offer, can: false }, '').can, false)
  assert.match(patchCard({ ...offer, can: false }, '').sub, /现在还不够/)
  assert.equal(patchCard(offer, '2026-10-21'), null)
  assert.ok(patchCard(offer, '2026-10-20'), '以前藏过的是另一天')
  assert.equal(patchCard(null, ''), null)
})

test('weekCard：周一到周三提上周的小结；看过的、还没打过卡的不提', () => {
  // 2026-10-19 是周一
  assert.deepEqual(weekCard('2026-10-19', '', true), { start: '2026-10-12', title: '上周的小结出来了', sub: '打卡几天、准时几顿、吃得怎么样' })
  assert.equal(weekCard('2026-10-21', '', true).start, '2026-10-12')
  assert.equal(weekCard('2026-10-22', '', true), null, '周四不提了')
  assert.equal(weekCard('2026-10-19', '2026-10-12', true), null)
  assert.ok(weekCard('2026-10-19', '2026-10-05', true), '看过的是更早的一周')
  assert.equal(weekCard('2026-10-19', '', false), null)
})

test('今日页补签卡：昨天漏了给一张卡，问一句、花暖豆补上，连续天数接上；「算了」记住这一天', async (t) => {
  const { cloud, main, wx } = await app()
  fixDate(t, '2026-10-17T08:00:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  // 10/17 ～ 10/20 每天三顿准时，10/21 漏了，10/22 来看
  for (const day of ['17', '18', '19', '20']) {
    await mealAt(t, main, `2026-10-${day}T07:30:00+08:00`, 'breakfast')
    await mealAt(t, main, `2026-10-${day}T12:00:00+08:00`, 'lunch')
    await mealAt(t, main, `2026-10-${day}T18:00:00+08:00`, 'dinner')
  }
  fixDate(t, '2026-10-22T10:00:00+08:00')
  const today = openToday(wx)
  await settle()
  assert.equal(today.data.patch.title, '昨天漏了一天，连续 4 天要断了')
  assert.equal(today.data.patch.can, true)

  today.hidePatch()
  assert.equal(today.data.patch, null)
  assert.equal(wx.getStorageSync('patchHidden'), '2026-10-21')
  today.onShow()
  await settle()
  assert.equal(today.data.patch, null, '点过算了，回来也不出')

  wx.removeStorageSync('patchHidden')
  today.onShow()
  await settle()
  today.usePatch()
  await settle()
  assert.match(wx.log.modals.at(-1), /花 80 暖豆补上昨天/)
  assert.equal(wx.log.toasts.at(-1), '补上了，已连续 5 天')
  assert.equal(today.data.patch, null)
  assert.equal(today.data.daily.streakText.startsWith('已连续 5 天'), true)
  assert.equal(cloud.db.collections.get('gardens').get('u1').days['2026-10-21'], 'patch')
  today.onHide()
  const wxml = readWxml('today')
  assert.match(wxml, /<view wx:if="\{\{patch\}\}" class="card patch/)
  assert.match(wxml, /bindtap="usePatch"/)
})

test('今日页：晚饭拍好了、还没有总结，小暖自己写一份（一天只试一次）；没拍晚饭不写', async (t) => {
  const { cloud, main, wx } = await app(0)
  fixDate(t, '2026-10-22T08:00:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  cloud.reply(analysisJson())
  await mealAt(t, main, '2026-10-22T12:00:00+08:00', 'lunch')
  let today = openToday(wx)
  await settle()
  assert.equal(today.data.view.summary, null)
  assert.equal(cloud.aiCalls.length, 1, '只有午饭：不写总结')
  today.onHide()

  cloud.reply(analysisJson())
  await mealAt(t, main, '2026-10-22T18:00:00+08:00', 'dinner')
  cloud.reply('今天吃得很规律，明天继续。')
  today = openToday(wx)
  await settle()
  assert.equal(today.data.view.summary.text, '今天吃得很规律，明天继续。')
  assert.equal(today.data.summarizing, false)
  const calls = cloud.aiCalls.length
  today.onShow()
  await settle()
  assert.equal(cloud.aiCalls.length, calls, '有总结了，不再写')
  today.onHide()
})

test('今日页：自动总结没写出来不打扰，同一天不再自动试；按钮照样能点', async (t) => {
  const { cloud, main, wx } = await app(0)
  fixDate(t, '2026-10-22T08:00:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  cloud.reply(analysisJson())
  await mealAt(t, main, '2026-10-22T18:00:00+08:00', 'dinner')
  cloud.reply(new Error('down'))
  const today = openToday(wx)
  await settle()
  assert.equal(today.data.view.summary, null)
  assert.equal(today.data.summarizing, false)
  assert.equal(wx.log.modals.length + wx.log.toasts.length, 0, '没有弹任何提示')
  const calls = cloud.aiCalls.length
  today.onShow()
  await settle()
  assert.equal(cloud.aiCalls.length, calls)
  cloud.reply('补上的总结。')
  today.generateSummary()
  await settle()
  assert.equal(today.data.view.summary.text, '补上的总结。')
  today.onHide()
})

test('今日页周一的小结卡 → 小结页：四个数、七根柱子、小暖的话；左右换周；看过就不再提', async (t) => {
  const { main, wx } = await app()
  fixDate(t, '2026-10-12T07:00:00+08:00')
  await main({ action: 'profile.save', data: PROFILE })
  await mealAt(t, main, '2026-10-12T07:30:00+08:00', 'breakfast')
  await mealAt(t, main, '2026-10-12T12:00:00+08:00', 'lunch')
  await mealAt(t, main, '2026-10-12T18:00:00+08:00', 'dinner')
  await mealAt(t, main, '2026-10-14T14:30:00+08:00', 'lunch')
  fixDate(t, '2026-10-19T09:00:00+08:00')
  const today = openToday(wx)
  await settle()
  assert.equal(today.data.weekCard.title, '上周的小结出来了')
  today.goWeek()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/week/week?offset=1'])
  today.onHide()

  const page = loadPage('week', wx)
  page.onLoad({ offset: '1' })
  await settle()
  const v = page.data.view
  assert.deepEqual([v.title, v.label, v.empty], ['上一周', '10月12日～10月18日', false])
  assert.deepEqual(v.tiles.map((x) => [x.label, x.num, x.unit]), [['打卡', '2', '/ 7 天'], ['准时', '3', '顿'], ['日均热量', '690', '千卡'], ['得了', '85', '暖豆']])
  assert.deepEqual(v.bars.map((b) => b.weekday).join(''), '一二三四五六日')
  assert.deepEqual(v.bars.map((b) => b.kcalText), ['690', '—', '230', '—', '—', '—', '—'])
  assert.ok(v.bars[0].h > v.bars[2].h && v.bars[2].h >= 4)
  assert.equal(v.bars[1].h, 0)
  assert.ok(v.budgetAt > 0 && v.budgetAt < 100)
  assert.equal(v.bars[0].stamps.length, 3)
  assert.match(v.lines[0].text, /打了 2 天卡/)
  assert.match(v.goal, /小目标/)
  assert.equal(wx.getStorageSync('weekSeen'), '2026-10-12')

  page.newer()
  await settle()
  assert.deepEqual([page.data.view.title, page.data.view.newer], ['这一周', null])
  assert.equal(page.data.view.empty, true)
  assert.equal(page.data.view.emptyText, '这一周还没有打卡，拍一顿就有了')
  page.newer()
  await settle()
  assert.equal(page.data.view.title, '这一周', '没有更新的一周了')
  page.older()
  await settle()
  page.older()
  await settle()
  assert.deepEqual([page.data.view.title, page.data.view.label], ['往前的一周', '10月5日～10月11日'])
  page.goCalendar()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/forest/forest'])

  // 看过了：首页那张卡不再出
  const again = openToday(wx)
  await settle()
  assert.equal(again.data.weekCard, null)
  again.onHide()
  const wxml = readWxml('week')
  assert.match(wxml, /wx:for="\{\{view.bars\}\}"/)
  assert.match(wxml, /style="bottom: \{\{view.budgetAt\}\}%"/)
})

test('weekView：超预算的柱子标出来，今天和没到的日子有标记，补签的那天写「补」', () => {
  const day = (over) => ({ date: 'd', weekday: '一', future: false, today: false, kcal: over ? 2000 : 900, over, stamps: [], logged: 1, onTime: 1, beans: 15, patched: false })
  const v = weekView({
    offset: 0, start: '2026-10-19', label: '10月19日～10月25日', current: true, empty: false, older: 1, newer: null, lines: [], goal: '',
    stats: { days: 4, daysLogged: 2, mainMeals: 2, onTime: 2, beans: 30, fullDays: 0, avgKcal: 0, overDays: 1, dailyKcal: 1400, ratings: {} },
    days: [day(true), day(false), { ...day(false), kcal: 0, patched: true }, { ...day(false), kcal: 0, today: true }, { ...day(false), kcal: 0, future: true }, { ...day(false), kcal: 0, future: true }, { ...day(false), kcal: 0, future: true }],
  })
  assert.deepEqual(v.bars.map((b) => b.cls), ['wk-bar-over', '', '', '', '', '', ''])
  assert.deepEqual(v.bars.map((b) => b.kcalText), ['2000', '900', '补', '—', '', '', ''])
  assert.equal(v.bars[0].h, 100)
  assert.equal(v.budgetAt, 70)
  assert.equal(v.bars[3].colCls, ' wk-col-today')
  assert.equal(v.bars[4].colCls, 'wk-col-future')
  assert.deepEqual(v.tiles[2], { key: 'kcal', num: '—', unit: '', label: '日均热量' })
})

test('打卡日历：补签的那天格子里写「补」，点开说是补上的；有每周小结的入口', async (t) => {
  const { buildCalendarCells } = require('../miniprogram/utils/view')
  const cells = buildCalendarCells([{ date: '2026-10-01', day: 1, future: false, stamps: [], beans: 0, onTime: 0, patched: true, mealsCount: 0, kcal: 0 }], 4, '2026-10-22')
  const cell = cells.find((c) => c.date === '2026-10-01')
  assert.equal(cell.beansText, '补')
  const { wx } = await app()
  fixDate(t, '2026-10-22T10:00:00+08:00')
  const forest = loadPage('forest', wx)
  forest.goWeek()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/week/week?offset=1'])
  assert.match(readWxml('forest'), /bindtap="goWeek"/)
  assert.match(readWxml('profile'), /bindtap="goWeek"/)
})
