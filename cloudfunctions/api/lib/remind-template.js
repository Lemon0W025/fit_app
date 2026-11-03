// 一键开通微信提醒：自己在小程序的订阅消息里找一个能用的一次性模板（用餐提醒 / 打卡提醒 / 别的提醒），没有就从公共模板库选一个加上，
// 再从模板内容里认出哪个字段放什么（messageFor 的 meal / mealTime / tip）。
// api 是 wx-server-sdk 的 cloud.openapi.subscribeMessage（getTemplateList / getCategory / getPubTemplateTitleList /
// getPubTemplateKeyWordsById / addTemplate），测试里换成假的

const ONE_TIME = 2 // 模板类型：2 一次性订阅，3 长期订阅
const SEARCH = ['用餐', '吃饭', '饮食', '打卡', '提醒'] // 公共模板库按这几个词搜
// 标题越靠前越想要
const TITLE_RANK = [/用餐提醒|吃饭提醒|饮食提醒/, /用餐|吃饭|饮食|饭/, /打卡提醒/, /打卡/, /提醒/]
const MEAL_NAME = /内容|事项|项目|名称|主题|餐|事件|任务/
const TIME_NAME = /时间|日期/
const TIP_NAME = /提示|备注|说明|温馨|建议/
const SCENE = '到饭点还没拍照打卡时提醒'

const rankOf = (title) => {
  const i = TITLE_RANK.findIndex((re) => re.test(String(title || '')))
  return i === -1 ? TITLE_RANK.length : i
}

// 关键词（{ name, rule, key }）里认出 meal / mealTime / tip 各放哪个；没有能放「哪顿没拍」的 thing 就不能用（null）
function rolesOf(words) {
  const things = words.filter((w) => w.rule === 'thing')
  const times = words.filter((w) => w.rule === 'time' || w.rule === 'date')
  const meal = things.find((w) => MEAL_NAME.test(w.name)) || things[0]
  if (!meal) return null
  const rest = things.filter((w) => w !== meal)
  const tip = rest.find((w) => TIP_NAME.test(w.name)) || rest[0] || null
  const time = times.find((w) => TIME_NAME.test(w.name)) || times[0] || null
  const roles = { meal }
  if (time) roles.mealTime = time
  if (tip) roles.tip = tip
  return roles
}

// 模板内容「提醒内容:{{thing1.DATA}}\n用餐时间:{{time2.DATA}}」→ [{ name, rule, key }]
function wordsOfContent(content) {
  const out = []
  String(content || '').split('\n').forEach((line) => {
    const m = line.match(/^\s*([^:：{]+?)\s*[:：]\s*\{\{\s*([a-z_]+)(\d+)\.DATA\s*\}\}/)
    if (m) out.push({ name: m[1], rule: m[2], key: `${m[2]}${m[3]}` })
  })
  return out
}

// 认出来的 → config.remindTemplate 的 fields：{ meal: 'thing1', mealTime: 'time2', tip: 'thing3' }
function fieldsOf(roles) {
  const out = {}
  Object.keys(roles).forEach((k) => {
    out[k] = roles[k].key
  })
  return out
}

const dataOf = (res) => (res && Array.isArray(res.data) ? res.data : [])

// 找一个能用的模板，返回 { id, title, fields, added }；找不到抛 Error（message 说给用户听）
async function setupTemplate(api) {
  // 1. 已经加过的（自己在后台加的，或者上次加的）：一次性、标题像提醒、字段认得出来
  const mine = dataOf(await api.getTemplateList())
    .filter((t) => t.type === ONE_TIME && rankOf(t.title) < TITLE_RANK.length)
    .map((t) => ({ t, roles: rolesOf(wordsOfContent(t.content)) }))
    .filter((x) => x.roles)
    .sort((a, b) => rankOf(a.t.title) - rankOf(b.t.title))
  if (mine.length) return { id: mine[0].t.priTmplId, title: mine[0].t.title, fields: fieldsOf(mine[0].roles), added: false }

  // 2. 公共模板库：按小程序的服务类目、几个关键词搜一次性模板
  const cats = dataOf(await api.getCategory())
  if (!cats.length) throw new Error('小程序还没有设置服务类目，到后台「设置 → 基本设置 → 服务类目」加一个再来')
  const ids = cats.map((c) => c.id).join(',')
  const seen = new Set()
  const titles = []
  for (const keyword of SEARCH) {
    const list = dataOf(await api.getPubTemplateTitleList({ ids, start: 0, limit: 30, keyword }))
    list.forEach((t) => {
      if (t.type !== ONE_TIME || seen.has(t.tid) || rankOf(t.title) >= TITLE_RANK.length) return
      seen.add(t.tid)
      titles.push(t)
    })
  }
  titles.sort((a, b) => rankOf(a.title) - rankOf(b.title))

  // 3. 挑第一个关键词够用的加上（最多三个关键词：哪顿没拍、饭点、提示）
  for (const t of titles) {
    const words = dataOf(await api.getPubTemplateKeyWordsById({ tid: t.tid })).map((w) => ({ name: w.name, rule: w.rule, kid: w.kid, key: `${w.rule}${w.kid}` }))
    const roles = rolesOf(words)
    if (!roles) continue
    const kidList = ['meal', 'mealTime', 'tip'].filter((k) => roles[k]).map((k) => roles[k].kid)
    const added = await api.addTemplate({ tid: String(t.tid), kidList, sceneDesc: SCENE })
    const id = added && added.priTmplId
    if (!id) continue
    // 字段名以加好的模板内容为准（一般就是 rule + kid）
    const real = dataOf(await api.getTemplateList()).find((x) => x.priTmplId === id)
    const realRoles = real ? rolesOf(wordsOfContent(real.content)) : null
    return { id, title: t.title, fields: fieldsOf(realRoles || roles), added: true }
  }
  throw new Error('公共模板库里没找到能用的提醒模板，到后台「订阅消息」里手动选一个「用餐提醒」')
}

module.exports = { setupTemplate, rolesOf, wordsOfContent }
