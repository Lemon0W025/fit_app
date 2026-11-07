// 营地背包：按住一样吃的往上拖，拖到锅上松手就下锅（11/07 用户：不想先点一下再点一下）。抽屉先收下去（tuck）但不卸
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, settle } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { SCENE } = require('../miniprogram/utils/shared/camp')

const touch = (id, x, y) => ({ currentTarget: { dataset: { id } }, touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }] })

async function openCamp() {
  const cloud = createFakeCloud()
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const wx = createWx(main)
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => 10
  camp.onLoad()
  camp.onShow()
  await settle()
  camp.closeWelcome()
  const gardens = cloud.db.collections.get('gardens')
  gardens.set('u1', { ...gardens.get('u1'), foods: { xiaomi: 2, huluobo: 1 } })
  camp.life.stop()
  camp.life = null
  camp.onShow()
  await settle()
  wx.worldRect = { left: 0, top: 0, width: camp.L.width, height: camp.L.height }
  camp.worldRect = wx.worldRect
  return { camp, wx, cloud }
}

test('背包里按住小米往上拖：抽屉收下去、拿在手里、幽灵图跟着；拖到锅上松手就下锅，抽屉关掉', async () => {
  const { camp, wx, cloud } = await openCamp()
  camp.openBag()
  assert.equal(camp.data.bagOpen, true)
  camp.onBagTouchStart(touch('xiaomi', 100, 700))
  camp.onBagTouchMove(touch('xiaomi', 102, 696))
  assert.equal(camp.data.mode, 'view', '手指才挪一点点，不算')
  camp.onBagTouchMove(touch('xiaomi', 104, 680))
  assert.deepEqual([camp.data.bagOpen, camp.data.bagTuck, camp.data.mode, camp.data.selectedName], [true, true, 'feed', '小米'])
  await settle()
  const potX = SCENE.fire[0] * camp.L.k
  const potY = (SCENE.fire[1] - 300) * camp.L.k
  camp.onBagTouchMove(touch('xiaomi', potX, potY))
  assert.equal(camp.data.drag.ok, true)
  assert.ok(camp.data.drag.image.endsWith('xiaomi.png'))
  camp.onBagTouchEnd(touch('xiaomi', potX, potY))
  await settle()
  assert.deepEqual([camp.data.bagOpen, camp.data.bagTuck, camp.data.mode, camp.data.drag], [false, false, 'view', null])
  assert.deepEqual(cloud.db.collections.get('gardens').get('u1').pot.items.map((it) => it.foodId), ['xiaomi'])
  assert.match(wx.log.toasts.pop(), /小米下锅啦/)
  // 松手以后跟着来的 tap 不算（不然又弹「放进锅里 / 拿去喂」）
  camp.pickFood({ currentTarget: { dataset: { id: 'xiaomi' } } })
  assert.equal((wx.log.actionSheets || []).length, 0)
  camp.onUnload()
})

test('横着划是滚背包、不拿；拖出来没放到锅上松手就算了；点一下照旧问一句', async () => {
  const { camp, wx } = await openCamp()
  camp.openBag()
  camp.onBagTouchStart(touch('xiaomi', 100, 700))
  camp.onBagTouchMove(touch('xiaomi', 140, 698))
  camp.onBagTouchMove(touch('xiaomi', 180, 690))
  camp.onBagTouchEnd(touch('xiaomi', 180, 690))
  assert.deepEqual([camp.data.bagOpen, camp.data.bagTuck, camp.data.mode], [true, false, 'view'])
  // 往上拖出来，松在草地上
  camp.onBagTouchStart(touch('xiaomi', 100, 700))
  camp.onBagTouchMove(touch('xiaomi', 100, 600))
  await settle()
  camp.onBagTouchEnd(touch('xiaomi', 60, 100))
  await settle()
  assert.deepEqual([camp.data.bagOpen, camp.data.mode], [false, 'view'])
  assert.match(wx.log.toasts.pop(), /没放进去/)
  assert.deepEqual(camp.pot.foods, [])
  // 点一下：还是问
  wx.actionSheetChoice = 1
  camp.openBag()
  camp.onBagTouchStart(touch('xiaomi', 100, 700))
  camp.onBagTouchEnd(touch('xiaomi', 100, 700))
  camp.pickFood({ currentTarget: { dataset: { id: 'xiaomi' } } })
  assert.deepEqual(wx.log.actionSheets.pop(), ['放进锅里煮上', '拿着小米去喂一只小动物'])
  assert.equal(camp.data.mode, 'feed')
  camp.cancel()
  camp.onUnload()
})

test('抽屉的 tuck：收到屏幕下面、遮罩不挡手势，但不卸载；背包的吃的绑了拖的手势', () => {
  const dir = path.join(__dirname, '../miniprogram/components/sheet')
  const css = fs.readFileSync(path.join(dir, 'sheet.wxss'), 'utf8')
  assert.match(css, /\.sheet-open\.sheet-tuck \.sheet-panel \{[^}]*translate3d\(0, 100%, 0\)/)
  assert.match(css, /\.sheet-open\.sheet-tuck \.sheet-mask \{[^}]*pointer-events: none/)
  assert.match(fs.readFileSync(path.join(dir, 'sheet.wxml'), 'utf8'), /tuck \? 'sheet-tuck'/)
  const wxml = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/camp/camp.wxml'), 'utf8')
  const item = wxml.split('\n').find((l) => l.includes('wx:for="{{foodBag}}"'))
  ;['bindtouchstart="onBagTouchStart"', 'bindtouchmove="onBagTouchMove"', 'bindtouchend="onBagTouchEnd"', 'bindtouchcancel="onBagTouchEnd"', 'bindtap="pickFood"'].forEach((attr) => assert.ok(item.includes(attr), attr))
})
