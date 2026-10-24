// 页面冒烟测试：没有微信开发者工具时，至少保证页面逻辑能跑通、WXML 引用的东西都存在
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, event, readWxml, checkTags, boundHandlers, referencedRoots } = require('./helpers/page-harness')
const { tileCenter } = require('../miniprogram/utils/iso')
const { placeableTiles } = require('../miniprogram/utils/shared/estate')
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
  assert.ok(readWxml('meal').includes('回到花园'))
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

test('园林大宅院首页：今日暖豆、底图云朵木牌、扭蛋、背包摆放、各种不能摆、换方向、移动、收回、修整、找它、去打卡', async () => {
  const green = analysisJson({ rating: 'green' })
  const cloud = createFakeCloud({ replies: [green, green] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '粥' } })
  await main({ action: 'meal.analyze', data: { mealType: 'lunch', note: '面' } })

  const garden = loadPage('garden', wx)
  garden.hour = () => 15
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.equal(garden.data.welcome.beans, 60)
  assert.equal(garden.data.beans, 80)
  assert.equal(garden.data.canSpin, true)
  assert.equal(garden.data.daily.title, '今天得了 20 暖豆')
  assert.deepEqual(garden.data.daily.stamps.map((s) => s.cls), ['stamp-green', 'stamp-green', 'stamp-none'])
  assert.equal(garden.data.art.length, 16)
  // 默认用 config.estateArt（云存储）的切块
  assert.match(garden.data.art[0].image, /^cloud:\/\/.*\/garden\/estate\/t00\.jpg$/)
  // 云存储的图加载失败：退回本地白模
  garden.setData({ artBase: 'cloud://x/', art: [] })
  garden.render(garden.garden)
  assert.equal(garden.data.art[0].image, 'cloud://x/t00.jpg')
  garden.onArtError()
  assert.equal(garden.data.art[0].image, '/images/garden/estate/t00.jpg')
  assert.equal(garden.data.artBase, '')
  assert.deepEqual(garden.data.signs.map((s) => s.key), ['pond', 'flower', 'orchard', 'bamboo'])
  assert.ok(garden.data.clouds.length >= 9 * 6)
  assert.ok(!garden.data.clouds.some((c) => c.area === 'front' || c.area === 'main'))
  assert.deepEqual([garden.data.sprites[0].c, garden.data.sprites[0].r], [11, 16])
  assert.ok(garden.data.sprites[0].shadow.width > 0)
  garden.goGacha()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/gacha/gacha'])

  const gacha = loadPage('gacha', wx)
  gacha.shakeMs = 0
  gacha.onShow()
  await settle()
  gacha.spin()
  await settle()
  gacha.openCapsule()
  const itemId = gacha.data.result.itemId
  gacha.goPlace()

  // 背包 → 摆放；地图拖动并缩小到 0.8 倍
  garden.onShow()
  await settle()
  garden.openBag()
  garden.pickInventory(event({ id: itemId }))
  assert.equal(garden.data.mode, 'place')
  const opened = ['front', 'main']
  assert.equal(garden.data.hints.length, placeableTiles(opened, garden.garden.placed, itemId).length)
  assert.ok(garden.data.hints.length > 0)
  wx.worldRect = { left: -420, top: -260, width: garden.L.width * 0.8 }
  const tap = (c, r) => {
    const p = tileCenter(c, r, garden.L)
    return { changedTouches: [{ clientX: wx.worldRect.left + p.x * 0.8, clientY: wx.worldRect.top + p.y * 0.8 }] }
  }
  garden.tapLand(tap(11, 16))
  assert.equal(wx.log.toasts.pop(), '这块地上已经有东西了')
  garden.tapLand(tap(13, 15))
  assert.equal(wx.log.toasts.pop(), '小路上不能摆东西')
  garden.tapLand(tap(20, 12))
  assert.equal(wx.log.toasts.pop(), '这个院子还没修整呢')
  garden.tapLand(tap(0, 0))
  assert.equal(wx.log.toasts.pop(), '放不到这里哦')
  // 换个方向再摆
  garden.toggleFlip()
  assert.equal(garden.data.placingFlip, true)
  const spot = garden.data.hints[0]
  garden.tapLand(tap(spot.c, spot.r))
  await settle()
  assert.equal(garden.data.mode, 'view')
  const mine = garden.data.sprites.find((x) => x.itemId === itemId)
  assert.deepEqual([mine.c, mine.r, mine.flip], [spot.c, spot.r, true])

  // 移动：换到另一块亮着的地；移动中换方向直接存
  wx.actionSheetChoice = 0
  garden.tapSprite(event({ uid: mine.uid }))
  assert.equal(garden.data.mode, 'move')
  const other = garden.data.hints.find((t) => t.c !== mine.c || t.r !== mine.r)
  garden.toggleFlip()
  await settle()
  assert.equal(garden.data.sprites.find((x) => x.uid === mine.uid).flip, false)
  garden.tapLand(tap(other.c, other.r))
  await settle()
  assert.deepEqual((({ c, r }) => [c, r])(garden.data.sprites.find((x) => x.uid === mine.uid)), [other.c, other.r])
  wx.actionSheetChoice = 1
  garden.tapSprite(event({ uid: mine.uid }))
  await settle()
  assert.match(wx.log.toasts.pop(), /收进背包了/)

  // 修整荷塘院：豆不够先提示；攒够了确认后云散开、木牌换位置、屏幕滑过去
  garden.tapSign(event({ key: 'pond' }))
  assert.equal(wx.log.toasts.pop(), '修整要 200 暖豆，再攒攒')
  const toastCount = wx.log.toasts.length
  garden.tapSign(event({ key: 'spring' }))
  assert.equal(wx.log.toasts.length, toastCount)
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, beans: { ...doc.beans, bonus: doc.beans.bonus + 300 } })
  garden.onShow()
  await settle()
  assert.equal(garden.data.beans, 350)
  const before = garden.data.view
  garden.tapSign(event({ key: 'pond' }))
  await settle()
  assert.match(wx.log.modals.pop(), /花 200 暖豆修整荷塘院/)
  assert.deepEqual(garden.data.signs.map((s) => s.key), ['flower', 'orchard', 'bamboo', 'tea', 'back'])
  assert.ok(!garden.data.clouds.some((c) => c.area === 'pond'))
  assert.equal(garden.data.beans, 150)
  assert.equal(garden.data.justOpened, 'pond')
  assert.ok(garden.data.burst)
  assert.equal(wx.log.toasts.pop(), '荷塘院修整好啦！')
  assert.notDeepEqual(garden.data.view, before)

  // 还没有住户时的「找它」
  garden.openResidents()
  assert.deepEqual(garden.data.residents, [])
  assert.equal(garden.data.residentsOpen, true)
  garden.closeResidents()
  assert.equal(garden.data.residentsOpen, false)

  const centered = garden.data.view
  garden.recenter()
  assert.notDeepEqual(garden.data.view, centered)
  garden.goCheckin()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/checkin/checkin'])
  garden.onUnload()
})

