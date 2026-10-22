// 把云开发 AI 封装成 chat({ provider, model, messages }) -> 文本，services 只依赖这个函数

function createChat(cloud) {
  let ai = null
  const models = {}

  return async function chat({ provider, model, messages }) {
    if (!ai) ai = cloud.ai()
    if (!models[provider]) models[provider] = ai.createModel(provider)

    const res = await models[provider].generateText({ model, messages })
    const text = res && typeof res.text === 'string' ? res.text.trim() : ''
    if (!text) {
      throw new Error(`AI 没有返回内容（${provider}/${model}）：${JSON.stringify((res && res.error) || '')}`)
    }
    return text
  }
}

module.exports = { createChat }
