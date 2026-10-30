// 份量算准（docs/superpowers/plans/2026-10-29-portions.md）：结果页每道菜一行，点一道菜在抽屉里拖滑杆改份量；打卡页的拍照小贴士
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, loadComponent, settle, event, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')

const PROFILE = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }
const DISHES = [
  { name: '米饭', portion: '一碗', grams: 150, kcal: 174, protein: 3.9, carbs: 38.9, fat: 0.5 },
  { name: '青菜', portion: '半盘', grams: 120, kcal: 70, protein: 2.5, carbs: 4, fat: 5 },
]

async function openMeal(t, replies = [analysisJson({ foods: DISHES })]) {
  fixDate(t, '2026-10-22T12:10:00+08:00')
  const cloud = createFakeCloud({ replies })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: PROFILE })
  const meal = await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭青菜' } })
  const wx = createWx(main)
  const page = loadPage('meal', wx)
  page.clock = manualClock()
  page.onLoad({ id: meal.data._id })
  await settle()
  return { cloud, main, wx, page, mealId: meal.data._id }
}

test('结果页：每道菜一行「一碗 · 约 150 克」「174 千卡」，没改过不写改过', async (t) => {
  const { page } = await openMeal(t)
  assert.equal(page.data.meal.kcalText, '约 244 千卡')
  assert.deepEqual(page.data.meal.dishes.map((d) => [d.name, d.sub, d.kcalText]), [
    ['米饭', '一碗 · 约 150 克', '174 千卡'],
    ['青菜', '半盘 · 约 120 克', '70 千卡'],
  ])
  assert.equal(page.data.meal.adjustedText, '')
  const wxml = readWxml('meal')
  assert.match(wxml, /<slider-bar [^>]*bindchanging="onPortionSliding" bindchange="onPortionSlide"/)
  assert.match(wxml, /<sheet show="\{\{adjustShow\}\}"/)
})

test('点米饭：抽屉打开、滑杆按克数；拖的时候大字跟着算热量，滑杆的值不回写；松手、快捷按钮定下来', async (t) => {
  const { page } = await openMeal(t)
  page.openDish(event({ index: 0 }))
  assert.equal(page.data.adjustShow, true)
  const adj = page.data.adjust
  assert.equal(adj.title, '米饭吃了多少？')
  assert.deepEqual([adj.min, adj.max, adj.step, adj.value, adj.unit], [10, 400, 10, 150, ' 克'])
  assert.equal(adj.preview, '约 150 克 · 174 千卡')

  page.onPortionSliding(event({}, { value: 110 }))
  assert.equal(page.data.adjust.preview, '约 110 克 · 128 千卡')
  assert.equal(page.data.adjust.value, 150)
  page.onPortionSlide(event({}, { value: 120 }))
  assert.equal(page.data.adjust.value, 120)
  assert.equal(page.data.adjust.preview, '约 120 克 · 139 千卡')
  page.pickPortion(event({ value: 80 }))
  assert.equal(page.data.adjust.value, 80)
  assert.equal(page.data.adjust.preview, '约 80 克 · 93 千卡')
})

test('就这么多：改好存下，热量从原来的滚到新的，写上「小暖原来估」，抽屉关上；她家常用份量记下了', async (t) => {
  const { cloud, wx, page } = await openMeal(t)
  page.openDish(event({ index: 0 }))
  page.onPortionSlide(event({}, { value: 110 }))
  page.saveAdjust()
  await settle()
  assert.equal(page.data.adjustShow, false)
  assert.equal(page.data.meal.analysis.totalKcal, 198)
  assert.equal(page.data.meal.kcalText, '约 244 千卡')
  page.clock.advance(1000)
  assert.equal(page.data.meal.kcalText, '约 198 千卡')
  assert.equal(page.data.meal.adjustedText, '份量按你说的改过（小暖原来估 244 千卡）')
  assert.deepEqual(page.data.meal.dishes[0], { index: 0, name: '米饭', sub: '一碗 · 约 110 克', kcalText: '128 千卡', adjusted: true })
  assert.deepEqual(wx.log.toasts, ['改好了'])
  assert.equal(cloud.db.collections.get('portions').get('u1').items['米饭'].grams, 110)
  page.onUnload()
  assert.equal(page.clock.count(), 0)
})

