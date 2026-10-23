const test = require('node:test')
const assert = require('node:assert/strict')
const { createRouter } = require('../cloudfunctions/api/router')
const { AppError } = require('../cloudfunctions/api/lib/errors')

function setup(overrides = {}) {
  const calls = []
  const record = (name) => async (openid, data) => {
    calls.push({ name, openid, data })
    return { name }
  }
  const services = {
    profile: { get: record('profile.get'), save: record('profile.save') },
    meal: { analyze: record('meal.analyze'), reanalyze: record('meal.reanalyze'), get: record('meal.get'), remove: record('meal.remove') },
    day: { get: record('day.get'), summarize: record('day.summarize') },
    weight: { save: record('weight.save'), list: record('weight.list') },
    forest: { get: record('forest.get') },
    garden: { get: record('garden.get'), spin: record('garden.spin'), place: record('garden.place'), move: record('garden.move'), stash: record('garden.stash') },
    ...overrides,
  }
  const logs = []
  const route = createRouter(services, { log: (...a) => logs.push(a) })
  return { route, calls, logs }
}

test('把 action 分发到对应 service，并传入 openid 和 data', async () => {
  const { route, calls } = setup()
  const pairs = [
    ['profile.get', 'profile.get'],
    ['profile.save', 'profile.save'],
    ['meal.analyze', 'meal.analyze'],
    ['meal.reanalyze', 'meal.reanalyze'],
    ['meal.get', 'meal.get'],
    ['meal.delete', 'meal.remove'],
    ['day.get', 'day.get'],
    ['summary.generate', 'day.summarize'],
    ['weight.save', 'weight.save'],
    ['weight.list', 'weight.list'],
    ['forest.get', 'forest.get'],
    ['garden.get', 'garden.get'],
    ['garden.spin', 'garden.spin'],
    ['garden.place', 'garden.place'],
    ['garden.move', 'garden.move'],
    ['garden.stash', 'garden.stash'],
  ]
  for (const [action, target] of pairs) {
    const res = await route({ action, data: { x: 1 } }, 'u1')
    assert.deepEqual(res, { ok: true, data: { name: target } })
  }
  assert.ok(calls.every((c) => c.openid === 'u1' && c.data.x === 1))
})

test('data 缺省为空对象', async () => {
  const { route, calls } = setup()
  await route({ action: 'day.get' }, 'u1')
  assert.deepEqual(calls[0].data, {})
})

test('未知 action', async () => {
  const { route } = setup()
  const res = await route({ action: 'drop.tables' }, 'u1')
  assert.equal(res.ok, false)
  assert.equal(res.code, 'UNKNOWN_ACTION')
})

test('原型链上的名字不算 action', async () => {
  const { route } = setup()
  assert.equal((await route({ action: 'constructor' }, 'u1')).code, 'UNKNOWN_ACTION')
  assert.equal((await route({ action: '__proto__' }, 'u1')).code, 'UNKNOWN_ACTION')
})

test('没有 openid', async () => {
  const { route } = setup()
  const res = await route({ action: 'day.get' }, '')
  assert.equal(res.code, 'NO_OPENID')
})

test('业务错误原样返回 code 和 message', async () => {
  const { route, logs } = setup({
    day: { get: async () => { throw new AppError('NO_MEALS', '今天还没有打卡') }, summarize: async () => {} },
  })
  assert.deepEqual(await route({ action: 'day.get' }, 'u1'), { ok: false, code: 'NO_MEALS', message: '今天还没有打卡' })
  assert.equal(logs.length, 0)
})

test('未知错误转为 INTERNAL 并记录日志', async () => {
  const { route, logs } = setup({
    day: { get: async () => { throw new Error('db exploded') }, summarize: async () => {} },
  })
  const res = await route({ action: 'day.get' }, 'u1')
  assert.equal(res.ok, false)
  assert.equal(res.code, 'INTERNAL')
  assert.doesNotMatch(res.message, /db exploded/)
  assert.equal(logs.length, 1)
})
