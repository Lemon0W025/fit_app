// 亲友看板的页面：亲友页（接受邀请、看板、点赞、提醒开关、不看了）、「我的」页的邀请和名单、被赞的人在今日页 / 结果页看到的赞
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { analysisJson } = require('./helpers/fake-repo')
const { createWx, loadPage, settle, event } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const V = require('../miniprogram/utils/family')
const { decorateMeal } = require('../miniprogram/utils/view')
const { MEAL_LABELS } = require('../miniprogram/utils/shared/meal-types')

const config = require('../cloudfunctions/api/config')

// 看板上第一位亲友的代号（页面发给云函数的 owner 是代号，不是账号）
const who = (page) => page.data.view.people[0].owner
const PROFILE = { nickname: '小明', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light', avoid: '' }
const TEMPLATE = { id: 'tmpl-1', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }

test.afterEach(() => {
  config.remindTemplate = null
})

// 一份云函数，几个人各拿一部「手机」（各自的 wx：本地存储、弹窗记录分开）
function world(replies = [analysisJson({ comment: '荤素搭配得不错，米饭的量也合适，下一顿可以再加一点绿叶菜，汤少喝两口' })]) {
  const cloud = createFakeCloud({ openid: 'me', replies })
  const { main } = loadCloudFunction(cloud)
  const as = (openid, action, data) => {
    cloud.setOpenid(openid)
    return main({ action, data })
  }
  // 这个人的手机：每次调云函数都用他的 openid
  const phone = (openid) => createWx((data) => {
    cloud.setOpenid(openid)
    return main(data)
  })
  return { cloud, main, as, phone }
}

// 小明建了档、12:10 拍了午饭；返回邀请码和这顿的 id
async function ownerWithLunch(w) {
  await w.as('me', 'profile.save', PROFILE)
  const meal = (await w.as('me', 'meal.analyze', { mealType: 'lunch', fileID: 'cloud://env/meals/a.jpg', note: '' })).data
  const { code } = (await w.as('me', 'family.invite')).data
  return { code, mealId: meal._id }
}

test('namesText / likesText：名字最多列 3 个，同一个称呼只写一次；没人赞是空的', () => {
  assert.equal(V.namesText([]), '')
  assert.equal(V.namesText(['小明', '小红', '小明', '']), '小明、小红')
  assert.equal(V.namesText(['甲', '乙', '丙', '丁', '戊']), '甲、乙、丙 等 5 位亲友')
  assert.equal(V.likesText(undefined), '')
  assert.equal(V.likesText([]), '')
  assert.equal(V.likesText([{ name: '小红', at: 1 }]), '❤ 小红 赞了')
  assert.equal(V.likesText([{ name: '小红', at: 1 }, { name: '亲友', at: 2 }]), '❤ 小红、亲友 赞了')
})

test('likesView：每顿下面一行；上次看过之后新来的赞才提示', () => {
  const meals = [
    { _id: 'a', likes: [{ name: '小红', at: 100 }, { name: '老王', at: 300 }] },
    { _id: 'b', likes: [{ name: '小红', at: 200 }] },
    { _id: 'c' },
  ]
  const first = V.likesView(meals, 0)
  assert.deepEqual(first.by, { a: '❤ 小红、老王 赞了', b: '❤ 小红 赞了' })
  assert.equal(first.note, '小红、老王 给你今天的打卡点了赞 ❤')
  assert.equal(first.latest, 300)
  assert.equal(V.likesView(meals, 200).note, '老王 给你今天的打卡点了赞 ❤')
  assert.equal(V.likesView(meals, 300).note, '')
  assert.deepEqual(V.likesView([], 0), { by: {}, latest: 0, note: '' })
  assert.deepEqual(V.likesView(undefined, undefined), { by: {}, latest: 0, note: '' })
})

test('boardView：每位亲友一张卡（印章、连续几天、最近 7 天准时、每一顿按时间排）；点评截短；没算出来的那顿不显示报错', () => {
  const long = '这一顿吃得很好'.repeat(10)
  const rawLunch = { _id: 'm1', mealType: 'lunch', createdAt: new Date('2026-11-10T12:10:00+08:00').getTime(), timing: 'on', status: 'done', analysis: JSON.parse(analysisJson({ comment: long })), photoUrl: 'https://tmp/a.jpg', liked: true, likeNames: ['红红', '老王'] }
  // 餐次、时间、评级、热量的写法和自己的今日页一样（utils/view.js 的 decorateMeal）
  const same = decorateMeal(rawLunch)
  const view = V.boardView({
    templateId: 'tmpl-1',
    credits: 2,
    invite: null,
    people: [{
      owner: 'me',
      name: '小明',
      streak: 5,
      weekOnTime: 9,
      notify: true,
      stamps: [{ mealType: 'breakfast', label: '早', state: 'none', onTime: false }, { mealType: 'lunch', label: '午', state: 'green', onTime: true }, { mealType: 'dinner', label: '晚', state: 'none', onTime: false }],
      meals: [
        { _id: 'm2', mealType: 'dinner', createdAt: new Date('2026-11-10T18:30:00+08:00').getTime(), timing: 'late', status: 'failed', analysis: null, photoUrl: '', liked: false, likeNames: [] },
        rawLunch,
      ],
    }],
  })
  assert.equal(view.empty, false)
  assert.equal(view.wechat, true)
  assert.equal(view.creditsText, '还能提醒 2 次')
  assert.equal(view.invite, null)
  const p = view.people[0]
  assert.equal(p.streakText, '🔥 已连续 5 天')
  assert.equal(p.weekText, '最近 7 天准时 9 顿')
  assert.equal(p.emptyText, '')
  assert.deepEqual(p.stamps.map((s) => s.cls), ['stamp-none', 'stamp-green stamp-on', 'stamp-none'])
  assert.deepEqual(p.meals.map((m) => m._id), ['m1', 'm2'])
  const [lunch, dinner] = p.meals
  assert.deepEqual([lunch.label, lunch.timeText, lunch.onTime], [MEAL_LABELS.lunch, '12:10', true])
  assert.ok(same.ratingText && same.kcalText)
  assert.deepEqual([lunch.ratingText, lunch.ratingClass, lunch.kcalText, lunch.photoUrl], [same.ratingText, same.ratingClass, same.kcalText, 'https://tmp/a.jpg'])
  assert.equal(lunch.commentText.length, 44)
  assert.ok(lunch.commentText.endsWith('…'))
  assert.deepEqual([lunch.liked, lunch.likeText, lunch.likesText], [true, '❤ 赞过了', '红红、老王 赞了'])
  assert.deepEqual([dinner.kcalText, dinner.commentText, dinner.ratingText, dinner.likeText, dinner.likesText], ['小暖还没算出来', '', '', '🤍 赞一个', ''])

  // 空的、没开通微信提醒、次数用完
  const empty = V.boardView({ templateId: '', credits: 0, people: [], invite: null })
  assert.deepEqual([empty.empty, empty.wechat], [true, false])
  assert.match(empty.creditsText, /次数用完了/)
  assert.equal(V.personView({ owner: 'x', name: '亲友', streak: 0, weekOnTime: 0, meals: [], stamps: [] }).emptyText, '今天还没打卡')
  assert.equal(V.personView({ owner: 'x', name: '亲友', streak: 0, weekOnTime: 0, meals: [], stamps: [] }).streakText, '')
  // 邀请卡：能接受的 / 一句说明 / 已经关注的不用再问
  assert.deepEqual(V.boardView({ people: [], invite: { ok: true, name: '小明', already: false } }).invite, { join: true, title: '小明 邀请你看 TA 每天的打卡', note: '' })
  assert.deepEqual(V.boardView({ people: [], invite: { ok: false, message: '邀请过期了，让 TA 再发一次' } }).invite, { join: false, title: '', note: '邀请过期了，让 TA 再发一次' })
  assert.equal(V.boardView({ people: [], invite: { ok: true, name: '小明', already: true } }).invite, null)
})

test('亲友页：带着邀请码打开先问称呼，点了才能看；看到今天的打卡，点赞变实心、再点没反应', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = world()
  const { code, mealId } = await ownerWithLunch(w)
  const wx = w.phone('v1')
  const page = loadPage('family', wx)
  page.onLoad({ code })
  page.onShow()
  await settle()
  // 还没接受：只有邀请卡，没有任何人的打卡
  assert.deepEqual(page.data.view.invite, { join: true, title: '小明 邀请你看 TA 每天的打卡', note: '' })
  assert.deepEqual(page.data.view.people, [])
  assert.equal((await w.as('me', 'family.mine')).data.viewers.length, 0)

  page.onName(event({}, { value: '红红' }))
  page.accept()
  await settle()
  assert.equal(wx.log.toasts.pop(), '能看到小明的打卡了')
  assert.equal(page.data.working, false)
  assert.equal(page.data.view.invite, null)
  assert.equal(page.data.view.people.length, 1)
  const person = page.data.view.people[0]
  assert.equal(person.name, '小明')
  assert.equal(person.streakText, '🔥 已连续 1 天')
  assert.equal(person.weekText, '最近 7 天准时 1 顿')
  assert.deepEqual(person.stamps.map((s) => s.cls), ['stamp-none', 'stamp-green stamp-on', 'stamp-none'])
  assert.equal(person.meals.length, 1)
  assert.equal(person.meals[0].photoUrl, 'https://tmp/cloud://env/meals/a.jpg')
  assert.ok(person.meals[0].kcalText)
  assert.ok(person.meals[0].commentText.length <= 44)
  assert.equal(person.meals[0].liked, false)
  // 没开通微信提醒：没有「提醒我」开关
  assert.equal(page.data.view.wechat, false)

  // 点赞：马上变实心、轻震一下，名字跟上；再点不重复记
  page.like(event({ owner: who(page), id: mealId }))
  assert.equal(page.data.view.people[0].meals[0].liked, true)
  assert.deepEqual(wx.log.vibrations, ['light'])
  await settle()
  assert.equal(page.data.view.people[0].meals[0].likesText, '红红 赞了')
  page.like(event({ owner: who(page), id: mealId }))
  await settle()
  assert.equal(wx.log.vibrations.length, 1)
  assert.deepEqual((await w.as('me', 'meal.get', { mealId })).data.likes.map((l) => l.name), ['红红'])

  // 之后再打开（不带邀请码）：直接是看板，赞过的还是实心
  const again = loadPage('family', wx)
  again.onLoad({})
  again.onShow()
  await settle()
  assert.equal(again.data.view.invite, null)
  assert.equal(again.data.view.people[0].meals[0].liked, true)
  // 看大图、我也要打卡
  again.goToday()
  assert.deepEqual(wx.log.nav.pop(), ['switchTab', '/pages/today/today'])
})

