// 页面冒烟测试：没有微信开发者工具时，至少保证页面逻辑能跑通、WXML 引用的东西都存在
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, loadComponent, settle, event, readWxml, readComponentWxml, checkTags, boundHandlers, referencedRoots } = require('./helpers/page-harness')
const { SCENE } = require('../miniprogram/utils/shared/camp')
const V = require('../miniprogram/utils/camp-view')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')

const PAGES = ['today', 'camp', 'gacha', 'shop', 'album', 'forest', 'checkin', 'meal', 'weight', 'profile']

test('app.json 里的页面文件和 tabBar 图标都存在', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '../miniprogram')
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.deepEqual(app.pages.map((p) => p.split('/')[1]).sort(), [...PAGES].sort())
  for (const page of app.pages) {
    for (const ext of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(root, `${page}.${ext}`)), `缺少 ${page}.${ext}`)
    }
  }
  for (const tab of app.tabBar.list) {
    assert.ok(app.pages.includes(tab.pagePath), `tab 页面 ${tab.pagePath} 不在 pages 里`)
    assert.ok(fs.existsSync(path.join(root, tab.iconPath)), `缺少 ${tab.iconPath}`)
    assert.ok(fs.existsSync(path.join(root, tab.selectedIconPath)), `缺少 ${tab.selectedIconPath}`)
  }
  assert.equal(app.pages[0], 'pages/today/today')
  assert.deepEqual(app.tabBar.list.map((t) => t.text), ['今日', '营地', '体重', '我的'])
})

for (const name of PAGES) {
  test(`${name}.wxml：标签配对、事件处理函数存在、变量都在 data 里`, () => {
    const wxml = readWxml(name)
    assert.deepEqual(checkTags(wxml), [])

    const page = loadPage(name, createWx(async () => ({ ok: true, data: null })))
    for (const handler of boundHandlers(wxml)) {
      assert.equal(typeof page[handler], 'function', `${name} 缺少处理函数 ${handler}`)
    }
    for (const root of referencedRoots(wxml)) {
      assert.ok(root in page.data || root === 'item' || root === 'index', `${name}.wxml 引用了 data 里没有的 ${root}`)
    }
  })
}

const COMPONENTS = ['medal', 'celebrate']

for (const name of COMPONENTS) {
  test(`组件 ${name}：标签配对、事件处理函数存在、变量都在属性 / data 里`, () => {
    const wxml = readComponentWxml(name)
    assert.deepEqual(checkTags(wxml), [])
    const comp = loadComponent(name, createWx(async () => ({ ok: true, data: null })))
    for (const handler of boundHandlers(wxml)) {
      assert.equal(typeof comp[handler], 'function', `${name} 缺少处理函数 ${handler}`)
    }
    for (const root of referencedRoots(wxml)) {
      assert.ok(root in comp.data || root === 'item' || root === 'index', `${name}.wxml 引用了没有的 ${root}`)
    }
  })
}

test('页面和组件注册的自定义组件文件都在', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '../miniprogram')
  const jsons = PAGES.map((p) => `pages/${p}/${p}.json`).concat(COMPONENTS.map((c) => `components/${c}/${c}.json`))
  for (const file of jsons) {
    const using = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).usingComponents || {}
    for (const [tag, ref] of Object.entries(using)) {
      for (const ext of ['js', 'json', 'wxml', 'wxss']) {
        assert.ok(fs.existsSync(path.join(root, `${ref}.${ext}`)), `${file} 的 ${tag} 缺少 ${ref}.${ext}`)
      }
    }
  }
  for (const c of COMPONENTS) {
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, `components/${c}/${c}.json`), 'utf8')).component, true)
  }
})

const MILESTONE_VIEW = { days: 7, tier: 'bronze', glow: false, title: '连续打卡 7 天！', sub: '', line: '一周都没落下，身体会记得的', image: '/images/camp/pets/doudou.png' }

test('庆祝组件：burst 播完自己关；milestone 中等震动、点「收下」关掉、不留定时器；拿不到 canvas 也不出错', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  const burst = loadComponent('celebrate', wx, { mode: 'burst' })
  burst.clock = manualClock()
  burst.attach()
  burst.clock.advance(1300)
  assert.deepEqual(burst.events, [])
  burst.clock.advance(200)
  assert.deepEqual(burst.events, [['close', {}]])

  const card = loadComponent('celebrate', wx, { mode: 'milestone', milestone: MILESTONE_VIEW })
  card.clock = manualClock()
  card.attach()
  card.clock.advance(500)
  assert.deepEqual(wx.log.vibrations, ['medium'])
  card.close()
  assert.deepEqual(card.events, [['close', {}]])
  assert.equal(card.clock.count(), 0)
  card.detach()
})

