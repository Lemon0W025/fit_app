const test = require('node:test')
const assert = require('node:assert/strict')
const { fxViews, diamond } = require('../miniprogram/utils/scene-fx')
const W = require('../miniprogram/utils/world')
const { AREAS } = require('../miniprogram/utils/shared/estate')

const L = W.estateLayout(375)
const areas = (opened) => AREAS.map((a) => ({ id: a.id, unlocked: opened.indexOf(a.id) !== -1 }))

test('开局只有前院正院：没有水没有花，什么特效都没有', () => {
  assert.deepEqual(fxViews(areas(['front', 'main']), L), [])
})

test('修了荷塘院：池子上有波光和几点星光，裁成菱形；花圃院有花瓣；温泉院冒热气；后花园有瀑布', () => {
  const pond = fxViews(areas(['front', 'main', 'pond']), L)
  const shimmer = pond.filter((f) => f.kind === 'shimmer')
  assert.equal(shimmer.length, 1)
  assert.match(shimmer[0].clip, /^polygon\(/)
  assert.ok(shimmer[0].width > 0 && shimmer[0].height > 0)
  assert.ok(pond.filter((f) => f.kind === 'sparkle').length >= 3)
  assert.ok(!pond.some((f) => f.kind === 'steam' || f.kind === 'falls' || f.kind === 'petal'))

  const all = fxViews(areas(['front', 'main', 'pond', 'flower', 'spring', 'back']), L)
  assert.equal(all.filter((f) => f.kind === 'steam').length, 3)
  assert.equal(all.filter((f) => f.kind === 'falls').length, 1)
  assert.equal(all.filter((f) => f.kind === 'petal').length, 5)
  assert.ok(all.filter((f) => f.kind === 'shimmer').length >= 4, '荷塘、温泉、后花园的潭和溪都有波光')
  all.forEach((f) => {
    assert.ok(f.key && f.left >= 0 && f.top >= 0 && f.width > 0 && f.height > 0, f.key)
    assert.ok(f.delay >= 0 && f.z > 0)
  })
  // 同样的输入每次一样
  assert.deepEqual(fxViews(areas(['front', 'main', 'pond']), L), pond)
})

test('diamond：一块地的菱形外框和 clip-path', () => {
  const d = diamond([20, 11, 26, 16], L)
  assert.equal(d.width, ((6 + 5) * L.tileW) / 2)
  assert.equal(d.height, ((6 + 5) * L.tileH) / 2)
  assert.equal(d.clip.split(',').length, 4)
})
