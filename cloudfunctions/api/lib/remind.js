// 饭点提醒（微信服务通知）的纯函数：这一刻该提醒哪顿、发什么、发过了记一笔（docs/superpowers/specs/2026-10-25-on-time-checkin-design.md 第二块）

const { MAIN_MEALS, MEAL_WORDS, WINDOW_MINUTES, loggedMeals } = require('./shared/timing')
const { localMinutes, dateKey, addDays } = require('./shared/date')

const NUDGE_AFTER_MINUTES = 30 // 饭点过了这么久还没拍才提醒（到窗口结束为止）
const CREDITS_MAX = 30 // 「允许」攒的次数最多记这么多
const SENT_DAYS = 7 // 发过的记录留几天
const THING_MAX = 20 // 订阅消息 thing 类字段最多 20 个字

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${m < 10 ? '0' : ''}${m}`
}

// 这一刻该提醒的餐次：饭点 + 30 分钟起、窗口结束（饭点 + 1 小时）前，这顿今天还没拍（什么时候拍的都算），今天这顿还没发过
function planReminders({ times, meals, now, sent }) {
  const m = localMinutes(now)
  const today = (sent || {})[dateKey(now)] || {}
  const logged = loggedMeals(meals)
  return MAIN_MEALS.filter((t) => {
    const at = toMinutes(times[t])
    return m >= at + NUDGE_AFTER_MINUTES && m <= at + WINDOW_MINUTES && !logged[t].logged && !today[t]
  })
}

// 一条提醒的内容：按模板的字段（config.remindTemplate.fields：{ 我们的说法: 模板字段名 }）填。
// 我们的说法：meal「午饭还没拍哦」、mealTime「2026-10-29 12:00」（time / date 类字段）、tip「13:00 前拍还算准时」、name「小暖养生」
function messageFor(template, mealType, times, now) {
  const word = MEAL_WORDS[mealType]
  const end = clockText(toMinutes(times[mealType]) + WINDOW_MINUTES)
  const values = {
    meal: `${word}还没拍哦`,
    mealTime: `${dateKey(now)} ${times[mealType]}`,
    tip: `${end} 前拍还算准时`,
    name: '小暖养生',
  }
  const data = {}
  Object.keys(template.fields || {}).forEach((key) => {
    if (values[key] === undefined) return
    data[template.fields[key]] = { value: String(values[key]).slice(0, THING_MAX) }
  })
  return data
}

// 发过了记一笔（只留最近 7 天）
function recordSent(sent, now, mealType) {
  const today = dateKey(now)
  const keep = addDays(today, -(SENT_DAYS - 1))
  const out = {}
  Object.keys(sent || {}).forEach((d) => {
    if (d >= keep) out[d] = sent[d]
  })
  out[today] = { ...(out[today] || {}), [mealType]: now.getTime() }
  return out
}

module.exports = { NUDGE_AFTER_MINUTES, CREDITS_MAX, planReminders, messageFor, recordSent }
