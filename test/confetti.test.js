const test = require('node:test')
const assert = require('node:assert/strict')
const C = require('../miniprogram/utils/confetti')

test('makeParticles：片数、颜色、同一个种子出一样的；burst 从顶上中间出', () => {
  const a = C.makeParticles({ mode: 'milestone', width: 375, height: 700, seed: 3 })
  const b = C.makeParticles({ mode: 'milestone', width: 375, height: 700, seed: 3 })
  assert.equal(a.length, 80)
  assert.deepEqual(a, b)
  assert.ok(a.every((p) => C.COLORS.includes(p.color) && p.y < 0 && p.x >= 0 && p.x <= 375))
  const burst = C.makeParticles({ mode: 'burst', width: 375, height: 700, seed: 3 })
  assert.equal(burst.length, 40)
  assert.ok(burst.every((p) => Math.abs(p.x - 187.5) <= 20))
})

test('step：几秒内全部落出底边就停', () => {
  for (const mode of ['burst', 'milestone']) {
    const list = C.makeParticles({ mode, width: 375, height: 700, seed: 11 })
    let alive = list.length
    let t = 0
    while (alive && t < 5) {
      alive = C.step(list, 1 / 60, 700)
      t += 1 / 60
    }
    assert.equal(alive, 0, mode)
    assert.ok(t < C.RUN_MS[mode] / 1000 + 1, `${mode} 落完用了 ${t.toFixed(2)} 秒`)
  }
})

test('draw：每片画一次（save / restore 成对）', () => {
  const calls = { save: 0, restore: 0 }
  const ctx = new Proxy({}, { get: (_, k) => (k in calls ? () => (calls[k] += 1) : () => {}), set: () => true })
  const list = C.makeParticles({ mode: 'burst', width: 375, height: 700, seed: 5 })
  C.draw(ctx, list)
  assert.deepEqual(calls, { save: 40, restore: 40 })
})
