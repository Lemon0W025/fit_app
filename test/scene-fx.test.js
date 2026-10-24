// test/scene-fx.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { fxViews } = require('../miniprogram/utils/scene-fx')
const { campLayout } = require('../miniprogram/utils/camp-view')

const L = campLayout({ width: 375, height: 736 })
const count = (list, kind) => list.filter((f) => f.kind === kind).length

test('白天：火苗、烟；没有萤火虫和灯光', () => {
  const fx = fxViews(L, 12, [])
  assert.equal(count(fx, 'flame'), 3)
  assert.equal(count(fx, 'smoke'), 3)
  assert.equal(count(fx, 'firefly'), 0)
  assert.equal(count(fx, 'glow'), 0)
  assert.equal(fx.length, 6)
  fx.forEach((f) => assert.ok(f.key && f.width > 0 && f.height > 0 && f.z > 0 && f.delay >= 0, f.key))
  assert.deepEqual(fxViews(L, 12, []), fx)
})

test('夜里：萤火虫 8 只、帐篷亮灯；灯串、灯笼、金帐篷发光；水壶炉冒热气、花坛有蝴蝶', () => {
  const placed = [{ uid: 'a', id: 'lights', x: 1500, y: 1800 }, { uid: 'b', id: 'kettle', x: 2000, y: 2000 }, { uid: 'c', id: 'flowerbed', x: 2300, y: 3400 }, { uid: 'd', id: 'ball', x: 900, y: 2200 }]
  const night = fxViews(L, 22, placed)
  assert.equal(count(night, 'firefly'), 8)
  assert.equal(count(night, 'glow'), 2) // 帐篷 + 灯串
  assert.ok(night.some((f) => f.key === 'tent-glow'))
  assert.equal(count(night, 'steam'), 1)
  assert.equal(count(night, 'butterfly'), 0) // 蝴蝶只在白天
  const day = fxViews(L, 10, placed)
  assert.equal(count(day, 'butterfly'), 1)
  assert.equal(count(day, 'glow'), 0)
  assert.equal(night.find((f) => f.kind === 'steam').image, '/images/garden/fx/steam.png')
})
