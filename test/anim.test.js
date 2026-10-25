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