test('亲友页：没记上的赞变回空心并说原因；过期的邀请、自己的邀请写清楚；没关注任何人是空状态', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = world()
  const { code, mealId } = await ownerWithLunch(w)
  const wx = w.phone('v1')
  const page = loadPage('family', wx)
  page.onLoad({ code })
  page.onShow()
  await settle()
  page.accept()
  await settle()
  // 称呼没填：叫「亲友」
  assert.deepEqual((await w.as('me', 'family.mine')).data.viewers.map((v) => v.name), ['亲友'])
  // 点赞的时候这顿刚好被删了
  await w.as('me', 'meal.delete', { mealId })
  page.like(event({ owner: who(page), id: mealId }))
  assert.equal(page.data.view.people[0].meals[0].liked, true)
  await settle()
  assert.equal(page.data.view.people[0].meals[0].liked, false)
  assert.equal(wx.log.toasts.pop(), '这条打卡已经不在了')

  // 自己点开自己的邀请
  const mine = loadPage('family', w.phone('me'))
  mine.onLoad({ code })
  mine.onShow()
  await settle()
  assert.equal(mine.data.view.invite.join, false)
  assert.match(mine.data.view.invite.note, /你自己发出去的邀请/)

  // 乱七八糟的码
  const bad = loadPage('family', w.phone('v2'))
  bad.onLoad({ code: 'ZZZZZZZZZZ' })
  bad.onShow()
  await settle()
  assert.deepEqual(bad.data.view.invite, { join: false, title: '', note: '邀请过期了，让 TA 再发一次' })
  assert.equal(bad.data.view.empty, true)

  // 什么都不带、也没关注人
  const none = loadPage('family', w.phone('v3'))
  none.onLoad({})
  none.onShow()
  await settle()
  assert.equal(none.data.loading, false)
  assert.equal(none.data.view.empty, true)
  assert.equal(none.data.view.invite, null)
})

