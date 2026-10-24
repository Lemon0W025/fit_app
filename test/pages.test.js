// 页面冒烟测试：没有微信开发者工具时，至少保证页面逻辑能跑通、WXML 引用的东西都存在
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, event, readWxml, checkTags, boundHandlers, referencedRoots } = require('./helpers/page-harness')
const { SCENE } = require('../miniprogram/utils/shared/camp')
const { manualClock } = require('./helpers/manual-clock')

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
  assert.ok(readWxml('meal').includes('回到营地'))
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
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/camp/camp'])
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

test('暖暖营地首页：欢迎 → 底图 → 扭蛋 → 放食盆 → 打卡后搬来 → 喂 → 商店买装饰摆放 → 找它', async () => {
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
  assert.equal(camp.data.bowls.length, 2)
  assert.deepEqual(camp.data.pets.map((p) => p.id), ['doudou'])
  assert.ok(camp.data.fx.some((f) => f.kind === 'fire'))
  assert.equal(camp.data.tint, '')
  camp.closeWelcome()
  camp.clock.advance(5000)
  assert.ok(['walk', 'idle', 'fidget'].indexOf(camp.data.pets[0].action) !== -1)

  // 食盆空的：提示去扭蛋；塞一份胡萝卜后能放
  camp.tapBowl(event({ index: 0 }))
  assert.equal(wx.log.toasts.pop(), '背包里没有吃的，去扭蛋机抽一个吧')
  const doc = cloud.db.collections.get('gardens').get('u1')
  cloud.db.collections.get('gardens').set('u1', { ...doc, foods: { huluobo: 1, xiaomi: 1 } })
  camp.onShow()
  await settle()
  assert.equal(camp.data.bagCount, 2)
  camp.openBag()
  camp.pickFood(event({ id: 'huluobo' }))
  assert.equal(camp.data.mode, 'feed')
  wx.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  camp.worldRect = wx.worldRect
  const bowl = camp.data.bowls[0]
  const touchAt = (x, y) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })
  camp.onDragStart(touchAt(bowl.left + bowl.width / 2, bowl.top + bowl.height / 2))
  await settle()
  assert.equal(camp.data.drag.ok, true)
  camp.onDragEnd(touchAt(bowl.left + bowl.width / 2, bowl.top + bowl.height / 2))
  await settle()
  assert.equal(camp.data.mode, 'view')
  assert.equal(camp.data.bowls[0].peeking, 'nuonuo')
  assert.match(camp.data.peekText, /糯糯/)

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
  assert.match(meal.data.arrival.text, /糯糯/)
  wx.app.globalData.celebrate = true
  camp.onShow()
  await settle()
  assert.deepEqual(camp.data.pets.map((p) => p.id), ['doudou', 'nuonuo'])
  camp.clock.advance(50)
  assert.ok(camp.data.pets.some((p) => p.action === 'walk' || p.action === 'jump'))

  // 直接喂：小米拖到豆豆身上
  camp.openBag()
  camp.pickFood(event({ id: 'xiaomi' }))
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
  assert.ok(camp.data.backdrop.indexOf('night-backdrop') !== -1)
  assert.ok(camp.data.cuts.every((c) => c.image.indexOf('night-') !== -1))
  camp.hour = () => 10
  camp.clock.advance(60000)
  assert.ok(camp.data.backdrop.indexOf('night-') === -1)

  // 找它
  camp.openResidents()
  assert.deepEqual(camp.data.residents.map((r) => r.name), ['豆豆', '糯糯'])
  camp.findResident(event({ index: 1 }))
  assert.equal(camp.data.residentsOpen, false)
  camp.onUnload()
  assert.equal(camp.clock.count(), 0)
})
