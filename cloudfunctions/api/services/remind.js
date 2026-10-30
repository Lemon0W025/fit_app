// 饭点提醒：手机日历闹钟加过没有、微信服务通知开没开、攒了几次「允许」；定时触发器每 10 分钟 tick 一次，快过饭点还没拍的发一条
const { AppError, CODES } = require('../lib/errors')
const { mealTimesOf } = require('../lib/shared/timing')
const { dateKey } = require('../lib/shared/date')
const { CREDITS_MAX, planReminders, messageFor, recordSent } = require('../lib/remind')

const EMPTY = { notify: false, credits: 0, sent: {}, calendar: null }
// 没有次数 / 用户拒收：次数清零，这顿记为发过（不再重试）
const REFUSED = [43101]

function createRemindService({ repo, now, config, send = null, log = () => {} }) {
  // 用户在后台选了模板、填进 config 才有微信提醒；没有就只有日历闹钟
  const template = () => (config && config.remindTemplate && config.remindTemplate.id ? config.remindTemplate : null)

  async function load(openid) {
    return { ...EMPTY, ...((await repo.getReminders(openid)) || {}) }
  }

  async function save(openid, doc) {
    const { _id, _openid, ...rest } = doc
    await repo.saveReminders(openid, rest)
  }

  function view(doc, profile) {
    const t = template()
    return {
      templateId: t ? t.id : '',
      notify: !!doc.notify && !!t,
      credits: doc.credits || 0,
      calendar: doc.calendar || null,
      mealTimes: mealTimesOf(profile),
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
    const next = { ...EMPTY, ...doc }
    let ok = false
    try {
      // 点通知直接进拍照页，这顿已经选好
      const page = `pages/checkin/checkin?mealType=${mealType}&from=remind`
      await send({ touser: openid, templateId: t.id, page, data: messageFor(t, mealType, times, at), miniprogramState: t.state || 'trial' })
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
      return view(doc, profile)
    },

    // 点了「允许」（打卡提交时、打开开关时）：攒一次
    async subscribed(openid, input) {
      const doc = await load(openid)
      if ((input || {}).accepted === true) doc.credits = Math.min(CREDITS_MAX, (doc.credits || 0) + 1)
      await save(openid, doc)
      return view(doc, await repo.getProfile(openid))
    },

    async setNotify(openid, input) {
      if (!template()) throw new AppError(CODES.BAD_REQUEST, '微信提醒还没开通')
      const doc = await load(openid)
      doc.notify = (input || {}).on === true
      await save(openid, doc)
      return view(doc, await repo.getProfile(openid))
    },

    // 手机日历里加好了三个饭点闹钟：记下当时的饭点（饭点改了提示去日历里删旧的）
    async calendarDone(openid, input) {
      const profile = await repo.getProfile(openid)
      const times = (input || {}).times || mealTimesOf(profile)
      const doc = await load(openid)
      doc.calendar = { at: now().getTime(), times: mealTimesOf({ mealTimes: times }) }
      await save(openid, doc)
      return view(doc, profile)
    },

    // 设过提醒没有（新手三步用）：加过日历或开了微信提醒
    async isSet(openid) {
      return (await this.status(openid)).set
    },

    // 今日页要的：设过没有、微信提醒开没开（开了的话打卡提交时顺手申请一次「允许」）、模板 ID
    async status(openid) {
      const doc = await repo.getReminders(openid)
      const t = template()
      return { set: !!(doc && (doc.calendar || doc.notify)), notify: !!(doc && doc.notify && t), templateId: t ? t.id : '' }
    },

    // 定时触发器：开了微信提醒、还有次数的人挨个看
    async tick() {
      const t = template()
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
