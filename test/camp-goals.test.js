// test/camp-goals.test.js：后期目标在页面上——营地的庆祝卡（住户里程碑、满级后的星星）、住户列表和图册里的星星、
// 图册封面的进度、商店买不起时写「还差 N 暖豆」
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const V = require('../miniprogram/utils/camp-view')

const PROFILE = { nickname: '小暖', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' }
const resident = (id, fed = 0) => ({ id, since: '2026-10-20', fed, fedToday: { date: '', n: 0 } })
const event = (dataset = {}, detail = {}) => ({ currentTarget: { dataset }, detail })

// 建好档、进过一次营地（领了新手礼、关了欢迎卡），再把营地数据改成想要的样子
async function open(change) {
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: PROFILE })
  const wx = createWx(main)
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  camp.closeWelcome()
  camp.onTourDone()
  const gardens = cloud.db.collections.get('gardens')
  gardens.set('u1', { ...gardens.get('u1'), ...change })
  camp.onHide()
  return { cloud, main, wx, camp, gardens }
}

test('营地：住下第 4 只，进营地弹庆祝卡、暖豆到账；收下以后不再弹', async () => {
  const { camp, gardens } = await open({ pets: ['doudou', 'nuonuo', 'qiqi', 'shushu'].map((id) => resident(id)) })
  const before = camp.data.beans
  camp.onShow()
  await settle()
  assert.deepEqual(camp.data.cheer, {
    key: 'residents-4', image: '/images/garden/ui/gift.png', title: '营地住进 4 只啦', stars: '',
    text: '营地越来越热闹，奖励 100 暖豆', more: '住满 8 只，还有 200 暖豆',
  })
  assert.equal(camp.data.beans, before + 100)
  assert.deepEqual([gardens.get('u1').goals, gardens.get('u1').cheers], [[4], []])
  camp.closeCheer()
  assert.equal(camp.data.cheer, null)
  camp.onHide()
  camp.onShow()
  await settle()
  assert.equal(camp.data.cheer, null)
  assert.equal(camp.data.beans, before + 100)
  camp.onUnload()
})

test('营地：几件事一起到（8 只、12 只全到齐、一颗星）：一张一张出，收下一张再出下一张', async () => {
  const ids = ['doudou', 'nuonuo', 'lianlian', 'shishi', 'huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha', 'hehe']
  const { camp } = await open({ goals: [4], pets: ids.map((id, i) => resident(id, i ? 0 : 60)) })
  camp.onShow()
  await settle()
  assert.equal(camp.data.cheer.title, '营地住进 8 只啦')
  camp.closeCheer()
  assert.equal(camp.data.cheer, null) // 先收起来，隔一下再出下一张
  camp.clock.advance(200)
  assert.deepEqual([camp.data.cheer.title, camp.data.cheer.more], ['12 只全到齐啦', '大家都在，天天来看看它们'])
  camp.closeCheer()
  camp.clock.advance(200)
  assert.deepEqual([camp.data.cheer.title, camp.data.cheer.stars, camp.data.cheer.image], ['豆豆多了一颗星', '★☆☆☆☆', '/images/camp/pets/doudou-face.png'])
  assert.equal(camp.data.cheer.text, '满级以后你还一直喂着它，奖励 20 暖豆')
  camp.closeCheer()
  assert.equal(camp.data.cheer, null)
  camp.clock.advance(1000)
  assert.equal(camp.data.cheer, null)
  camp.onUnload()
})

test('营地：喂出一颗星当场弹卡；住户列表里名字后面带星星（没星的不带）', async () => {
  const { camp, wx } = await open({ foods: { xiaomi: 1 }, pets: [resident('doudou', 53), resident('nuonuo', 2)] })
  camp.onShow()
  await settle()
  assert.equal(camp.data.cheer, null)
  camp.openResidents()
  assert.deepEqual(camp.data.residents.map((r) => [r.name, r.stars]), [['豆豆', ''], ['糯糯', '']])
  camp.closeResidents()
  // 拿着小米拖到豆豆身上喂（53 → 56 顿，第一颗星）
  camp.holdFood('xiaomi')
  const s = camp.data.pets[0]
  camp.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  camp.feedAt({ x: (s.left + s.width / 2) / camp.L.k, y: (camp.L.height - s.bottom - s.width / 2) / camp.L.k })
  await settle()
  assert.equal(wx.log.toasts.pop(), '豆豆吃得很开心，亲密 +3')
  assert.deepEqual([camp.data.cheer.title, camp.data.cheer.stars, camp.data.cheer.more], ['豆豆多了一颗星', '★☆☆☆☆', '再喂 30 顿，还有下一颗'])
  camp.closeCheer()
  camp.openResidents()
  assert.deepEqual(camp.data.residents.map((r) => [r.name, r.stars]), [['豆豆', '★☆☆☆☆'], ['糯糯', '']])
  camp.onUnload()
})