test('完整使用流程：建档 → 打卡 → 详情 → 重新分析 → 删除 → 总结 → 体重', async (t) => {
  fixDate(t, '2026-10-22T12:10:00+08:00')
  const cloud = createFakeCloud({
    replies: [
      analysisJson({ totalKcal: 520, comment: '搭配不错' }),
      analysisJson({ totalKcal: 300, comment: '这次估得更准了' }),
      analysisJson({ totalKcal: 400 }),
      '今天吃得很规律，明天早餐加个鸡蛋。',
    ],
  })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)

  // 1. 第一次打开：今日页发现没有档案，跳去建档
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/profile/profile'])

  // 2. 建档
  const profile = loadPage('profile', wx)
  profile.onShow()
  await settle()
  assert.equal(profile.data.isNew, true)
  for (const [field, value] of Object.entries({ nickname: '妈妈', age: '50', heightCm: '160', weightKg: '70', targetWeightKg: '60' })) {
    profile.onInput(event({ field }, { value }))
  }
  profile.onPick(event({ field: 'activity', value: 'light' }))
  assert.equal(profile.data.previewKcal, 1270)
  assert.deepEqual(profile.data.form.mealTimes, { breakfast: '07:30', lunch: '12:00', dinner: '18:00' })
  profile.onMealTime(event({ mealType: 'breakfast' }, { value: profile.data.mealRows[0].options.indexOf('07:00') }))
  assert.equal(profile.data.form.mealTimes.breakfast, '07:00')
  assert.equal(profile.data.mealRows[0].value, '07:00')
  profile.save()
  await settle()
  assert.equal(profile.data.isNew, false)
  assert.ok(wx.log.toasts.includes('保存好了'))
  assert.equal(wx.app.globalData.mealTimes.breakfast, '07:00')

  // 3. 打卡：拍照 + 备注
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.pickMealType(event({ value: 'lunch' }))
  assert.equal(checkin.data.timingText, '现在拍午饭：准时 ✓')
  assert.equal(checkin.data.timingOn, true)
  checkin.choosePhoto()
  checkin.onNote(event({}, { value: '米饭吃了一半' }))
  checkin.submit()
  await settle()
  const [kind, url] = wx.log.nav.pop()
  assert.equal(kind, 'redirectTo')
  const mealId = url.split('id=')[1]
  assert.ok(mealId)
  assert.match(wx.log.uploads[0].cloudPath, /^meals\/\d{4}-\d{2}-\d{2}\/\d+-\w+\.jpg$/)

  // 4. 详情页（刚打完卡：盖章、数字滚到位）
  assert.ok(readWxml('meal').includes('回到营地'))
  const meal = loadPage('meal', wx)
  meal.clock = manualClock()
  meal.onLoad({ id: mealId })
  await settle()
  meal.clock.advance(3000)
  assert.equal(meal.data.meal.kcalText, '约 520 千卡')
  assert.equal(meal.data.meal.label, '午餐')
  assert.equal(meal.data.note, '米饭吃了一半')
  assert.equal(meal.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(meal.data.gain.stamps[1].cls, 'stamp-green stamp-on fx-stamp')
  assert.equal(meal.data.gain.bonus, '')
  assert.equal(wx.app.globalData.lastGain, null)
  assert.deepEqual(wx.log.vibrations, ['light'])

  // 5. 估得不准 → 补充描述重新分析
  meal.startEdit()
  meal.onNote(event({}, { value: '米饭只吃了三分之一' }))
  meal.reanalyze()
  await settle()
  assert.equal(meal.data.meal.kcalText, '约 300 千卡')
  assert.equal(meal.data.editing, false)
  assert.equal(meal.data.gain.title, '这顿记下啦')

  // 6. 今日页展示
  today.onShow()
  await settle()
  today.clock.advance(1000)
  assert.equal(today.data.view.totals.kcal, 300)
  assert.equal(today.data.view.meals.length, 1)
  assert.equal(today.data.daily.title, '今天得了 20 暖豆')
  assert.equal(today.data.daily.hint, '下一顿晚饭 17:00～19:00 拍算准时')
  assert.equal(today.data.card.title, '午饭准时拍了 ✓')
  assert.equal(today.data.card.sub, '下一顿：晚饭 18:00')
  assert.equal(wx.app.globalData.mealTimes.lunch, '12:00')
  assert.equal(today.data.daily.streakText, '🔥 已连续 1 天 · 再 2 天拿 3 天纪念章')
  today.goGarden()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/camp/camp'])
  assert.match(today.data.greeting, /妈妈/)
  today.openMeal(event({ id: mealId }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', `/pages/meal/meal?id=${mealId}`])

  // 7. 只写文字再打一餐，然后生成总结
  const checkin2 = loadPage('checkin', wx)
  checkin2.onLoad()
  checkin2.pickMealType(event({ value: 'dinner' }))
  assert.equal(checkin2.data.timingText, '还没到晚饭时间（17:00～19:00），提前拍也算数')
  checkin2.onNote(event({}, { value: '一碗面条' }))
  checkin2.submit()
  await settle()
  assert.equal(wx.log.nav.pop()[0], 'redirectTo')

  today.onShow()
  await settle()
  today.clock.advance(1000)
  assert.equal(today.data.view.totals.kcal, 700)
  today.generateSummary()
  await settle()
  assert.equal(today.data.view.summary.text, '今天吃得很规律，明天早餐加个鸡蛋。')

  // 8. 删除第一条打卡
  meal.remove()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/today/today'])
  today.onShow()
  await settle()
  assert.equal(today.data.view.meals.length, 1)

  // 9. 打卡日历：午餐删掉了，只剩晚餐 → 一个印章、10 暖豆
  const forest = loadPage('forest', wx)
  forest.onShow()
  await settle()
  assert.equal(forest.data.loaded, true)
  assert.equal(forest.data.daily.title, '今天得了 10 暖豆')
  assert.equal(forest.data.view.totalDays, 1)
  const todayCell = forest.data.cells.find((c) => c.date === today.data.view.date)
  assert.equal(todayCell.beansText, '+10')
  assert.deepEqual(todayCell.stamps.map((s) => s.cls), ['stamp-none', 'stamp-none', 'stamp-green'])
  assert.match(readWxml('forest'), /准时 \{\{view.stats.onTime\}\} 顿/)
  forest.openDay(event({ key: todayCell.key }))
  assert.match(wx.log.modals.pop(), /打卡 1 顿 · 约 \d+ 千卡 · 得了 10 暖豆/)
  forest.prevMonth()
  await settle()
  assert.ok(forest.data.month < todayCell.date.slice(0, 7))
  assert.ok(forest.data.cells.every((c) => c.blank || c.beansText === ''))

  // 10. 体重：建档时已记 70，今天更新为 69.5
  const weight = loadPage('weight', wx)
  weight.onShow()
  await settle()
  assert.equal(weight.data.items.length, 1)
  assert.equal(weight.data.todayRecorded, true)
  assert.match(weight.data.targetText, /还差 10 kg/)
  weight.onInput(event({}, { value: '69.5' }))
  weight.save()
  await settle()
  assert.equal(weight.data.latest.weightKg, 69.5)
  assert.match(weight.data.budgetText, /每日热量预算已调整为 \d+ 千卡/)
  assert.ok(wx.log.toasts.includes('记好了'))
})

test('打卡页：没拍照也没写字时不提交', async () => {
  const wx = createWx(async () => {
    throw new Error('不应该调用云函数')
  })
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.submit()
  await settle()
  assert.equal(checkin.data.submitting, false)
  assert.deepEqual(wx.log.toasts, ['拍张照片或写几句吧'])
})

test('打卡页：从首页带着餐次进来就选好；不在任何饭点时按钟点猜', (t) => {
  fixDate(t, '2026-10-22T15:00:00+08:00')
  const wx = createWx(async () => ({ ok: true, data: null }))
  const fromCard = loadPage('checkin', wx)
  fromCard.onLoad({ mealType: 'lunch' })
  assert.equal(fromCard.data.mealType, 'lunch')
  assert.equal(fromCard.data.timingText, '现在不在午饭时间，补拍也算数')
  const plain = loadPage('checkin', wx)
  plain.onLoad({})
  assert.equal(plain.data.mealType, 'snack')
  assert.equal(plain.data.timingText, '')
  const bad = loadPage('checkin', wx)
  bad.onLoad({ mealType: 'supper' })
  assert.equal(bad.data.mealType, 'snack')
})

const MEAL_FIXTURE = {
  _id: 'm1', mealType: 'lunch', status: 'done', createdAt: 1, note: '',
  analysis: { isFood: true, rating: 'green', totalKcal: 520, protein: 20, carbs: 60, fat: 15, foods: [], comment: '搭配不错' },
}
const LUNCH_STAMPS = [
  { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
  { mealType: 'lunch', label: '午', state: 'green', onTime: true },
  { mealType: 'dinner', label: '晚', state: 'none', onTime: false },
]

function mealPageWith(gain) {
  const wx = createWx(async (req) => (req.action === 'meal.get' ? { ok: true, data: MEAL_FIXTURE } : { ok: true, data: null }))
  if (gain) wx.app.globalData.lastGain = { mealId: 'm1', gain, arrival: null }
  const page = loadPage('meal', wx)
  page.clock = manualClock()
  return { wx, page }
}

test('结果页：刚打完卡数字从 0 滚到位、盖章时轻震；里程碑等前面播完再弹，点「收下」关掉', async () => {
  const { wx, page } = mealPageWith({
    beans: 20, beansToday: 35, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false,
    milestone: { days: 7, times: 1, tier: 'bronze', glow: false, petId: 'doudou' },
  })
  page.onLoad({ id: 'm1' })
  await settle()
  assert.equal(page.data.gain.title, '午饭准时打卡 +0 暖豆')
  assert.equal(page.data.meal.kcalText, '约 0 千卡')
  page.clock.advance(300)
  assert.deepEqual(wx.log.vibrations, ['light'])
  page.clock.advance(1000)
  assert.equal(page.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(page.data.meal.kcalText, '约 520 千卡')
  assert.equal(page.data.celebrate, '')
  page.clock.advance(200)
  assert.equal(page.data.celebrate, 'milestone')
  assert.equal(page.data.milestone.title, '连续打卡 7 天！')
  assert.equal(page.data.milestone.image, '/images/camp/pets/doudou.png')
  page.onCelebrateClose()
  assert.equal(page.data.celebrate, '')
  assert.equal(page.clock.count(), 0)
})

test('结果页：点一下屏幕跳到结束（里程碑马上弹）；三顿都准时撒彩带；看旧打卡不震动、不滚数字', async () => {
  const skip = mealPageWith({
    beans: 20, beansToday: 20, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'lunch', timing: 'on', allOnTime: false,
    milestone: { days: 3, times: 1, tier: 'bronze', glow: false, petId: '' },
  })
  skip.page.onLoad({ id: 'm1' })
  await settle()
  skip.page.skipFx()
  assert.equal(skip.page.data.fxSkip, true)
  assert.equal(skip.page.data.gain.title, '午饭准时打卡 +20 暖豆')
  assert.equal(skip.page.data.meal.kcalText, '约 520 千卡')
  assert.equal(skip.page.data.celebrate, 'milestone')
  assert.equal(skip.page.clock.count(), 0)

  const burst = mealPageWith({ beans: 35, beansToday: 75, hint: 'x', stamps: LUNCH_STAMPS, mealType: 'dinner', timing: 'on', allOnTime: true, milestone: null })
  burst.page.onLoad({ id: 'm1' })
  await settle()
  burst.page.clock.advance(800)
  assert.equal(burst.page.data.celebrate, 'burst')
  burst.page.onCelebrateClose()
  burst.page.onUnload()
  assert.equal(burst.page.clock.count(), 0)

  const old = mealPageWith(null)
  old.page.onLoad({ id: 'm1' })
  await settle()
  assert.equal(old.page.data.meal.kcalText, '约 520 千卡')
  assert.equal(old.page.data.gain, null)
  assert.deepEqual(old.wx.log.vibrations, [])
  assert.equal(old.page.clock.count(), 0)
  old.page.skipFx()
  assert.equal(old.page.data.fxSkip, false)
})

test('打卡日历：纪念章一排（已拿的、还差几天的），点开看第一次的日子；今天那格标出来', async (t) => {
  const clock = fixDate(t, '2026-10-16T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: Array.from({ length: 3 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  for (const d of [16, 17, 18]) {
    clock.set(`2026-10-${d}T08:00:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥' } })
  }
  const wx = createWx(main)
  const forest = loadPage('forest', wx)
  forest.onShow()
  await settle()
  assert.deepEqual(forest.data.badges.map((b) => [b.days, b.got, b.label]), [[3, true, '3 天'], [7, false, '还差 4 天']])
  assert.equal(forest.data.cells.find((c) => c.isToday).date, '2026-10-18')
  forest.openBadge(event({ days: 3 }))
  assert.equal(wx.log.modals.pop(), '第一次 2026年10月18日 · 共 1 次')
  forest.openBadge(event({ days: 7 }))
  assert.equal(wx.log.modals.pop(), '再连续打卡 4 天就能拿到')
})

test('今日页：下一顿大卡跟着时间走，按钮带着餐次去打卡', async (t) => {
  const clock = fixDate(t, '2026-10-22T11:20:00+08:00')
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.card.title, '午饭 · 12:00')
  assert.equal(today.data.card.sub, '11:00～13:00 拍算准时，还剩 1 小时 40 分')
  assert.equal(today.data.daily.hint, '午饭 11:00～13:00 拍算准时，能得 15 暖豆')
  today.goCheckin(event({ mealType: 'lunch' }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin?mealType=lunch'])

  // 过了午饭点：一分钟后自己刷新成「还没拍」
  clock.set('2026-10-22T13:30:00+08:00')
  today.clock.advance(60000)
  assert.equal(today.data.card.title, '午饭还没拍')
  assert.equal(today.data.card.warn, true)
  assert.equal(today.data.daily.hint, '午饭过点了，现在补拍也有 5 暖豆')

  today.onHide()
  assert.equal(today.clock.count(), 0)
})

test('今日页：热量从上次显示的数滚到新数，进度条跟着长；离开页面不留定时器', async (t) => {
  fixDate(t, '2026-10-22T12:10:00+08:00')
  const cloud = createFakeCloud({ replies: [analysisJson({ totalKcal: 520 })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.equal(today.data.view.totals.kcal, 0)
  assert.equal(today.data.view.percent, 0)
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '米饭' } })
  today.onShow()
  await settle()
  assert.equal(today.data.view.totals.kcal, 0)
  today.clock.advance(1000)
  assert.equal(today.data.view.totals.kcal, 520)
  assert.ok(today.data.view.percent > 0)
  today.onHide()
  assert.equal(today.clock.count(), 0)
})

test('打卡页：等小暖时三步走到哪打勾（认菜 6 秒后算热量），出错后清掉', async () => {
  let fail
  const wx = createWx(() => new Promise((resolve) => {
    fail = () => resolve({ ok: false, code: 'AI_FAILED', message: '小暖没看清' })
  }))
  const checkin = loadPage('checkin', wx)
  checkin.clock = manualClock()
  checkin.onLoad({ mealType: 'lunch' })
  checkin.choosePhoto()
  checkin.submit()
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['now', 'todo', 'todo'])
  await settle()
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['done', 'now', 'todo'])
  checkin.clock.advance(6000)
  assert.deepEqual(checkin.data.steps.map((s) => s.state), ['done', 'done', 'now'])
  fail()
  await settle()
  assert.equal(checkin.data.submitting, false)
  assert.equal(checkin.clock.count(), 0)
})

test('云函数报错时页面给出提示：短消息用 toast，长消息用弹窗', async () => {
  const wx = createWx(async () => ({ ok: false, code: 'NO_MEALS', message: '今天还没有打卡，先拍一餐吧' }))
  const today = loadPage('today', wx)
  today.data.view = { summary: null, meals: [] }
  today.generateSummary()
  await settle()
  assert.equal(today.data.summarizing, false)
  assert.deepEqual(wx.log.toasts, ['今天还没有打卡，先拍一餐吧'])

  const wx2 = createWx(async () => {
    throw new Error('errCode: -504003 | errMsg: Invoking task timed out after 3 seconds')
  })
  const today2 = loadPage('today', wx2)
  today2.onShow()
  await settle()
  assert.equal(wx2.log.modals.length, 1)
  assert.match(wx2.log.modals[0], /超时时间调到 60 秒/)
})

test('营地：宠物拼图先下到本地、两张都好了才换上；之后只发变了的数据，回到营地没变的图层不重发（云存储的图重设一次就闪一下）', async () => {
  const config = require('../miniprogram/config')
  const SHEETS = require('../miniprogram/utils/anim-sheets')
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  let seed = 7
  camp.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  camp.onLoad()
  camp.onShow()
  await settle()
  assert.ok(SHEETS.doudou && config.animArt, '豆豆有拼图、填了 animArt')
  assert.deepEqual(wx.log.downloads.slice().sort(), [`${config.animArt}doudou-a.png`, `${config.animArt}doudou-b.png`])
  assert.equal(camp.data.pets[0].sheet, 'wxfile://tmp/doudou-a.png')
  camp.closeWelcome()
  const sent = []
  const setData = camp.setData
  camp.setData = function (patch, cb) {
    sent.push(...Object.keys(patch))
    return setData.call(this, patch, cb)
  }
  camp.clock.advance(30000)
  const petKeys = sent.filter((k) => k.startsWith('pets'))
  assert.ok(petKeys.length > 0, '宠物在动')
  assert.ok(!petKeys.some((k) => /^pets(\[\d+\])?$/.test(k) || /\.(sheet|image|face)$/.test(k)), petKeys.join(' '))
  assert.deepEqual(camp.data.pets, camp.life.sprites(), '只发变了的字段，拼起来和整只一样')
  // 切到别的 tab 再回来：拼图下过了不再下；抠图层、火、食盆、装饰没变就不重发
  sent.length = 0
  camp.onHide()
  camp.onShow()
  await settle()
  assert.equal(wx.log.downloads.length, 2)
  assert.ok(!sent.some((k) => ['cuts', 'fx', 'decor', 'potHit'].indexOf(k) !== -1), sent.join(' '))
  assert.equal(camp.data.pets[0].sheet, 'wxfile://tmp/doudou-a.png')
})

test('营地：宠物和影子用 transform 挪（left / bottom 过渡每帧都要重排重画大画，手机上走起来一直闪）', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = path.join(__dirname, '../miniprogram/pages/camp')
  const wxml = fs.readFileSync(path.join(dir, 'camp.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(dir, 'camp.wxss'), 'utf8')
  const tag = (cls) => wxml.split('\n').find((l) => l.includes(`class="${cls}`))
  ;['shadow', 'pet '].forEach((cls) => {
    const line = tag(cls)
    assert.ok(line, cls)
    assert.match(line, /transform: translate3d\(\{\{item\.(shadow\.)?left\}\}px, \{\{0 - item\.(shadow\.)?bottom\}\}px, 0\)/, cls)
    assert.doesNotMatch(line, /(^|[ ;"])(left|bottom): \{\{/, cls)
  })
  const rule = (sel) => (wxss.match(new RegExp(`(^|\\n)\\${sel} \\{[^}]*\\}`)) || [''])[0]
  ;['.pet', '.shadow'].forEach((sel) => {
    assert.match(rule(sel), /transition-property: transform/, sel)
    assert.match(rule(sel), /will-change: transform/, sel)
  })
})

test('营地：拼图下载失败就一直用单张图', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  wx.failDownloads = true
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  assert.equal(camp.data.pets[0].sheet, '')
  assert.equal(camp.data.pets[0].image, '/images/camp/pets/doudou.png')
})

test('图册：12 只都到齐了封面换成全家福', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  for (const full of [false, true]) {
    const album = { pets: [], progress: { pets: full ? 12 : 3, total: 12 }, full, foods: [], decor: [] }
    const page = loadPage('album', createWx(async () => ({ ok: true, data: album })))
    page.onShow()
    await settle()
    const cover = page.data.pages[0]
    assert.equal(cover.image, full ? '/images/camp/family.jpg' : '/images/garden/ui/book.png')
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'miniprogram', cover.image)))
  }
})

test('暖暖营地首页：欢迎 → 底图 → 下锅点火、客人闻香来 → 打卡后住下 → 喂 → 商店买装饰摆放 → 找它', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })

  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  let seed = 7
  camp.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  camp.onLoad()
  camp.onShow()
  await settle()
  assert.equal(camp.data.loaded, true)
  assert.deepEqual(camp.data.welcome, { beans: 60, petId: 'doudou' })
  assert.equal(camp.data.beans, 60)
  assert.equal(camp.data.base.length, 16)
  assert.ok(camp.data.base[0].image.endsWith('/t00.jpg')) // 白天的日景块（填了 campArt 就是云存储的）
  assert.ok(camp.data.potHit && camp.data.potHit.width > 0)
  assert.deepEqual(camp.data.pets.map((p) => p.id), ['doudou'])
  // 锅是空的、火没点（没有火苗，盖着熄了火的那块）
  assert.ok(!camp.data.fx.some((f) => f.kind === 'fire' || f.kind === 'fireglow' || f.kind === 'ember'))
  assert.ok(camp.data.fx.some((f) => f.kind === 'patch'))
  assert.equal(camp.data.cuts.find((c) => c.key === 'pot').image.split('/').pop().split('.')[0], 'pot-0')
  assert.equal(camp.data.tint, '')
  // 镜头：默认视角营地画铺满屏幕高度的 0.72 倍、篝火在屏幕正中；上下补了天空和草地，捏小到全景（整幅宽度）也盖满屏幕；
  // 排好版后再对准一次（只平移，不动缩放）
  const WIN = { width: 375, height: 700 }
  const home = V.homeView(camp.L, WIN)
  const w = camp.data.world
  assert.deepEqual([w.width, w.height], [504, 504])
  assert.ok(w.worldWidth * w.minScale >= WIN.width - 0.01 && w.worldHeight * w.minScale >= WIN.height - 0.01)
  assert.ok(w.minScale < 1 && w.maxScale > 2)
  assert.equal(camp.data.frame.length, 16)
  assert.deepEqual(camp.data.view, home)
  camp.clock.advance(300)
  assert.notEqual(camp.data.view.x, home.x, '排好版后又对准了一次（值加了一点点小数，组件才会动）')
  assert.ok(Math.abs(camp.data.view.x - home.x) <= 0.011 && camp.data.view.scale === 1)
  camp.closeWelcome()
  camp.clock.advance(5000)
  assert.ok(['walk', 'idle', 'fidget'].indexOf(camp.data.pets[0].action) !== -1)

  // 锅空着、背包也空：点锅提示去扭蛋；塞一份胡萝卜、一份小米，点锅打开背包
  camp.tapPot()
  assert.equal(wx.log.toasts.pop(), '背包里没有吃的，去扭蛋机抽一个吧')
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, foods: { huluobo: 1, xiaomi: 1 } })
  camp.onShow()
  await settle()
  assert.equal(camp.data.bagCount, 2)
  camp.tapPot()
  assert.deepEqual([camp.data.bagOpen, camp.data.bagTab], [true, 'food'])
  // 拿着胡萝卜：拖到锅上松手就下锅
  camp.pickFood(event({ id: 'huluobo' }))
  assert.equal(camp.data.mode, 'feed')
  wx.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  camp.worldRect = wx.worldRect
  const touchAt = (x, y) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })
  const potAt = touchAt(SCENE.fire[0] * camp.L.k, (SCENE.fire[1] - 300) * camp.L.k)
  camp.onDragStart(potAt)
  await settle()
  assert.equal(camp.data.drag.ok, true)
  camp.onDragEnd(potAt)
  await settle()
  assert.equal(camp.data.mode, 'view')
  assert.equal(wx.log.toasts.pop(), '胡萝卜下锅啦，香味飘出去了…')
  // 火点上了（锅里一层、有火苗、没有熄火的补丁）；糯糯闻着香味从营地边上进来当客人
  assert.ok(camp.data.fx.some((f) => f.kind === 'fire'))
  assert.ok(!camp.data.fx.some((f) => f.kind === 'patch'))
  assert.equal(camp.data.cuts.find((c) => c.key === 'pot').image.split('/').pop().split('.')[0], 'pot-1')
  assert.equal(camp.data.peekText, '👀 糯糯闻着香味来了…下次拍正餐就住下')
  assert.deepEqual(camp.data.pets.map((p) => [p.id, p.visitor]), [['doudou', false], ['nuonuo', true]])
  camp.clock.advance(100)
  assert.equal(camp.data.pets[1].action, 'walk')
  // 点锅：说锅里煮着什么，还能再放（确认就打开背包）
  camp.closeBag()
  camp.tapPot()
  assert.equal(wx.log.modals.pop(), '锅里煮着：胡萝卜。爱吃的小动物会过来')
  assert.equal(camp.data.bagOpen, true)
  camp.closeBag()
  // 客人不能喂：拿着小米拖到糯糯身上，不算喂它
  camp.pickFood(event({ id: 'xiaomi' }))
  const nv = camp.data.pets[1]
  assert.equal(camp.hitTarget({ x: (nv.left + nv.width / 2) / camp.L.k, y: (camp.L.height - nv.bottom - nv.width / 2) / camp.L.k }), null)
  camp.cancel()

  // 切走再回来：小动物都在原地（记在本地存储里）
  camp.clock.advance(3000)
  const where = camp.life.snapshot()
  camp.onHide()
  assert.deepEqual(Object.keys(wx.storage.campSpots).sort(), ['doudou', 'nuonuo'])
  wx.app.globalData.campSpots = null // 重开小程序：内存里的没了，读本地存储
  camp.onShow()
  await settle()
  const back = camp.life.snapshot()
  ;['doudou', 'nuonuo'].forEach((id) => assert.ok(Math.hypot(back[id].x - where[id].x, back[id].y - where[id].y) < 1e-6, id))

  // 打卡 → 糯糯搬来；回到营地先庆祝
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.pickMealType(event({ value: 'lunch' }))
  checkin.onNote(event({}, { value: '米饭青菜' }))
  checkin.submit()
  await settle()
  const mealId = wx.log.nav.pop()[1].split('id=')[1]
  const meal = loadPage('meal', wx)
  meal.onLoad({ id: mealId })
  await settle()
  assert.equal(meal.data.arrival.text, '糯糯闻着胡萝卜的香味，住进营地啦！')
  wx.app.globalData.celebrate = true
  camp.onShow()
  await settle()
  assert.deepEqual(camp.data.pets.map((p) => [p.id, p.visitor]), [['doudou', false], ['nuonuo', false]])
  assert.equal(camp.data.peekText, '')
  // 锅照样煮着（打卡不加层）
  assert.equal(camp.data.cuts.find((c) => c.key === 'pot').image.split('/').pop().split('.')[0], 'pot-1')
  camp.clock.advance(50)
  assert.ok(camp.data.pets.some((p) => p.action === 'walk' || p.action === 'jump'))

  // 直接喂：小米拖到豆豆身上
  camp.openBag()
  camp.pickFood(event({ id: 'xiaomi' }))
  wx.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  // 松手的点：在豆豆身上、不在糯糯身上（两只挨着的时候点到上面那只）
  const dd = camp.data.pets[0]
  const nn = camp.data.pets[1]
  const inside = (s, x, y) => x >= s.left && x <= s.left + s.width && y >= camp.L.height - s.bottom - s.width && y <= camp.L.height - s.bottom
  const spots = []
  for (let fx = 0.1; fx < 1; fx += 0.2) for (let fy = 0.1; fy < 1; fy += 0.2) spots.push([dd.left + dd.width * fx, camp.L.height - dd.bottom - dd.width * fy])
  const [px, py] = spots.find(([x, y]) => !inside(nn, x, y)) || spots[12]
  camp.onDragStart(touchAt(px, py))
  await settle()
  camp.onDragEnd(touchAt(px, py))
  await settle()
  assert.match(wx.log.toasts.pop(), /豆豆吃得很开心，亲密 \+3/)
  assert.equal(camp.data.pets[0].action, 'eat')

  // 商店买滚球，摆到草地上，再收回
  const after = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...after, beans: { ...after.beans, bonus: after.beans.bonus + 300 } })
  const shop = loadPage('shop', wx)
  shop.onShow()
  await settle()
  shop.buy(event({ id: 'ball' }))
  await settle()
  assert.equal(wx.log.toasts.pop(), '买好了，去营地摆上吧')
  camp.onShow()
  await settle()
  camp.openBag()
  camp.switchBag(event({ tab: 'decor' }))
  camp.pickDecor(event({ id: 'ball' }))
  assert.equal(camp.data.mode, 'place')
  const g = (x, y) => touchAt(x * camp.L.k, y * camp.L.k)
  camp.onDragStart(g(SCENE.fire[0], SCENE.fire[1]))
  await settle()
  assert.equal(camp.data.drag.ok, false)
  camp.onDragEnd(g(SCENE.fire[0], SCENE.fire[1]))
  await settle()
  assert.equal(wx.log.toasts.pop(), '这儿放不下，挪开一点')
  camp.onDragEnd(g(1500, 1800))
  await settle()
  assert.equal(camp.data.decor.length, 1)
  assert.equal(camp.data.mode, 'view')
  wx.actionSheetChoice = 1
  camp.tapDecor(event({ uid: camp.data.decor[0].uid }))
  await settle()
  assert.equal(camp.data.decor.length, 0)
  assert.equal(camp.data.decorBag[0].id, 'ball')

  // 页面开着跨过 19 点：一分钟内换成夜景整套（底图、抠图、垫图都带 night-）
  assert.ok(camp.data.base[0].image.indexOf('night-') === -1 && camp.data.backdrop.indexOf('night-') === -1)
  camp.hour = () => 19
  camp.clock.advance(60000)
  assert.ok(camp.data.backdrop.indexOf('night-world') !== -1)
  assert.ok(camp.data.cuts.every((c) => c.image.indexOf('night-') !== -1))
  camp.hour = () => 10
  camp.clock.advance(60000)
  assert.ok(camp.data.backdrop.indexOf('night-') === -1)

  // 找它
  camp.openResidents()
  assert.deepEqual(camp.data.residents.map((r) => r.name), ['豆豆', '糯糯'])
  camp.findResident(event({ index: 1 }))
  assert.equal(camp.data.residentsOpen, false)
  const found = camp.data.pets[1]
  const sx = camp.data.view.x + found.left + found.width / 2
  assert.ok(sx > 0 && sx < WIN.width, `找它：${found.name} 在屏幕里（${sx}）`)
  // 捏放大过再点「回到篝火」：先缩回 1 倍、缩完再平移（同一次 setData 改 scale-value 又改 x / y，movable-view 会吞掉一个）
  camp.onZoom(event({}, { x: -300, y: -200, scale: 1.8 }))
  const before = { ...camp.data.view }
  camp.recenter()
  assert.notEqual(camp.data.view.scale, before.scale)
  assert.deepEqual([camp.data.view.x, camp.data.view.y], [before.x, before.y])
  camp.clock.advance(600)
  assert.ok(Math.abs(camp.data.view.scale - 1) < 0.001)
  assert.ok(Math.abs(camp.data.view.x - home.x) <= 0.011)
  // 没放大：直接平移，不碰缩放
  const scaleNow = camp.data.view.scale
  camp.findResident(event({ index: 0 }))
  assert.equal(camp.data.view.scale, scaleNow)
  camp.onUnload()
  assert.equal(camp.clock.count(), 0)
})