test('亲友页：「TA 过了饭点没拍，提醒我」先要一次「允许」再开；没允许不开；多攒一次；勾过「总是保持」的点赞时顺手攒', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  config.remindTemplate = TEMPLATE
  const w = world([analysisJson(), analysisJson()])
  const { code, mealId } = await ownerWithLunch(w)
  const wx = w.phone('v1')
  let asked = 0
  let answer = 'reject'
  wx.requestSubscribeMessage = (o) => {
    asked += 1
    o.success({ [o.tmplIds[0]]: answer })
  }
  const page = loadPage('family', wx)
  page.onLoad({ code })
  page.onShow()
  await settle()
  page.accept()
  await settle()
  assert.equal(page.data.view.wechat, true)
  assert.equal(page.data.view.people[0].notify, false)

  // 没点允许：不开，说清楚
  page.toggleNotify(event({ owner: who(page) }, { value: true }))
  await settle()
  assert.equal(asked, 1)
  assert.match(wx.log.modals.pop(), /要点「允许」/)
  assert.equal(page.data.view.people[0].notify, false)

  answer = 'accept'
  page.toggleNotify(event({ owner: who(page) }, { value: true }))
  await settle()
  assert.equal(asked, 2)
  assert.equal(page.data.view.people[0].notify, true)
  assert.equal(page.data.view.creditsText, '还能提醒 1 次')
  assert.equal(wx.log.toasts.pop(), '开好了')
  assert.equal(page.data.working, false)

  page.addCredit()
  await settle()
  assert.equal(page.data.view.creditsText, '还能提醒 2 次')
  assert.equal(wx.log.toasts.pop(), '攒上了')

  // 没勾「总是保持」：点赞不弹窗
  page.like(event({ owner: who(page), id: mealId }))
  await settle()
  assert.equal(asked, 3)
  // 勾过的：下次进来，点赞时顺手攒一次
  wx.subscriptionItems = { 'tmpl-1': 'accept' }
  assert.equal((await w.as('me', 'meal.analyze', { mealType: 'snack', note: '一个苹果' })).ok, true)
  const again = loadPage('family', wx)
  again.onLoad({})
  again.onShow()
  await settle()
  const fresh = again.data.view.people[0].meals.find((m) => !m.liked)
  assert.equal(fresh.label, MEAL_LABELS.snack)
  again.like(event({ owner: who(again), id: fresh._id }))
  await settle()
  assert.equal(asked, 4)
  assert.equal(again.data.view.creditsText, '还能提醒 3 次')

  // 关掉不用申请
  again.toggleNotify(event({ owner: who(again) }, { value: false }))
  await settle()
  assert.equal(again.data.view.people[0].notify, false)
  assert.equal(wx.log.toasts.pop(), '关掉了')
})

