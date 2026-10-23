const test = require('node:test')
const assert = require('node:assert/strict')
const { frameFor, facingFor, facingForPixels, COLS, ROWS } = require('../miniprogram/utils/anim')
const SHEETS = require('../miniprogram/utils/anim-sheets')
const { ANIMAL_INFO } = require('../miniprogram/utils/animals')

test('走路：朝观众第 1 行、背对第 2 行，6 帧，时长按步态；飞也一样', () => {
  assert.deepEqual(frameFor('walk', { face: 'front', gait: 'pad' }), { row: 0, col: 0, frames: 6, ms: 720 })
  assert.deepEqual(frameFor('walk', { face: 'back', gait: 'crawl' }), { row: 1, col: 0, frames: 6, ms: 1400 })
  assert.equal(frameFor('fly', { face: 'back', gait: 'flutter', fly: true }).row, 1)
})

test('发呆 / 睡觉 / 专属 / 小动作 / 被点到 各取各的格子，都不越过 6×4', () => {
  assert.deepEqual(frameFor('idle'), { row: 2, col: 0, frames: 2, ms: 1200 })
  assert.deepEqual(frameFor('sleep'), { row: 2, col: 2, frames: 2, ms: 2400 })
  assert.equal(frameFor('bask').col, 2)
  assert.deepEqual(frameFor('peck', { special: 'peck' }), { row: 2, col: 4, frames: 2, ms: 800 })
  assert.equal(frameFor('peck', { special: 'eat' }).col, 0, '不是自己的专属动作就发呆')
  assert.deepEqual(frameFor('trick'), { row: 3, col: 2, frames: 4, ms: 1400 })
  assert.deepEqual(frameFor('walk', { tapping: true }), { row: 3, col: 0, frames: 2, ms: 500 })
  assert.equal(frameFor('perch').col, 2, '猫趴家具上是睡觉帧')
  assert.equal(frameFor('perch', { fly: true }).col, 0, '小鸟停枝头是站着')
  ;['idle', 'walk', 'sleep', 'trick', 'swim', 'soak', 'eat', 'swing', 'warm', 'fly', 'perch', 'away'].forEach((a) => {
    const f = frameFor(a, { special: 'swim' })
    assert.ok(f.row < ROWS && f.col + f.frames <= COLS, a)
  })
})

test('朝向：+c 朝观众往右、+r 朝观众往左、−c 背对往左、−r 背对往右；原地不变', () => {
  const cur = { face: 'front', right: true }
  assert.deepEqual(facingFor({ c: 3, r: 3 }, { c: 4, r: 3 }, cur), { face: 'front', right: true })
  assert.deepEqual(facingFor({ c: 3, r: 3 }, { c: 3, r: 4 }, cur), { face: 'front', right: false })
  assert.deepEqual(facingFor({ c: 3, r: 3 }, { c: 2, r: 3 }, cur), { face: 'back', right: false })
  assert.deepEqual(facingFor({ c: 3, r: 3 }, { c: 3, r: 2 }, cur), { face: 'back', right: true })
  assert.equal(facingFor({ c: 3, r: 3 }, { c: 3, r: 3 }, cur), cur)
  assert.deepEqual(facingForPixels(-10, 5, cur), { face: 'front', right: false })
  assert.deepEqual(facingForPixels(10, -5, cur), { face: 'back', right: true })
  assert.equal(facingForPixels(0, 0, cur), cur)
})

test('每只动物都有拼图参数，专属动作是它真会做的', () => {
  Object.keys(ANIMAL_INFO).forEach((id) => {
    assert.ok(SHEETS[id], id)
    assert.ok(SHEETS[id].top >= 0 && SHEETS[id].top < 0.5)
  })
  assert.equal(Object.keys(SHEETS).length, Object.keys(ANIMAL_INFO).length)
})