test('没动就点「就这么多」：不发请求，直接关上', async (t) => {
  const { cloud, page } = await openMeal(t)
  page.openDish(event({ index: 1 }))
  page.saveAdjust()
  await settle()
  assert.equal(page.data.adjustShow, false)
  assert.equal((cloud.db.collections.get('portions') || new Map()).get('u1'), undefined)
  assert.equal(page.data.meal.analysis.totalKcal, 244)
})

test('这道没吃：问一句，去掉这道菜；只剩一道时再去掉会提示删整条打卡', async (t) => {
  const { wx, page } = await openMeal(t)
  page.openDish(event({ index: 1 }))
  page.removeDish()
  await settle()
  page.clock.advance(1000)
  assert.equal(wx.log.modals[0], '这道菜从这顿里去掉，热量也减掉')
  assert.deepEqual(page.data.meal.dishes.map((d) => d.name), ['米饭'])
  assert.equal(page.data.meal.kcalText, '约 174 千卡')
  assert.deepEqual(wx.log.toasts, ['去掉了'])

  page.openDish(event({ index: 0 }))
  page.removeDish()
  await settle()
  assert.match(wx.log.modals.at(-1), /删掉整条打卡/)
  assert.equal(page.data.working, false)
  assert.equal(page.data.adjustShow, true)
})

test('老打卡没克数：滑杆按倍数，「原来的 1.5 倍」', async (t) => {
  const { page } = await openMeal(t, [analysisJson({ foods: [{ name: '炒菜', portion: '一盘', kcal: 300 }] })])
  page.openDish(event({ index: 0 }))
  assert.deepEqual([page.data.adjust.mode, page.data.adjust.min, page.data.adjust.max, page.data.adjust.value, page.data.adjust.prefix], ['factor', 0.25, 3, 1, '×'])
  assert.equal(page.data.adjust.preview, '和原来一样 · 300 千卡')
  page.onPortionSlide(event({}, { value: 1.5 }))
  assert.equal(page.data.adjust.preview, '原来的 1.5 倍 · 450 千卡')
  page.saveAdjust()
  await settle()
  page.clock.advance(1000)
  assert.equal(page.data.meal.kcalText, '约 450 千卡')
})

test('分析失败、不是食物的打卡点不开', async (t) => {
  const { page } = await openMeal(t, [JSON.stringify({ isFood: false, comment: '一只猫' })])
  page.openDish(event({ index: 0 }))
  assert.equal(page.data.adjustShow, false)
  assert.ok(!page.data.meal.dishes)
})

test('打卡页：拍照框里四条小贴士', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  wx.app.globalData.mealTimes = null
  const page = loadPage('checkin', wx)
  page.onLoad({})
  assert.deepEqual(page.data.photoTips.map((x) => x.text), ['从斜上方拍，像坐着看饭桌', '所有菜都拍进去', '旁边放双筷子或勺子', '吃之前拍'])
  assert.match(readWxml('checkin'), /wx:for="\{\{photoTips\}\}"/)
})

// ---------------------------------------------------------------- 几个人一起吃

const HOTPOT = [
  { name: '米饭', portion: '一碗', grams: 150, kcal: 174, shared: false },
  { name: '火锅', portion: '一锅', grams: 1500, kcal: 1500, shared: true },
]