test('花园首页：还没建档时先去建档', async () => {
  const cloud = createFakeCloud({ replies: [] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  const garden = loadPage('garden', wx)
  garden.onLoad()
  garden.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/profile/profile'])
  garden.onUnload()
})

test('庭院小动物：张望提示 → 打卡后熊猫搬来 → 结果页横幅 → 走进庭院、点一下说话 → 离开页面停下', async () => {
  const cloud = createFakeCloud({ replies: [analysisJson({ rating: 'green' })] })
  const { main } = loadCloudFunction(cloud)
  const wx = createWx(main)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  await main({ action: 'garden.get' })
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, placed: doc.placed.concat({ uid: 'p9', itemId: 'bamboo', c: 10, r: 15 }) })

  const garden = loadPage('garden', wx)
  garden.clock = manualClock()
  garden.hour = () => 15
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
  assert.deepEqual(meal.data.arrival, { id: 'panda', name: '大熊猫', image: '/images/garden/items/panda.png', text: '大熊猫闻着竹子香，搬进花园啦！' })
  meal.goGarden()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/garden/garden'])

  // 回到花园：熊猫从大门走进来
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
  // 找它：列表里有它、写着在哪在干嘛；点一下屏幕滑过去
  garden.openResidents()
  assert.equal(garden.data.residents.length, 1)
  assert.equal(garden.data.residents[0].name, '大熊猫')
  assert.match(garden.data.residents[0].text, /^(在.+|正往.+走|溜达)$/)
  const viewBefore = garden.data.view
  garden.findResident(event({ index: 0 }))
  assert.equal(garden.data.residentsOpen, false)
  assert.notDeepEqual(garden.data.view, viewBefore)
  assert.equal(garden.data.animals[0].tapping, true)
  garden.clock.advance(700)
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
