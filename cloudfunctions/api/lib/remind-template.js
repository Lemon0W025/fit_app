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
const PICK = ['meal', 'mealTime', 'tip', 'status'] // 从公共模板库加老模板时选这几个关键词（name / endTime 不加）
const MAX_TRIES = 6
// 新版一次性模板（tid 10000001 起）：关键词是模板定死的，addTemplate 的 kidList 只能传空数组（传了就报 200020）
const isNewTid = (tid) => Number(tid) >= 10000001 && Number(tid) < 20000000

const rankOf = (title) => {
  const i = TITLE_RANK.findIndex((re) => re.test(String(title || '')))
  return i === -1 ? TITLE_RANK.length : i
}

// 关键词（{ name, rule, key }）里认出各放什么：meal「到饭点啦，拍午饭吧」（thing）、mealTime 饭点（time / date）、tip 提示（另一个 thing）、
// status「还没拍」（phrase）、name 小程序名字（再多一个 thing）、endTime 准时截止（再多一个 time / date）。
// 没有能放「哪顿没拍」的 thing 就不能用（null）
function rolesOf(words) {
  const things = words.filter((w) => w.rule === 'thing')
  const times = words.filter((w) => w.rule === 'time' || w.rule === 'date')
  const meal = things.find((w) => MEAL_NAME.test(w.name)) || things[0]
  if (!meal) return null
  const rest = things.filter((w) => w !== meal)
  const tip = rest.find((w) => TIP_NAME.test(w.name)) || rest[0] || null
  const name = rest.find((w) => w !== tip) || null
  const time = times.find((w) => TIME_NAME.test(w.name)) || times[0] || null
  const endTime = times.find((w) => w !== time) || null
  const status = words.find((w) => w.rule === 'phrase') || null
  const roles = { meal }
  if (time) roles.mealTime = time
  if (tip) roles.tip = tip
  if (status) roles.status = status
  if (name) roles.name = name
  if (endTime) roles.endTime = endTime
  return roles
}

// 模板里每个字段我们都填得上（订阅消息少填一个字段就发不出去）
function coversAll(words, roles) {
  const used = new Set(Object.keys(roles).map((k) => roles[k].key))
  return words.every((w) => used.has(w.key))
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

// 调微信接口，出错时在错误上记一笔是哪一步（报错时带给用户截图）
async function step(name, fn) {
  try {
    return await fn()
  } catch (e) {
    const err = e && typeof e === 'object' ? e : new Error(String(e))
    if (!err.detail) err.detail = name
    throw err
  }
}

// 找一个能用的模板，返回 { id, title, fields, added }；找不到抛 Error（message 说给用户听）
async function setupTemplate(api) {
  // 1. 已经加过的（自己在后台加的，或者上次加的）：一次性、标题像提醒、字段认得出来
  const mine = dataOf(await step('读我的模板', () => api.getTemplateList()))
    .filter((t) => t.type === ONE_TIME && rankOf(t.title) < TITLE_RANK.length)
    .map((t) => ({ t, words: wordsOfContent(t.content) }))
    .map((x) => ({ ...x, roles: rolesOf(x.words) }))
    .filter((x) => x.roles && coversAll(x.words, x.roles))
    .sort((a, b) => rankOf(a.t.title) - rankOf(b.t.title))
  if (mine.length) return { id: mine[0].t.priTmplId, title: mine[0].t.title, fields: fieldsOf(mine[0].roles), added: false }

  // 2. 公共模板库：按小程序的服务类目、几个关键词搜一次性模板
  const cats = dataOf(await step('读服务类目', () => api.getCategory()))
  if (!cats.length) throw new Error('小程序还没有设置服务类目，到后台「设置 → 基本设置 → 服务类目」加一个再来')
  const ids = cats.map((c) => c.id).join(',')
  const seen = new Set()
  const titles = []
  for (const keyword of SEARCH) {
    const list = dataOf(await step(`搜模板库「${keyword}」`, () => api.getPubTemplateTitleList({ ids, start: 0, limit: 30, keyword })))
    list.forEach((t) => {
      if (t.type !== ONE_TIME || seen.has(t.tid) || rankOf(t.title) >= TITLE_RANK.length) return
      seen.add(t.tid)
      titles.push(t)
    })
  }
  titles.sort((a, b) => rankOf(a.title) - rankOf(b.title))

  // 3. 挑一个加上，哪个加不上就换下一个，最多试 MAX_TRIES 次，都不行把最后一次的错误码带出去：
  //    新版模板（isNewTid）关键词定死、kidList 传空数组，所以每个关键词我们都得填得上，填不上的跳过；
  //    老模板自己挑 2～5 个关键词（数字 kid），只认得出一个的跳过，加不上先少挑几个再试
  let lastError = null
  let tries = 0
  for (const t of titles) {
    if (tries >= MAX_TRIES) break
    let raw
    try {
      raw = await step(`读关键词 ${t.title} ${t.tid}`, () => api.getPubTemplateKeyWordsById({ tid: t.tid }))
    } catch (e) {
      lastError = e
      continue
    }
    const words = dataOf(raw)
      .map((w) => ({ name: w.name, rule: w.rule, kid: Number(w.kid), key: `${w.rule}${w.kid}` }))
    const roles = rolesOf(words)
    if (!roles) continue
    const fresh = isNewTid(t.tid)
    let tryLists
    if (fresh) {
      if (!coversAll(words, roles)) continue
      tryLists = [[]]
    } else {
      const kids = PICK.filter((k) => roles[k]).map((k) => roles[k].kid).filter((k) => Number.isFinite(k))
      if (kids.length < 2) continue
      tryLists = kids.length > 2 ? [kids, kids.slice(0, 2)] : [kids]
    }
    for (const kidList of tryLists) {
      if (tries >= MAX_TRIES) break
      tries += 1
      let id = null
      try {
        const added = await api.addTemplate({ tid: String(t.tid), kidList, sceneDesc: SCENE })
        id = added && added.priTmplId
      } catch (e) {
        lastError = e && typeof e === 'object' ? e : new Error(String(e))
        lastError.detail = `${t.title} ${t.tid}${kidList.length ? ` ${kidList.join(',')}` : ''}`
        console.log('remind template add failed', t.tid, t.title, kidList, e && (e.errCode || e.code), e && e.message)
        continue
      }
      if (!id) continue
      // 字段名以加好的模板内容为准（一般就是 rule + kid）；内容里有我们填不上的字段就不用它
      const real = dataOf(await step('读加好的模板', () => api.getTemplateList())).find((x) => x.priTmplId === id)
      if (real) {
        const realWords = wordsOfContent(real.content)
        const realRoles = rolesOf(realWords)
        if (realRoles && coversAll(realWords, realRoles)) return { id, title: t.title, fields: fieldsOf(realRoles), added: true }
        console.log('remind template has fields we cannot fill', id, real.content)
        continue
      }
      const picked = {}
      Object.keys(roles).forEach((k) => {
        if (fresh || kidList.indexOf(roles[k].kid) !== -1) picked[k] = roles[k]
      })
      return { id, title: t.title, fields: fieldsOf(picked), added: true }
    }
  }
  if (lastError) throw lastError
  throw new Error('公共模板库里没找到能用的提醒模板，到后台「订阅消息」里手动选一个「用餐提醒」')
}

module.exports = { setupTemplate, rolesOf, wordsOfContent, coversAll, isNewTid }
