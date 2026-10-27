// test/camp-light.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { lightAt, lampsOf, lampAt, nightLook } = require('../miniprogram/utils/camp-light')

const bright = (f) => Number(/brightness\(([\d.]+)\)/.exec(f)[1])

test('篝火点着（锅里煮着东西）：照点火版夜景的光，火边亮而暖、不盖月光；越往外越暗、带一点月光；比火没点时亮', () => {
  const lamps = lampsOf([])
  const fire = nightLook(2130, 3150, true, lamps)
  const mid = nightLook(3300, 3500, true, lamps)
  const far = nightLook(3950, 3950, true, lamps)
  assert.ok(fire.moon < 0.1, `火边不盖月光 ${fire.moon}`)
  assert.ok(bright(fire.light) > bright(mid.light) && bright(mid.light) >= bright(far.light), `${fire.light} ${mid.light} ${far.light}`)
  assert.ok(far.moon > fire.moon, '远处带一点月光')
  assert.ok(/sepia\(([\d.]+)\)/.exec(fire.light)[1] > 0.1, '火边偏暖')
  // 同一个地方，火点着比火没点亮、月光淡
  const off = nightLook(3300, 3500, false, lamps)
  assert.ok(bright(mid.light) > bright(off.light) && mid.moon < off.moon, `${mid.light}/${mid.moon} vs ${off.light}/${off.moon}`)
})

test('篝火没点：远处月光色，灯边暖亮，越近越亮、月光越淡；摆的小灯笼、石灯笼、灯串也算灯', () => {
  const lamps = lampsOf([{ uid: 'd1', id: 'lantern', x: 3400, y: 3400 }, { uid: 'd2', id: 'ball', x: 900, y: 3000 }, { uid: 'd3', id: 'lights', x: 1000, y: 2000 }])
  assert.equal(lamps.length, 4, '画上的提灯、帐篷门口 + 小灯笼、灯串（滚球不是灯）')
  assert.equal(lamps.find((l) => l.x === 1000).r, 560)
  const near = nightLook(3420, 3420, false, lamps)
  const mid = nightLook(3650, 3420, false, lamps)
  const far = nightLook(3400, 2200, false, lamps)
  assert.ok(near.moon < mid.moon && mid.moon <= far.moon, `${near.moon} ${mid.moon} ${far.moon}`)
  assert.ok(bright(near.light) > bright(mid.light) && bright(mid.light) >= bright(far.light))
  assert.ok(far.moon > 0.5, '远处盖月光层')
  // 同一点没有那盏灯就是月光色
  assert.ok(nightLook(3420, 3420, false, lampsOf([])).moon > near.moon + 0.4)
  // 画上的灯：帐篷门口、树桩上的提灯
  assert.ok(nightLook(1210, 1470, false, lampsOf([])).moon < 0.15, '帐篷门口')
  assert.ok(nightLook(2665, 2800, false, lampsOf([])).moon < 0.15, '提灯边')
  assert.ok(nightLook(2130, 3300, false, lampsOf([])).moon > 0.5, '篝火没点：火边也只有月光')
  assert.equal(lampAt(5000, 5000, lamps), 0)
  assert.equal(lampAt(3400, 3400, lamps), 1)
})

test('走过去连续变化：灯圈边上一步一步变，不跳色', () => {
  const lamps = lampsOf([{ uid: 'd1', id: 'stonelamp', x: 3000, y: 3500 }])
  let prev = null
  for (let x = 3000; x <= 3600; x += 20) {
    const look = nightLook(x, 3500, false, lamps)
    if (prev) assert.ok(Math.abs(look.moon - prev.moon) < 0.12 && Math.abs(bright(look.light) - bright(prev.light)) < 0.06, `${x}`)
    prev = look
  }
})

test('光照图：火点着时火边亮而暖、远处暗而冷；熄了火时火边也冷', () => {
  assert.ok(lightAt(2130, 3200).warm > 0 && lightAt(3800, 1200).warm < 0)
  assert.ok(lightAt(2130, 3200).bright > lightAt(3800, 3800).bright + 0.2)
  assert.ok(lightAt(2130, 3200, false).warm < -0.5)
})
