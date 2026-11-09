// 饭点提醒：手机日历闹钟加过没有、微信服务通知开没开、攒了几次「允许」；定时触发器每 10 分钟 tick 一次，到了饭点这顿还没拍的发一条
const { AppError, CODES } = require('../lib/errors')
const { mealTimesOf, MEAL_WORDS, MAIN_MEALS } = require('../lib/shared/timing')
const { dateKey } = require('../lib/shared/date')
const { CREDITS_MAX, planReminders, messageFor, recordSent, nudgeTimes, whenText, mealNow } = require('../lib/remind')
const { setupTemplate } = require('../lib/remind-template')

const EMPTY = { notify: false, credits: 0, sent: {}, calendar: null }
// 没有次数 / 用户拒收：次数清零，这顿记为发过（不再重试）
const REFUSED = [43101]
const SETTING = 'remindTemplate'
const TICK = 'remindTick' // 定时检查最近一次跑的时间（提醒页显示，看触发器在不在跑）
const TICK_STALE_MS = 25 * 60 * 1000 // 触发器每 10 分钟一次：25 分钟没跑过就算停了
// 点通知打开哪个版本：跟着她「允许」时用的那个（开发版预览 / 体验版 / 正式版）
const VERSIONS = { develop: 'developer', trial: 'trial', release: 'formal' }

