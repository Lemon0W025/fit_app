// 页面冒烟测试：没有微信开发者工具时，至少保证页面逻辑能跑通、WXML 引用的东西都存在
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, event, readWxml, checkTags, boundHandlers, referencedRoots } = require('./helpers/page-harness')
const { tileCenter } = require('../miniprogram/utils/iso')
const { manualClock } = require('./helpers/manual-clock')

const PAGES = ['today', 'garden', 'gacha', 'collection', 'forest', 'checkin', 'meal', 'weight', 'profile']

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

test('完整使用流程：建档 → 打卡 → 详情 → 重新分析 → 删除 → 总结 → 体重', async () => {
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
  profile.save()
  await settle()
  assert.equal(profile.data.isNew, false)
  assert.ok(wx.log.toasts.includes('保存好了'))

  // 3. 打卡：拍照 + 备注
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.pickMealType(event({ value: 'lunch' }))
  checkin.choosePhoto()
  checkin.onNote(event({}, { value: '米饭吃了一半' }))
  checkin.submit()
  await settle()
  const [kind, url] = wx.log.nav.pop()
  assert.equal(kind, 'redirectTo')
  const mealId = url.split('id=')[1]
  assert.ok(mealId)
  assert.match(wx.log.uploads[0].cloudPath, /^meals\/\d{4}-\d{2}-\d{2}\/\d+-\w+\.jpg$/)

  // 4. 详情页
  const meal = loadPage('meal', wx)
  meal.onLoad({ id: mealId })
  await settle()
  assert.equal(meal.data.meal.kcalText, '约 520 千卡')
  assert.equal(meal.data.meal.label, '午餐')
  assert.equal(meal.data.note, '米饭吃了一半')
  assert.equal(meal.data.gain.title, '+10 暖豆')
  assert.equal(meal.data.gain.stamps[1].cls, 'stamp-green')
  assert.equal(wx.app.globalData.lastGain, null)

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
  assert.equal(today.data.view.totals.kcal, 300)
  assert.equal(today.data.view.meals.length, 1)
  assert.equal(today.data.daily.title, '今天得了 10 暖豆')
  assert.equal(today.data.daily.hint, '再打卡晚餐还能得 10 暖豆')
  assert.equal(today.data.daily.streakText, '🔥 已连续 1 天')
  today.goGarden()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])
  assert.match(today.data.greeting, /妈妈/)
  today.openMeal(event({ id: mealId }))
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', `/pages/meal/meal?id=${mealId}`])

  // 7. 只写文字再打一餐，然后生成总结
  const checkin2 = loadPage('checkin', wx)
  checkin2.onLoad()
  checkin2.pickMealType(event({ value: 'dinner' }))
  checkin2.onNote(event({}, { value: '一碗面条' }))
  checkin2.submit()
  await settle()
  assert.equal(wx.log.nav.pop()[0], 'redirectTo')

  today.onShow()
  await settle()
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