test('营地：本地存储用不了也照常（位置只记在内存里）', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  wx.failStorage = true
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  camp.clock.advance(5000)
  const before = camp.life.snapshot().doudou
  camp.onHide()
  assert.deepEqual(wx.app.globalData.campSpots.doudou, before)
  camp.onShow()
  await settle()
  assert.deepEqual(camp.life.snapshot().doudou, before)
  camp.onUnload()
})

test('营地：客人也用逐帧拼图（先下到本地），不退回单张图跳着走；下锅新来的客人也下', async () => {
  const config = require('../miniprogram/config')
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'camp.get' })
  const gardens = cloud.db.collections.get('gardens')
  gardens.set('u1', { ...gardens.get('u1'), foods: { kaohongshu: 1 }, visitors: [{ id: 'nuonuo', foodId: 'huluobo', since: '' }] })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  assert.ok(wx.log.downloads.includes(`${config.animArt}nuonuo-a.png`) && wx.log.downloads.includes(`${config.animArt}nuonuo-b.png`), wx.log.downloads.join(' '))
  const bunny = camp.data.pets.find((p) => p.id === 'nuonuo')
  assert.equal(bunny.visitor, true)
  assert.equal(bunny.sheet, 'wxfile://tmp/nuonuo-a.png')
  // 烤红薯下锅：杞杞闻着来，它的拼图也下
  camp.closeWelcome()
  camp.cook('kaohongshu')
  await settle()
  assert.ok(wx.log.downloads.includes(`${config.animArt}qiqi-a.png`), wx.log.downloads.join(' '))
  const fox = camp.data.pets.find((p) => p.id === 'qiqi')
  assert.equal(fox.visitor, true)
  assert.equal(fox.sheet, 'wxfile://tmp/qiqi-a.png')
  camp.onUnload()
})