// wxapi：cloud.openapi.subscribeMessage（一键开通时找模板、加模板用）
function createRemindService({ repo, now, config, send = null, wxapi = null, log = () => {} }) {
  // 模板：config.remindTemplate 填了用它；没填用「一键开通」存在 settings 里的；都没有就只有日历闹钟
  async function template() {
    if (config && config.remindTemplate && config.remindTemplate.id) return config.remindTemplate
    const saved = await repo.getSetting(SETTING)
    return saved && saved.id ? saved : null
  }

  async function load(openid) {
    return { ...EMPTY, ...((await repo.getReminders(openid)) || {}) }
  }

  async function save(openid, doc) {
    const { _id, _openid, ...rest } = doc
    await repo.saveReminders(openid, rest)
  }

  // 手机日历里加了哪几顿（{ breakfast: '07:30', … }，记的是加的时候的饭点）。
  // 11/09 以前是一次点击连着加三个，微信只认点击里的第一个（早饭），所以老记录只算早饭加上了
  function calendarMeals(cal) {
    if (!cal) return {}
    if (cal.meals) return cal.meals
    return cal.times && cal.times.breakfast ? { breakfast: cal.times.breakfast } : {}
  }

  // 上次提醒的结果：「今天 18:30 晚饭的提醒发出去了」/「…没发出去（错误码 47003）」
  function lastText(last) {
    if (!last || !last.at) return ''
    const what = `${whenText(last.at, now())} ${MEAL_WORDS[last.mealType] || ''}${last.test ? '的试发' : '的提醒'}`
    return last.ok ? `${what}发出去了` : `${what}没发出去（错误码 ${last.code || '未知'}）`
  }

  // 定时检查（触发器）在不在跑：没跑过 / 停了就标出来，免得以为开着提醒其实发不出去
  function tickState(tick) {
    if (!tick || !tick.at) return { tickText: '⚠️ 自动检查一次都还没跑过：到饭点不会自动提醒，只能手动试发。告诉家里人', tickBad: true }
    const when = whenText(tick.at, now())
    if (now().getTime() - tick.at > TICK_STALE_MS) return { tickText: `⚠️ 自动检查最后一次是 ${when}，之后停了：到饭点不会自动提醒。告诉家里人`, tickBad: true }
    return { tickText: `定时检查：${when} 看过一次（每 10 分钟一次）`, tickBad: false }
  }

  function view(doc, profile, t, tick) {
    const times = mealTimesOf(profile)
    return {
      templateId: t ? t.id : '',
      notify: !!doc.notify && !!t,
      credits: doc.credits || 0,
      calendar: doc.calendar ? { at: doc.calendar.at, times: doc.calendar.times, meals: calendarMeals(doc.calendar) } : null,
      mealTimes: times,
      nudgeAt: nudgeTimes(times),
      lastText: lastText(doc.last),
      ...tickState(tick),
    }
  }

  async function viewOf(openid, doc, profile) {
    const [p, t, tick] = await Promise.all([profile === undefined ? repo.getProfile(openid) : profile, template(), repo.getSetting(TICK)])
    return view(doc, p, t, tick)
  }

  // 发一条：成功用掉一次；失败记下错误码（43101 是没有次数了，清零）
  async function sendOne(openid, doc, t, mealType, times, at, test) {
    const next = { ...EMPTY, ...doc }
    try {
      // 点通知直接进拍照页，这顿已经选好
      const page = `pages/checkin/checkin?mealType=${mealType}&from=remind`
      await send({ touser: openid, templateId: t.id, page, data: messageFor(t, mealType, times, at), miniprogramState: doc.version || t.state || 'trial' })
      next.credits = Math.max(0, (doc.credits || 0) - 1)
      next.last = { at: at.getTime(), mealType, ok: true, test: !!test }
      return { next, ok: true }
    } catch (e) {
      const code = e && (e.errCode || e.code)
      log('remind send failed', code, e && e.message)
      next.last = { at: at.getTime(), mealType, ok: false, code: code || null, test: !!test }
      if (REFUSED.indexOf(code) !== -1) next.credits = 0
      return { next, ok: false, code, refused: REFUSED.indexOf(code) !== -1 }
    }
  }

  // 给一个人看看这一刻要不要发、发了就记下
  async function remindOne(doc, t) {
    const openid = doc._openid || doc._id
    const profile = await repo.getProfile(openid)
    if (!profile) return 0
    const times = mealTimesOf(profile)
    const at = now()
    const meals = await repo.listMeals(openid, dateKey(at))
    const due = planReminders({ times, meals, now: at, sent: doc.sent })
    if (!due.length || !(doc.credits > 0)) return 0
    const mealType = due[0]
    const { next, ok, refused } = await sendOne(openid, doc, t, mealType, times, at, false)
    // 发出去了或者没次数了：这顿记为发过；别的错（比如网络）下次触发器再试，只记下错误码
    if (ok || refused) next.sent = recordSent(doc.sent, at, mealType)
    await save(openid, next)
    return ok ? 1 : 0
  }

  return {
    async get(openid) {
      const [doc, profile] = await Promise.all([load(openid), repo.getProfile(openid)])
      return viewOf(openid, doc, profile)
    },

    // 一键开通微信提醒：找一个能用的订阅消息模板（没有就从公共模板库加一个），存下来大家共用
    async setup(openid) {
      if (!(await template())) {
        if (!wxapi) throw new AppError(CODES.BAD_REQUEST, '微信提醒现在开通不了')
        let found
        try {
          found = await setupTemplate(wxapi)
        } catch (e) {
          log('remind setup failed', e && (e.errCode || e.code), e && e.message)
          const code = e && (e.errCode || e.code)
          const detail = e && e.detail ? ` · ${e.detail}` : ''
          throw new AppError(CODES.BAD_REQUEST, code ? `微信提醒没开通成功（错误码 ${code}${detail}），把这句截图发给家里人` : (e && e.message) || '微信提醒没开通成功')
        }
        await repo.saveSetting(SETTING, { id: found.id, title: found.title, fields: found.fields, state: 'trial', at: now().getTime() })
      }
      return this.get(openid)
    },

    // 点了「允许」（打卡提交时、打开开关时、点首页拍照时）：攒一次；记下她用的是哪个版本（点通知打开那个版本）
    async subscribed(openid, input) {
      const src = input || {}
      const doc = await load(openid)
      if (src.accepted === true) doc.credits = Math.min(CREDITS_MAX, (doc.credits || 0) + 1)
      if (VERSIONS[src.version]) doc.version = VERSIONS[src.version]
      await save(openid, doc)
      return viewOf(openid, doc)
    },

    // 现在发一条试试（提醒页的按钮）：按现在这顿发，和真的提醒长得一样；用掉一次「允许」
    async test(openid) {
      const t = await template()
      if (!t || !send) throw new AppError(CODES.BAD_REQUEST, '微信提醒还没开通')
      const doc = await load(openid)
      if (!(doc.credits > 0)) throw new AppError(CODES.BAD_REQUEST, '还没有「允许」次数：弹出来时点「允许」再试')
      const profile = await repo.getProfile(openid)
      const times = mealTimesOf(profile)
      const at = now()
      const { next, ok, code, refused } = await sendOne(openid, doc, t, mealNow(times, at), times, at, true)
      await save(openid, next)
      if (!ok) {
        throw new AppError(CODES.BAD_REQUEST, refused ? '微信说「允许」次数用完了：弹出来时点「允许」再试' : `没发出去（错误码 ${code || '未知'}），把这句截图发给家里人`)
      }
      return viewOf(openid, next, profile)
    },

    async setNotify(openid, input) {
      if (!(await template())) throw new AppError(CODES.BAD_REQUEST, '微信提醒还没开通')
      const doc = await load(openid)
      doc.notify = (input || {}).on === true
      await save(openid, doc)
      return viewOf(openid, doc)
    },

    // 手机日历里加好了一顿的闹钟（微信一次点击只能加一个）：记下这顿和当时的饭点（饭点改了提示去日历里删旧的）。
    // 不带 mealType 的（老版本）当三顿都加了
    async calendarDone(openid, input) {
      const src = input || {}
      const profile = await repo.getProfile(openid)
      const times = mealTimesOf({ mealTimes: src.times || mealTimesOf(profile) })
      const doc = await load(openid)
      const meals = { ...calendarMeals(doc.calendar) }
      const which = MAIN_MEALS.indexOf(src.mealType) !== -1 ? [src.mealType] : MAIN_MEALS
      which.forEach((t) => {
        meals[t] = times[t]
      })
      doc.calendar = { at: now().getTime(), times, meals }
      await save(openid, doc)
      return viewOf(openid, doc, profile)
    },

    // 设过提醒没有（新手三步用）：加过日历或开了微信提醒
    async isSet(openid) {
      return (await this.status(openid)).set
    },

    // 今日页要的：设过没有、微信提醒开没开（开了的话打卡提交时顺手申请一次「允许」）、模板 ID
    async status(openid) {
      const [doc, t] = await Promise.all([repo.getReminders(openid), template()])
      return { set: !!(doc && (doc.calendar || doc.notify)), notify: !!(doc && doc.notify && t), templateId: t ? t.id : '' }
    },

    // 定时触发器：开了微信提醒、还有次数的人挨个看
    async tick() {
      const t = await template()
      if (!t || !send) return { sent: 0 }
      const docs = await repo.listReminders()
      let sent = 0
      for (const doc of docs) {
        try {
          sent += await remindOne(doc, t)
        } catch (e) {
          log('remind tick failed', e)
        }
      }
      // 记一笔「刚看过」：提醒页能看出定时触发器在不在跑
      try {
        await repo.saveSetting(TICK, { at: now().getTime(), people: docs.length, sent })
      } catch (e) {
        log('remind tick save failed', e)
      }
      return { sent }
    },

    template,
  }
}

module.exports = { createRemindService }