test('养生庭院页面：新手礼 → 扭蛋 → 背包摆放 → 移动 → 收回 → 开荒 → 回到中间 → 图鉴 → 日历', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  // 第一次进庭院：新手礼 60 + 打卡赚的 20；只开垦了中间一块，四周 4 块能开荒
  const garden = loadPage('garden', wx)
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.deepEqual(garden.data.hud, { top: 24, height: 32, below: 68 })
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.plots.length, 9)
  assert.deepEqual(garden.data.plots.filter((p) => p.open).map((p) => p.key), ['1,1'])
  assert.equal(garden.data.plots.filter((p) => p.sign).length, 4)
  assert.ok(garden.data.decor.length > 0)
  assert.ok(garden.data.view.x < 0 && garden.data.view.y < 0)
  assert.equal(garden.data.sprites[0].itemId, 'starter_tree')
  assert.deepEqual([garden.data.sprites[0].c, garden.data.sprites[0].r], [8, 8])
  assert.equal(garden.data.bagCount, 0)
  garden.goGacha()
  assert.equal(garden.data.welcome, null)
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/gacha/gacha'])

  // 扭蛋
  const gacha = loadPage('gacha', wx)
  gacha.shakeMs = 0
  gacha.onShow()
  await settle()
  gacha.spin()
  await settle()
  gacha.openCapsule()
  const itemId = gacha.data.result.itemId
  gacha.goPlace()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 背包抽屉 → 摆放；地图被拖动并缩小到 0.8 倍时也能点准格子
  garden.onShow()
  await settle()
  assert.equal(garden.data.bagCount, 1)
  garden.openBag()
  assert.equal(garden.data.bagOpen, true)
  garden.pickInventory(event({ id: itemId }))
  assert.equal(garden.data.bagOpen, false)
  assert.equal(garden.data.mode, 'place')
  assert.equal(garden.data.hints.length, 35)
  wx.worldRect = { left: -420, top: -260, width: garden.L.width * 0.8 }
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.worldRect.left + p.x * 0.8, clientY: wx.worldRect.top + p.y * 0.8 }] }
  }
  garden.tapLand(tap(8, 8))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(2, 2))
  assert.equal(wx.log.toasts.pop(), '这块地还没开荒呢')
  garden.tapLand(tap(6, 6))
  await settle()
  assert.equal(garden.data.mode, 'view')
  assert.equal(garden.data.sprites.length, 2)
  const uid = garden.data.sprites.find((x) => x.itemId === itemId).uid

  // 移动
  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid }))
  assert.equal(garden.data.mode, 'move')
  garden.tapLand(tap(11, 11))
  await settle()
  const moved = garden.data.sprites.find((x) => x.uid === uid)
  assert.deepEqual([moved.c, moved.r], [11, 11])

  // 收回背包
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid }))
  await settle()
  assert.equal(garden.data.sprites.length, 1)
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 开荒：暖豆不够先提示；攒够了确认后开垦
  garden.tapSign(event({ key: '1,0' }))
  assert.equal(wx.log.toasts.pop(), '开荒要 100 暖豆，再攒攒')
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: doc.beans.bonus + 200 } })
  garden.onShow()
  await settle()
  assert.equal(garden.data.beans, 250)
  garden.tapSign(event({ key: '1,0' }))
  await settle()
  assert.match(wx.log.modals.pop(), /100 暖豆/)
  assert.deepEqual(garden.data.plots.filter((p) => p.open).map((p) => p.key).sort(), ['1,0', '1,1'])
  assert.equal(garden.data.beans, 150)
  assert.equal(garden.data.justOpened, '1,0')
  assert.equal(garden.data.plots.find((p) => p.key === '0,0').sign.cost, 150)
  assert.equal(wx.log.toasts.pop(), '开垦好啦！')

  // 回到中间：每次都换一点点数值，保证 movable-view 真的会动
  const before = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, before)
  const again = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, again)

  // 图鉴
  const collection = loadPage('collection', wx)
  collection.onShow()
  await settle()
  assert.equal(collection.data.totalCount, 48)
  assert.equal(collection.data.groups.length, 6)

  // 打卡日历
  garden.goCalendar()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/forest/forest'])
  const calendar = loadPage('forest', wx)
  calendar.onShow()
  await settle()
  assert.equal(calendar.data.daily.title, '今天得了 20 暖豆')
  assert.equal(calendar.data.view.totalDays, 1)
  garden.onUnload()
})

test('庭院小动物：张望提示 → 打卡后熊猫搬来 → 结果页横幅 → 走进庭院、点一下说话 → 离开页面停下', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 6, r: 6 }) })

  const garden = loadPage('garden', wx)
  garden.clock = manualClock()
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.equal(garden.data.waitingText, '👀 有小动物在院子外张望…下次打卡它就来了')
  assert.deepEqual(garden.data.animals, [])
  garden.onHide()

  // 打卡午餐
  const checkin = loadPage('checkin', wx)
  checkin.onLoad()
  checkin.pickMealType(event({ value: 'lunch' }))
  checkin.onNote(event({}, { value: '米饭青菜' }))
  checkin.submit()
  await settle()
  const mealId = wx.log.nav.pop()[1].split('id=')[1]
  assert.deepEqual(wx.app.globalData.lastGain.arrival, { id: 'panda', name: '大熊猫' })

  const meal = loadPage('meal', wx)
  meal.onLoad({ id: mealId })
  await settle()
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫', image: '/images/garden/items/panda.png', text: '大熊猫闻着竹子香，搬进庭院啦！' })
  meal.goGarden()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 回到庭院：熊猫从边上走进来
  garden.onShow()
  await settle()
  assert.equal(garden.data.waitingText, '')
  assert.equal(garden.data.animals.length, 1)
  assert.equal(garden.data.animals[0].id, 'panda')
  assert.equal(garden.data.animals[0].bubble, '我是大熊猫，以后就住这儿啦！')
  // 等距格子里不同的格子可能左右位置一样，所以比较左右 + 上下
  const where = (a) => `${a.left},${a.bottom}`
  const outside = where(garden.data.animals[0])
  garden.clock.advance(20000)
  assert.ok(Number.isFinite(garden.data.animals[0].left) && Number.isFinite(garden.data.animals[0].bottom))
  assert.notEqual(where(garden.data.animals[0]), outside)
  assert.equal(garden.data.animals[0].bubble, '')
  garden.tapAnimal(event({ index: 0 }))
  assert.ok(garden.data.animals[0].bubble)
  assert.equal(garden.data.animals[0].tapping, true)

  garden.onHide()
  assert.equal(garden.clock.count(), 0)

  // 再进来不会重复走进来
  garden.onShow()
  await settle()
  assert.notEqual(garden.data.animals[0].bubble, '我是大熊猫，以后就住这儿啦！')
  garden.onUnload()
  assert.equal(garden.clock.count(), 0)
})
