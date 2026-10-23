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
  assert.equal(meal.data.tree.title, '🌱 种下了今天的树苗')
  assert.equal(meal.data.tree.image, '/images/forest/sprout.png')
  assert.equal(meal.data.tree.beansText, '+10 暖豆')
  assert.equal(wx.app.globalData.lastTree, null)

  // 5. 估得不准 → 补充描述重新分析
  meal.startEdit()
  meal.onNote(event({}, { value: '米饭只吃了三分之一' }))
  meal.reanalyze()
  await settle()
  assert.equal(meal.data.meal.kcalText, '约 300 千卡')
  assert.equal(meal.data.editing, false)
  assert.equal(meal.data.tree.title, '今天的树：树苗')

  // 6. 今日页展示
  today.onShow()
  await settle()
  assert.equal(today.data.view.totals.kcal, 300)
  assert.equal(today.data.view.meals.length, 1)
  assert.equal(today.data.tree.title, '今天的树：树苗')
  assert.equal(today.data.tree.beansText, '今天已得 10 暖豆')
  assert.equal(today.data.tree.streakText, '🔥 已连续 1 天')
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

  // 9. 森林页：午餐删掉了，只剩晚餐 → 树苗
  const forest = loadPage('forest', wx)
  forest.onShow()
  await settle()
  assert.equal(forest.data.loaded, true)
  assert.equal(forest.data.today.title, '今天的树：树苗')
  assert.equal(forest.data.view.totalTrees, 1)
  const todayCell = forest.data.cells.find((c) => c.date === today.data.view.date)
  assert.equal(todayCell.image, '/images/forest/sprout.png')
  forest.openDay(event({ key: todayCell.key }))
  assert.match(wx.log.modals.pop(), /树苗 · 打卡 1 顿/)
  forest.prevMonth()
  await settle()
  assert.ok(forest.data.month < todayCell.date.slice(0, 7))
  assert.ok(forest.data.cells.every((c) => c.blank || c.image === '/images/forest/empty.png'))

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

test('养生庭院页面：新手礼 → 扭蛋 → 摆放 → 移动 → 收回 → 图鉴 → 日历', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  // 第一次进庭院：新手礼 60 + 打卡赚的 20
  const garden = loadPage('garden', wx)
  garden.onShow()
  await settle()
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.landImage, '/images/garden/land-6.png')
  assert.equal(garden.data.sprites.length, 1)
  assert.equal(garden.data.sprites[0].itemId, 'starter_tree')
  assert.deepEqual(garden.data.inventory, [])
  garden.goGacha()
  assert.equal(garden.data.welcome, null)
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/gacha/gacha'])

  // 扭蛋
  const gacha = loadPage('gacha', wx)
  gacha.shakeMs = 0
  gacha.onShow()
  await settle()
  assert.equal(gacha.data.beans, 80)
  assert.equal(gacha.data.ratesText, '普通 65% · 稀有 25% · 珍稀 8% · 传说 2%')
  gacha.spin()
  assert.equal(gacha.data.phase, 'shaking')
  await settle()
  assert.equal(gacha.data.phase, 'capsule')
  assert.equal(gacha.data.beans, 50)
  assert.ok(gacha.data.result.name)
  assert.match(gacha.data.result.capsule, /^\/images\/garden\/ui\/capsule-(common|rare|epic|legendary)\.png$/)
  gacha.openCapsule()
  assert.equal(gacha.data.phase, 'reveal')
  const itemId = gacha.data.result.itemId
  gacha.goPlace()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 摆放：点到被大树占着的格子会提示，点空地放下
  garden.onShow()
  await settle()
  assert.deepEqual(garden.data.inventory.map((i) => i.itemId), [itemId])
  garden.pickInventory(event({ id: itemId }))
  assert.equal(garden.data.mode, 'place')
  assert.equal(garden.data.hints.length, 35)
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.gardenRect.left + p.x, clientY: wx.gardenRect.top + p.y }] }
  }
  garden.tapLand(tap(2, 2))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(0, 0))
  await settle()
  assert.equal(garden.data.mode, 'view')
  assert.equal(garden.data.sprites.length, 2)
  assert.deepEqual(garden.data.inventory, [])
  const uid = garden.data.sprites.find((x) => x.itemId === itemId).uid

  // 移动
  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid }))
  assert.equal(garden.data.mode, 'move')
  garden.tapLand(tap(5, 5))
  await settle()
  const moved = garden.data.sprites.find((x) => x.uid === uid)
  assert.deepEqual([moved.c, moved.r], [5, 5])

  // 收回背包
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid }))
  await settle()
  assert.equal(garden.data.sprites.length, 1)
  assert.equal(garden.data.inventory.length, 1)
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 再扭一次后豆子不够
  gacha.onShow()
  await settle()
  gacha.spin()
  await settle()
  gacha.closeResult()
  assert.equal(gacha.data.beans, 20)
  gacha.spin()
  assert.equal(gacha.data.phase, 'idle')
  assert.equal(wx.log.toasts.pop(), '暖豆不够啦，再打卡一顿就有了')

  // 图鉴
  const collection = loadPage('collection', wx)
  collection.onShow()
  await settle()
  assert.ok(collection.data.collectedCount >= 1)
  assert.equal(collection.data.totalCount, 48)
  assert.equal(collection.data.groups.length, 6)
  assert.equal(collection.data.groups[4].label, '小动物')

  // 打卡日历
  const calendar = loadPage('forest', wx)
  calendar.onShow()
  await settle()
  assert.equal(calendar.data.today.title, '今天的树：小树')
  assert.equal(calendar.data.today.beansText, '今天已得 20 暖豆')
})

test('庭院小动物：张望提示 → 打卡后熊猫搬来 → 结果页横幅 → 走进庭院、点一下说话 → 离开页面停下', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 0, r: 0 }) })

  const garden = loadPage('garden', wx)
  garden.clock = manualClock()
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
  assert.deepEqual(wx.app.globalData.lastTree.arrival, { id: 'panda', name: '大熊猫' })

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
  const outside = garden.data.animals[0].left
  garden.clock.advance(20000)
  assert.ok(Number.isFinite(garden.data.animals[0].left) && Number.isFinite(garden.data.animals[0].bottom))
  assert.notEqual(garden.data.animals[0].left, outside)
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
