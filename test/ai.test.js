const test = require('node:test')
const assert = require('node:assert/strict')
const { createChat } = require('../cloudfunctions/api/ai')

// 假的 cloud.ai()：按分组决定成功还是失败
function fakeCloud(behavior) {
  const calls = []
  const created = []
  return {
    calls,
    created,
    ai: () => ({
      createModel(provider) {
        created.push(provider)
        return {
          async generateText({ model, messages }) {
            calls.push({ provider, model })
            const result = behavior(provider, model, messages)
            if (result instanceof Error) throw result
            return { text: result }
          },
        }
      },
    }),
  }
}

const messages = [{ role: 'user', content: 'hi' }]

test('用配置的分组调用，返回去掉首尾空白的文本', async () => {
  const cloud = fakeCloud(() => '  你好  ')
  const chat = createChat(cloud)
  assert.equal(await chat({ provider: 'cloudbase', model: 'hy3', messages }), '你好')
  assert.deepEqual(cloud.calls, [{ provider: 'cloudbase', model: 'hy3' }])
})

test('同一分组只创建一次模型', async () => {
  const cloud = fakeCloud(() => 'ok')
  const chat = createChat(cloud)
  await chat({ provider: 'cloudbase', model: 'hy3', messages })
  await chat({ provider: 'cloudbase', model: 'hy3', messages })
  assert.deepEqual(cloud.created, ['cloudbase'])
})

test('主分组调不通时换备用分组，并记住调通的分组', async () => {
  const cloud = fakeCloud((provider) => (provider === 'hunyuan-exp' ? 'ok' : new Error('group not found')))
  const logs = []
  const chat = createChat(cloud, { fallbackProviders: ['hunyuan-exp'], log: (...a) => logs.push(a) })
  assert.equal(await chat({ provider: 'cloudbase', model: 'hy3', messages }), 'ok')
  assert.equal(logs.length, 1)
  await chat({ provider: 'cloudbase', model: 'hy3', messages })
  assert.deepEqual(cloud.calls.map((c) => c.provider), ['cloudbase', 'hunyuan-exp', 'hunyuan-exp'])
})

test('记住的分组按模型区分', async () => {
  const cloud = fakeCloud((provider, model) => {
    if (model === 'vision' && provider === 'hunyuan-exp') return new Error('no vision here')
    if (model === 'text' && provider === 'cloudbase') return new Error('no text here')
    return 'ok'
  })
  const chat = createChat(cloud, { fallbackProviders: ['hunyuan-exp'] })
  await chat({ provider: 'cloudbase', model: 'vision', messages })
  await chat({ provider: 'cloudbase', model: 'text', messages })
  cloud.calls.length = 0
  await chat({ provider: 'cloudbase', model: 'vision', messages })
  await chat({ provider: 'cloudbase', model: 'text', messages })
  assert.deepEqual(cloud.calls, [
    { provider: 'cloudbase', model: 'vision' },
    { provider: 'hunyuan-exp', model: 'text' },
  ])
})

test('返回空文本算失败', async () => {
  const cloud = fakeCloud((provider) => (provider === 'cloudbase' ? '   ' : 'ok'))
  const chat = createChat(cloud, { fallbackProviders: ['hunyuan-exp'] })
  assert.equal(await chat({ provider: 'cloudbase', model: 'hy3', messages }), 'ok')
})

test('所有分组都失败时抛出最后一个错误', async () => {
  const cloud = fakeCloud((provider) => new Error(`${provider} down`))
  const chat = createChat(cloud, { fallbackProviders: ['hunyuan-exp'] })
  await assert.rejects(chat({ provider: 'cloudbase', model: 'hy3', messages }), /hunyuan-exp down/)
})

test('备用分组和主分组相同时不重复调用', async () => {
  const cloud = fakeCloud(() => new Error('down'))
  const chat = createChat(cloud, { fallbackProviders: ['cloudbase'] })
  await assert.rejects(chat({ provider: 'cloudbase', model: 'hy3', messages }))
  assert.equal(cloud.calls.length, 1)
})
