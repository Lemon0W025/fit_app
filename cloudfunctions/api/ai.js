// 把云开发 AI 封装成 chat({ provider, model, messages }) -> 文本，services 只依赖这个函数
//
// 模型挂在哪个分组（cloudbase / hunyuan-exp）因账号和套餐而异：主分组调不通时依次试备用分组，
// 并按模型记住调通的分组，之后直接用它，失败信息写进云函数日志方便排查。

function createChat(cloud, { fallbackProviders = [], log = () => {} } = {}) {
  let ai = null
  const models = {}
  const workingProvider = {}

  function modelFor(provider) {
    if (!ai) ai = cloud.ai()
    if (!models[provider]) models[provider] = ai.createModel(provider)
    return models[provider]
  }

  return async function chat({ provider, model, messages }) {
    const candidates = [workingProvider[model], provider, ...fallbackProviders]
      .filter((p, i, list) => p && list.indexOf(p) === i)

    let lastError = null
    for (const p of candidates) {
      try {
        const res = await modelFor(p).generateText({ model, messages })
        const text = res && typeof res.text === 'string' ? res.text.trim() : ''
        if (!text) throw new Error(`AI 没有返回内容：${JSON.stringify((res && res.error) || '')}`)
        workingProvider[model] = p
        return text
      } catch (e) {
        lastError = e
        log(`AI 分组 ${p} 调用模型 ${model} 失败`, e)
      }
    }
    throw lastError
  }
}

module.exports = { createChat }
