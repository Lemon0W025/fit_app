// test/decor-place.test.js：营地页摆装饰的手感——影子在手指上方、挤的地方自己靠到旁边、同一种接着摆（规则的单测在 decor.test.js）
const test = require('node:test')
const assert = require('node:assert/strict')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const V = require('../miniprogram/utils/camp-view')
const { decorById, placeProblem } = require('../miniprogram/utils/shared/decor')

const PROFILE = { nickname: '小暖', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' }
const event = (dataset = {}, detail = {}) => ({ currentTarget: { dataset }, detail })
const touchAt = (x, y) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })

// 建好档、进过营地，背包里放上 owned 这些装饰
async function open(owned, placed = []) {
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
  camp.onHide()
  const gardens = cloud.db.collections.get('gardens')
  const doc = gardens.get('u1')
  gardens.set('u1', { ...doc, decor: { ...doc.decor, owned, placed } })
  camp.onShow()
  await settle()
  // 画在屏幕上的位置（没缩放、左上角对齐）
  wx.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  camp.worldRect = wx.worldRect
  // 手指按在哪儿，它就落在画上的 (x, y)：落脚点在手指上方 V.DRAG_LIFT
  const g = (x, y) => touchAt(x * camp.L.k, y * camp.L.k + V.DRAG_LIFT)
  return { cloud, wx, camp, gardens, g }
}

test('种一排花：摆好一朵，背包里还有同一种就接着拿着；每次松在同一个地方，后面的自己靠到旁边排成一排', async () => {
  const { camp, gardens, g, wx } = await open({ tulips: 3 })
  camp.openBag()
  camp.pickDecor(event({ id: 'tulips' }))
  assert.equal(camp.data.mode, 'place')
  assert.equal(camp.data.placingText, '摆「郁金香」（还有 3 个）：拖到草地上松手，挤的地方它会自己靠到旁边')
  assert.equal(camp.data.placingMore, false)

  camp.onDragStart(g(2000, 3600))
  await settle()
  assert.equal(camp.data.drag.ok, true)
  camp.onDragEnd(g(2000, 3600))
  await settle()
  assert.equal(camp.data.decor.length, 1)
  assert.equal(camp.data.mode, 'place', '还有两朵，接着摆')
  assert.equal(camp.data.placingMore, true)
  assert.equal(camp.data.placingText, '摆「郁金香」（还有 2 个）：拖到草地上松手，挤的地方它会自己靠到旁边')
  assert.equal(camp.data.drag, null)

  // 第二朵压在第一朵偏右的地方：影子直接画在第一朵右边（绿的），松手就种在那儿
  camp.onDragStart(g(2130, 3605))
  await settle()
  assert.equal(camp.data.drag.ok, true)
  camp.onDragEnd(g(2130, 3605))
  await settle()
  assert.equal(camp.data.mode, 'place')
  // 第三朵再往右一点：靠到第二朵右边；种完背包里没有了，退出摆放
  camp.onDragEnd(g(2350, 3600))
  await settle()
  assert.equal(camp.data.mode, 'view')
  assert.equal(camp.data.placingMore, false)
  const placed = gardens.get('u1').decor.placed
  const w = decorById('tulips').foot.w
  assert.deepEqual(placed.map((p) => [p.id, p.x, p.y]), [['tulips', 2000, 3600], ['tulips', 2000 + w + 1, 3600], ['tulips', 2000 + 2 * (w + 1), 3600]])
  assert.equal(camp.data.decorBag.length, 0)
  assert.equal(wx.log.toasts.length, 0, '一路没有弹「挤着了」')
})

test('接着摆的时候点「好了」就结束；提示条的按钮跟着换字', async () => {
  const { camp, g } = await open({ daisies: 2 })
  camp.pickDecor(event({ id: 'daisies' }))
  camp.onDragEnd(g(1500, 3300))
  await settle()
  assert.equal(camp.data.mode, 'place')
  assert.equal(camp.data.placingMore, true)
  camp.cancel()
  assert.deepEqual([camp.data.mode, camp.data.placingMore, camp.data.decorBag[0].count], ['view', false, 1])
  const wxml = readWxml('camp')
  assert.match(wxml, /\{\{placingMore \? '好了' : '取消'\}\}/)
  assert.match(wxml, /: placingText\}\}/)
})

test('挪地方：挤着别的也是自己靠到旁边；哪儿都靠不过去才说放不下，还拿在手里', async () => {
  const { camp, gardens, g, wx } = await open({ tulips: 1, ball: 1 }, [{ uid: 'd90', id: 'tulips', x: 2000, y: 3600 }, { uid: 'd91', id: 'ball', x: 3000, y: 3600 }])
  assert.equal(camp.data.decor.length, 2)
  camp.startMove(camp.data.decor.find((d) => d.uid === 'd91'))
  assert.equal(camp.data.placingText, '挪「滚球」：拖到新地方松手，挤的地方它会自己靠到旁边')
  // 大帐篷正中间：放不下
  camp.onDragEnd(g(700, 1000))
  await settle()
  assert.equal(wx.log.toasts.pop(), '这儿放不下，挪开一点')
  assert.equal(camp.data.mode, 'move')
  // 压在郁金香上偏右：靠到它右边（花和家具之间留一点空）
  camp.onDragEnd(g(2120, 3600))
  await settle()
  assert.equal(camp.data.mode, 'view')
  const ball = gardens.get('u1').decor.placed.find((p) => p.uid === 'd91')
  assert.equal(ball.y, 3600)
  assert.ok(ball.x > 2000 + (220 + 260) / 2 && ball.x < 2000 + (220 + 260) / 2 + 20, `球在 ${ball.x}`)
  assert.equal(placeProblem(gardens.get('u1').decor.placed, 'ball', ball.x, ball.y, 'd91'), '')
})
