// test/anim.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const A = require('../miniprogram/utils/anim')
const SHEETS = require('../miniprogram/utils/anim-sheets')

test('两张 6×6：每个动作一行', () => {
  assert.deepEqual([A.COLS, A.ROWS], [6, 6])
  assert.deepEqual(A.frameFor('walk'), { sheet: 'a', row: 0, frames: 6, ms: 720 })
  assert.deepEqual(A.frameFor('idle'), { sheet: 'a', row: 1, frames: 6, ms: 1800 })
  assert.deepEqual(A.frameFor('sleep'), { sheet: 'a', row: 2, frames: 6, ms: 3000 })
  assert.deepEqual(A.frameFor('sleep', { sleepStyle: 'B' }), { sheet: 'a', row: 3, frames: 6, ms: 3000 })
  assert.deepEqual(A.frameFor('eat'), { sheet: 'a', row: 4, frames: 6, ms: 900 })
  assert.deepEqual(A.frameFor('fidget'), { sheet: 'a', row: 5, frames: 6, ms: 1500 })
  assert.deepEqual(A.frameFor('happy'), { sheet: 'b', row: 0, frames: 6, ms: 900 })
  assert.deepEqual(A.frameFor('roll'), { sheet: 'b', row: 1, frames: 6, ms: 1200 })
  assert.deepEqual(A.frameFor('pet'), { sheet: 'b', row: 2, frames: 6, ms: 1500 })
  assert.deepEqual(A.frameFor('gift'), { sheet: 'b', row: 3, frames: 6, ms: 720 })
  assert.deepEqual(A.frameFor('jump'), { sheet: 'b', row: 4, frames: 6, ms: 600 })
  assert.deepEqual(A.frameFor('special'), { sheet: 'b', row: 5, frames: 6, ms: 1500 })
  // 坐、泡水、晒太阳、玩、爬、停在高处都用发呆帧；不认识的动作也是
  ;['sit', 'soak', 'sun', 'play', 'climb', 'perch', 'dislike', 'nope'].forEach((a) => assert.equal(A.frameFor(a).row, 1, a))
  assert.equal(A.frameFor('fly').row, 0)
  assert.equal(A.facingFor(5, false), true)
  assert.equal(A.facingFor(-5, true), false)
  assert.equal(A.facingFor(0, true), true)
  // 有拼图的宠物（scripts/pack_anim.py 回写）：都是认识的宠物，头顶空白在格高的一半以内
  const { PETS } = require('../miniprogram/utils/shared/pets')
  Object.entries(SHEETS).forEach(([id, s]) => {
    assert.ok(PETS.some((p) => p.id === id), id)
    assert.ok(s.top >= 0 && s.top < 0.5, id)
  })
})

test('C 张（正面 / 背影）：有 C 张时往上走看背影、往下走看正面，锅前面吃 / 坐看背影；没有 C 张或别的动作照旧', () => {
  const back = { dir: 'back', c: true }
  const front = { dir: 'front', c: true }
  assert.deepEqual(A.frameFor('walk', back), { sheet: 'c', row: 0, frames: 6, ms: 720 })
  assert.deepEqual(A.frameFor('fly', back), { sheet: 'c', row: 0, frames: 6, ms: 720 })
  assert.deepEqual(A.frameFor('walk', front), { sheet: 'c', row: 1, frames: 6, ms: 720 })
  assert.deepEqual(A.frameFor('idle', back), { sheet: 'c', row: 2, frames: 6, ms: 1800 })
  assert.deepEqual(A.frameFor('eat', back), { sheet: 'c', row: 3, frames: 6, ms: 900 })
  assert.deepEqual(A.frameFor('sit', back), { sheet: 'c', row: 4, frames: 6, ms: 1800 })
  assert.deepEqual(A.frameFor('idle', front), { sheet: 'c', row: 5, frames: 6, ms: 1800 })
  // 正面没有吃、坐那两行：照旧侧面；别的动作不分方向
  assert.deepEqual(A.frameFor('eat', front), A.frameFor('eat'))
  assert.deepEqual(A.frameFor('happy', back), A.frameFor('happy'))
  assert.deepEqual(A.frameFor('sleep', { ...back, sleepStyle: 'B' }), A.frameFor('sleep', { sleepStyle: 'B' }))
  // 没有 C 张：照旧
  assert.deepEqual(A.frameFor('walk', { dir: 'back' }), A.frameFor('walk'))
  assert.deepEqual(A.frameFor('walk', { dir: 'side', c: true }), A.frameFor('walk'))
  assert.deepEqual(A.SHEET_ROWS.c, ['walkBack', 'walkFront', 'idleBack', 'eatBack', 'sitBack', 'idleFront'])
  // 走的方向：竖着比横着多 1.2 倍以上才算正面 / 背影
  assert.equal(A.dirOf(10, -100), 'back')
  assert.equal(A.dirOf(-10, 100), 'front')
  assert.equal(A.dirOf(100, -100), 'side')
  assert.equal(A.dirOf(0, 0, 'back'), 'back')
})
