// 饭点提醒：手机日历闹钟加过没有、微信服务通知开没开、攒了几次「允许」；定时触发器每 10 分钟 tick 一次，快过饭点还没拍的发一条
const { AppError, CODES } = require('../lib/errors')
const { mealTimesOf } = require('../lib/shared/timing')
const { dateKey } = require('../lib/shared/date')
const { CREDITS_MAX, planReminders, messageFor, recordSent } = require('../lib/remind')
const { setupTemplate } = require('../lib/remind-template')

const EMPTY = { notify: false, credits: 0, sent: {}, calendar: null }
// 没有次数 / 用户拒收：次数清零，这顿记为发过（不再重试）
const REFUSED = [43101]
const SETTING = 'remindTemplate'
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

  function view(doc, profile, t) {
    return {
      templateId: t ? t.id : '',
      notify: !!doc.notify && !!t,
      credits: doc.credits || 0,
      calendar: doc.calendar || null,
      mealTimes: mealTimesOf(profile),
    }
  }

  async function viewOf(openid, doc, profile) {
    return view(doc, profile === undefined ? await repo.getProfile(openid) : profile, await template())
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
    const next = { ...EMPTY, ...doc }
    let ok = false
    try {
      // 点通知直接进拍照页，这顿已经选好
      const page = `pages/checkin/checkin?mealType=${mealType}&from=remind`
      await send({ touser: openid, templateId: t.id, page, data: messageFor(t, mealType, times, at), miniprogramState: doc.version || t.state || 'trial' })
      ok = true
      next.credits = Math.max(0, (doc.credits || 0) - 1)
    } catch (e) {
      const code = e && (e.errCode || e.code)
      log('remind send failed', code, e && e.message)
      if (REFUSED.indexOf(code) === -1) return 0
      next.credits = 0
    }
    next.sent = recordSent(doc.sent, at, mealType)
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

    async setNotify(openid, input) {
      if (!(await template())) throw new AppError(CODES.BAD_REQUEST, '微信提醒还没开通')
      const doc = await load(openid)
      doc.notify = (input || {}).on === true
      await save(openid, doc)
      return viewOf(openid, doc)
    },

    // 手机日历里加好了三个饭点闹钟：记下当时的饭点（饭点改了提示去日历里删旧的）
    async calendarDone(openid, input) {
      const profile = await repo.getProfile(openid)
      const times = (input || {}).times || mealTimesOf(profile)
      const doc = await load(openid)
      doc.calendar = { at: now().getTime(), times: mealTimesOf({ mealTimes: times }) }
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
      return { sent }
    },

    template,
  }
}

module.exports = { createRemindService }