test('「几个人一起吃？」那一排（components/people）：就我、2～5 人、更多弹出 6 / 7 / 8 / 10；点了发 change，和现在一样的不发', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  const pick = loadComponent('people', wx, { value: 1 })
  assert.deepEqual(pick.data.chips.map((c) => [c.label, c.on]), [['就我', true], ['2 人', false], ['3 人', false], ['4 人', false], ['5 人', false], ['更多', false]])
  pick.onTap(event({ value: 1 }))
  assert.deepEqual(pick.events, [])
  pick.onTap(event({ value: 5 }))
  assert.deepEqual(pick.events.pop(), ['change', { value: 5 }])
  wx.actionSheetChoice = 2
  pick.onTap(event({ value: 'more' }))
  assert.deepEqual(pick.events.pop(), ['change', { value: 8 }])
  // 页面改了 value：那一格亮、「更多」写人数
  pick.setData({ value: 8 })
  assert.deepEqual(pick.data.chips.slice(-1)[0], { value: 'more', label: '8 人', on: true })
  pick.onTap(event({ value: 'more' }))
  assert.deepEqual(pick.events, [], '又选了 8 人')
  // 一开始就是 4 个人（结果页打开时已经分过）：那一格亮
  const four = loadComponent('people', wx, { value: 4 })
  four.attach()
  assert.equal(four.data.chips.find((c) => c.on).label, '4 人')
})

test('打卡页「几个人一起吃？」：默认就我；选了 5 人，交给小暖时带着人数', async (t) => {
  fixDate(t, '2026-10-22T18:10:00+08:00')
  const cloud = createFakeCloud({ replies: [analysisJson({ foods: HOTPOT })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: PROFILE })
  const wx = createWx(main)
  const page = loadPage('checkin', wx)
  page.onLoad({})
  assert.equal(page.data.people, 1)
  page.onPeople(event({}, { value: 8 }))
  assert.equal(page.data.people, 8)
  page.onPeople(event({}, { value: 5 }))
  page.onNote(event({}, { value: '火锅' }))
  page.submit()
  await settle()
  const mealId = wx.log.nav.pop()[1].split('id=')[1]
  const meal = await main({ action: 'meal.get', data: { mealId } })
  assert.equal(meal.data.people, 5)
  assert.match(JSON.stringify(cloud.aiCalls[0].messages), /5 个人一起吃/)
  assert.match(readWxml('checkin'), /<people-pick value="\{\{people\}\}" bind:change="onPeople"/)
  assert.match(readWxml('meal'), /<people-pick value="\{\{meal.people \|\| 1\}\}" bind:change="onPeople"/)
})

test('结果页改人数：火锅按 5 个人分、米饭不动，热量滚到新数，写「5 个人一起吃，算的是你那一份」；点火锅的抽屉里「全部」是整锅', async (t) => {
  const { page, wx } = await openMeal(t, [analysisJson({ foods: HOTPOT })])
  assert.equal(page.data.meal.people, 1)
  page.onPeople(event({}, { value: 5 }))
  await settle()
  page.clock.advance(1000)
  assert.equal(page.data.meal.people, 5)
  assert.equal(page.data.meal.kcalText, '约 474 千卡')
  assert.equal(page.data.peopleText, '5 个人一起吃，算的是你那一份')
  assert.deepEqual(page.data.meal.dishes.map((d) => d.sub), ['一碗 · 约 150 克', '一锅 · 你那份约 300 克'])
  assert.equal(wx.log.toasts.pop(), '按 5 个人算好了')
  page.openDish(event({ index: 1 }))
  assert.equal(page.data.adjust.parts[0].value, 1500)
  page.pickPortion(event({ value: page.data.adjust.parts[4].value }))
  assert.equal(page.data.adjust.preview, '约 300 克 · 300 千卡')
  // 改回就我：回到原来的
  page.closeAdjust()
  page.onPeople(event({}, { value: 1 }))
  await settle()
  page.clock.advance(1000)
  assert.equal(page.data.meal.kcalText, '约 1674 千卡')
  assert.equal(page.data.peopleText, '')
})