test('庆祝卡和星星的文案：满星、12 只到齐各有说法', () => {
  assert.deepEqual([0, 2, 5, 9].map(V.starText), ['☆☆☆☆☆', '★★☆☆☆', '★★★★★', '★★★★★'])
  assert.equal(V.cheerCard({ kind: 'star', petId: 'huahua', stars: 5, beans: 20 }).more, '五颗星集齐啦，它最亲你')
  assert.equal(V.cheerCard({ kind: 'residents', pets: 8, beans: 200 }).more, '住满 12 只，还有 500 暖豆')
  assert.equal(V.goalText({ pets: 5, total: 12 }, { pets: 8, beans: 200 }), '再来 3 只领 200 暖豆')
  assert.equal(V.goalText({ pets: 12, total: 12 }, null), '')
})

test('图册：封面写离下一个住户里程碑还差几只；满级的那页有星星和下一颗还要喂几顿', async () => {
  const { main, wx } = await open({ pets: [resident('doudou', 60), resident('nuonuo', 4), resident('qiqi', 175)] })
  const album = loadPage('album', wx)
  album.onShow()
  await settle()
  const [cover, doudou, nuonuo] = album.data.pages
  assert.deepEqual([cover.progress, cover.goalText], [{ pets: 3, total: 12 }, '再来 1 只领 100 暖豆'])
  assert.deepEqual([doudou.levelText, doudou.starRow, doudou.starHint], ['亲密 5 级，已经是家人了', '★☆☆☆☆', '再喂 25 顿，多一颗星'])
  assert.deepEqual([nuonuo.starRow, nuonuo.starHint], ['', ''])
  const qiqi = album.data.pages.find((p) => p.key === 'qiqi')
  assert.deepEqual([qiqi.starRow, qiqi.starHint], ['★★★★★', '五颗星集齐啦'])
  assert.ok(main)
})

test('商店：买不起的按钮写「还差 N 暖豆」、点不了；买得起的写价钱', async () => {
  const groups = V.shopGroups({}, 50)
  const items = groups.reduce((all, g) => all.concat(g.items), [])
  const cheap = items.find((i) => i.price <= 50)
  const dear = items.find((i) => i.price > 50)
  assert.deepEqual([cheap.canAfford, cheap.short, cheap.label], [true, 0, `${cheap.price} 暖豆`])
  assert.deepEqual([dear.canAfford, dear.short, dear.label], [false, dear.price - 50, `还差 ${dear.price - 50} 暖豆`])
  // 页面上：暖豆 60（新手礼），每件按钮上的字和能不能点跟着暖豆走
  const { wx } = await open({})
  const shop = loadPage('shop', wx)
  shop.onShow()
  await settle()
  const shown = shop.data.groups.reduce((all, g) => all.concat(g.items), [])
  assert.ok(shown.length > 0)
  shown.forEach((i) => assert.equal(i.label, i.price <= shop.data.beans ? `${i.price} 暖豆` : `还差 ${i.price - shop.data.beans} 暖豆`, i.id))
  assert.ok(shown.some((i) => !i.canAfford) && shown.some((i) => i.canAfford))
  // 买不起的硬点（按钮是 disabled，这里直接调）：云函数拦住，说还差多少
  const dearest = shown.filter((i) => !i.canAfford)[0]
  shop.buy(event({ id: dearest.id }))
  await settle()
  assert.ok(/暖豆不够啦/.test(wx.log.modals.pop() || wx.log.toasts.pop() || ''))
})