test('亲友页：「不看了」先问一句，确认了就从看板上拿掉', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = world()
  const { code } = await ownerWithLunch(w)
  await w.as('v1', 'family.accept', { code })
  const wx = w.phone('v1')
  const page = loadPage('family', wx)
  page.onLoad({})
  page.onShow()
  await settle()
  assert.equal(page.data.view.people.length, 1)
  page.leave(event({ owner: who(page), name: '小明' }))
  await settle()
  assert.match(wx.log.modals.pop(), /再邀请你一次/)
  assert.equal(page.data.view.empty, true)
  assert.deepEqual((await w.as('me', 'family.mine')).data.viewers, [])
})

test('「我的」页：邀请按钮分享出去的卡片带邀请码（右上角转发不带）；谁在看我的打卡能移除；关注了别人多一行入口', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = world()
  const { code } = await ownerWithLunch(w)
  const wx = w.phone('me')
  const page = loadPage('profile', wx)
  page.onShow()
  await settle()
  assert.equal(page.data.family.code, code)
  assert.deepEqual(page.data.family.viewers, [])
  assert.equal(page.data.family.following, 0)
  assert.deepEqual(page.onShareAppMessage({ from: 'button' }), { title: '来看看我今天吃得怎么样', path: `/pages/family/family?code=${code}` })
  const menu = page.onShareAppMessage({ from: 'menu' })
  assert.equal(menu.path, '/pages/today/today')
  assert.ok(!JSON.stringify(menu).includes(code))

  // 亲友接受了：回到「我的」看得到
  await w.as('v1', 'family.accept', { code, name: '红红' })
  page.onShow()
  await settle()
  const [watcher] = page.data.family.viewers
  assert.equal(watcher.name, '红红')
  assert.notEqual(watcher.viewer, 'v1', '拿到的是代号，不是账号')
  // 移除：先问一句；移除后名单空了，邀请码换了新的（旧卡片作废）
  page.removeViewer(event({ viewer: watcher.viewer, name: '红红' }))
  await settle()
  assert.match(wx.log.modals.pop(), /以前发出去的邀请也会作废/)
  assert.equal(wx.log.toasts.pop(), '移除了')
  assert.deepEqual(page.data.family.viewers, [])
  assert.notEqual(page.data.family.code, code)
  assert.deepEqual((await w.as('v1', 'family.get')).data.people, [])

  // 看的人（没建档）的「我的」页：没有邀请码，只有「我关注的亲友」一行
  await w.as('v2', 'family.accept', { code: page.data.family.code })
  const vwx = w.phone('v2')
  const viewer = loadPage('profile', vwx)
  viewer.onShow()
  await settle()
  assert.equal(viewer.data.isNew, true)
  assert.equal(viewer.data.family.code, '')
  assert.equal(viewer.data.family.followingText, '我关注的亲友（1 位）')
  viewer.goFamily()
  assert.deepEqual(vwx.log.nav.pop(), ['navigateTo', '/pages/family/family'])
  // 没有邀请码时点了分享按钮也只是普通分享
  assert.equal(viewer.onShareAppMessage({ from: 'button' }).path, '/pages/today/today')
})

