// test/scene-fx.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { fxViews, FIRE_FRAMES } = require('../miniprogram/utils/scene-fx')
const { campLayout, cutoutViews } = require('../miniprogram/utils/camp-view')
const { SCENE } = require('../miniprogram/utils/shared/camp')

const L = campLayout({ width: 375, height: 736 })
const count = (list, kind) => list.filter((f) => f.kind === kind).length

test('白天：逐帧火苗压在锅下、火光和 3 颗火星在锅上；不再有 CSS 画的火团、烟团、蝴蝶', () => {
  const fx = fxViews(L, 12, [])
  assert.equal(count(fx, 'fire'), 1)
  assert.equal(count(fx, 'fireglow'), 1)
  assert.equal(count(fx, 'ember'), 3)
  assert.equal(count(fx, 'firefly'), 0)
  assert.equal(count(fx, 'glow'), 0)
  ;['flame', 'smoke', 'steam', 'butterfly', 'shimmer', 'ripple'].forEach((k) => assert.equal(count(fx, k), 0, k))
  const fire = fx.find((f) => f.kind === 'fire')
  assert.equal(fire.image, '/images/camp/cut/fire.jpg')
  assert.equal(fire.frames, FIRE_FRAMES)
  // 每帧四周多一圈原画：图比框宽 frames × (框宽 + 2pad) / 框宽 倍，往左上挪 pad
  const [fl, ft, fr, fb] = SCENE.flame.box
  const pad = SCENE.flame.pad
  assert.ok(Math.abs(fire.strip.width - FIRE_FRAMES * ((fr - fl + 2 * pad) / (fr - fl)) * 100) < 0.11)
  assert.ok(fire.strip.left < 0 && fire.strip.top < 0 && fire.strip.height > 100)
  assert.ok(Math.abs(fire.left - SCENE.flame.box[0] * L.k) < 0.11 && fire.width > 0)
  const potZ = cutoutViews(L, 0, '').find((c) => c.key === 'pot').z
  assert.ok(fire.z < potZ && fx.find((f) => f.kind === 'fireglow').z > potZ)
  assert.equal(fxViews(L, 12, [], 0, 'cloud://x/camp/cut/').find((f) => f.kind === 'fire').image, 'cloud://x/camp/cut/fire.jpg')
  // 暖暖锅：两顿起冒热气（从锅口），三顿两缕
  assert.equal(count(fxViews(L, 12, [], 1), 'wisp'), 0)
  assert.equal(count(fxViews(L, 12, [], 2), 'wisp'), 1)
  assert.equal(count(fxViews(L, 12, [], 3), 'wisp'), 2)
  const steam = fxViews(L, 12, [], 2).find((f) => f.kind === 'wisp')
  assert.ok(Math.abs(steam.top + steam.height - (SCENE.cutouts.pot.rim[1] + 30) * L.k) < 0.2)
  fx.forEach((f) => assert.ok(f.key && f.width > 0 && f.height > 0 && f.z > 0 && f.delay >= 0, f.key))
  assert.deepEqual(fxViews(L, 12, []), fx)
})

test('夜里：夜版火苗、大一圈的火光、6 颗火星、萤火虫 8 只、帐篷亮灯；灯串发光；水壶炉冒热气', () => {
  const placed = [{ uid: 'a', id: 'lights', x: 1500, y: 1800 }, { uid: 'b', id: 'kettle', x: 2000, y: 2000 }, { uid: 'c', id: 'flowerbed', x: 2300, y: 3400 }, { uid: 'd', id: 'ball', x: 900, y: 2200 }]
  const night = fxViews(L, 22, placed)
  assert.equal(night.find((f) => f.kind === 'fire').image, '/images/camp/cut/night-fire.jpg')
  assert.equal(night.find((f) => f.kind === 'fireglow').variant, 'fireglow-night')
  assert.equal(count(night, 'ember'), 6)
  assert.equal(count(night, 'firefly'), 8)
  assert.equal(count(night, 'glow'), 2) // 帐篷 + 灯串
  assert.ok(night.some((f) => f.key === 'tent-glow'))
  assert.equal(count(night, 'wisp'), 1) // 水壶炉
  assert.equal(night.find((f) => f.kind === 'wisp').image, '/images/camp/fx/wisp.png')
  const day = fxViews(L, 10, placed)
  assert.equal(count(day, 'glow'), 0)
  assert.equal(count(day, 'butterfly'), 0)
})

test('火苗逐帧：帧数和样式表的 steps 对得上，图在包里', () => {
  const css = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/camp/camp.wxss'), 'utf8')
  assert.match(css, new RegExp(`\\.fx-fire-strip \\{[^}]*steps\\(${FIRE_FRAMES}\\)`))
  ;['fire.jpg', 'night-fire.jpg'].forEach((f) => assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram/images/camp/cut', f)), f))
  assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram/images/camp/fx/wisp.png')))
})