test('被赞的人：今日页每顿下面「❤ 红红 赞了」，新来的赞最上面提示一次；结果页也有', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = world()
  const { code, mealId } = await ownerWithLunch(w)
  const wx = w.phone('me')
  wx.storage.toursSeen = { today: true }
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.deepEqual(today.data.likes, { by: {}, note: '' })

  const v1 = (await w.as('v1', 'family.accept', { code, name: '红红' })).data.owner
  await w.as('v1', 'family.like', { owner: v1, mealId })
  today.onShow()
  await settle()
  assert.deepEqual(today.data.likes, { by: { [mealId]: '❤ 红红 赞了' }, note: '红红 给你今天的打卡点了赞 ❤' })
  assert.ok(wx.storage.seenLikesAt > 0)
  // 再进来：每顿下面那行还在，提示不再出现
  today.onShow()
  await settle()
  assert.deepEqual(today.data.likes, { by: { [mealId]: '❤ 红红 赞了' }, note: '' })
  // 又有人赞：只提新来的那位
  const v2 = (await w.as('v2', 'family.accept', { code })).data.owner
  fixDate(t, '2026-11-10T12:20:00+08:00')
  await w.as('v2', 'family.like', { owner: v2, mealId })
  today.onShow()
  await settle()
  assert.equal(today.data.likes.by[mealId], '❤ 红红、亲友 赞了')
  assert.equal(today.data.likes.note, '亲友 给你今天的打卡点了赞 ❤')
  // 本地存不了也不出错（下次进来再提一次）
  wx.failStorage = true
  today.onShow()
  await settle()
  assert.equal(today.data.likes.note, '红红、亲友 给你今天的打卡点了赞 ❤')
  wx.failStorage = false
  today.onHide()

  const meal = loadPage('meal', wx)
  meal.clock = manualClock()
  meal.onLoad({ id: mealId })
  await settle()
  assert.equal(meal.data.likesText, '❤ 红红、亲友 赞了')
})

test('只是来看亲友打卡的（没建档、关注了别人）：打开小程序先到亲友页；回来再走欢迎页；谁也没关注的照旧先看欢迎页', async (t) => {
  fixDate(t, '2026-11-10T12:10:00+08:00')
  const w = await world()
  const { code } = await ownerWithLunch(w)
  await w.as('v1', 'family.accept', { code, name: '红红' })
  const wx = w.phone('v1')
  const today = loadPage('today', wx)
  today.clock = manualClock()
  today.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/family/family'])
  today.onShow()
  await settle()
  assert.deepEqual(wx.log.nav.pop(), ['navigateTo', '/pages/welcome/welcome'])
  today.onHide()

  const fresh = w.phone('v9')
  const page = loadPage('today', fresh)
  page.clock = manualClock()
  page.onShow()
  await settle()
  assert.deepEqual(fresh.log.nav.pop(), ['navigateTo', '/pages/welcome/welcome'])
  page.onHide()
})
