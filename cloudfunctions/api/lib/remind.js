// 饭点提醒（微信服务通知）的纯函数：这一刻该提醒哪顿、发什么、发过了记一笔（docs/superpowers/specs/2026-10-25-on-time-checkin-design.md 第二块）

const { MAIN_MEALS, MEAL_WORDS, WINDOW_MINUTES, loggedMeals } = require('./shared/timing')
const { localMinutes, dateKey, addDays, timeText } = require('./shared/date')

const NUDGE_AFTER_MINUTES = 0 // 到饭点就提醒（这顿还没拍的话；到窗口结束为止，每顿每天一次）。11/08 用户从「过了半小时」改成「到饭点」
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

// 这一刻该提醒的餐次：到了饭点、窗口结束（饭点 + 1 小时）前，这顿今天还没拍（什么时候拍的都算），今天这顿还没发过
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
// 我们的说法：meal「到饭点啦，拍午饭吧」、mealTime「2026-10-29 12:00」（time / date 类字段）、tip「13:00 前拍还算准时」、status「还没拍」（phrase 类字段）、name「小暖自律打卡」、endTime「2026-10-29 13:00」（第二个时间字段）
function messageFor(template, mealType, times, now) {
  const word = MEAL_WORDS[mealType]
  const end = clockText(toMinutes(times[mealType]) + WINDOW_MINUTES)
  const values = {
    meal: `到饭点啦，拍${word}吧`,
    mealTime: `${dateKey(now)} ${times[mealType]}`,
    tip: `${end} 前拍还算准时`,
    status: '还没拍',
    name: '小暖自律打卡',
    endTime: `${dateKey(now)} ${end.length < 5 ? `0${end}` : end}`,
  }
  const data = {}
  Object.keys(template.fields || {}).forEach((key) => {
    if (values[key] === undefined) return
    data[template.fields[key]] = { value: String(values[key]).slice(0, THING_MAX) }
  })
  return data
}

// 每顿什么时候会提醒（饭点 + NUDGE_AFTER_MINUTES，这顿还没拍才发）：{ breakfast: '7:30', … }
function nudgeTimes(times) {
  const out = {}
  MAIN_MEALS.forEach((t) => {
    out[t] = clockText(toMinutes(times[t]) + NUDGE_AFTER_MINUTES)
  })
  return out
}

// 「今天 18:30」「昨天 8:00」「11月6日 12:30」
function whenText(ms, now) {
  const day = dateKey(new Date(ms))
  const today = dateKey(now)
  const [, m, d] = day.split('-').map(Number)
  const head = day === today ? '今天' : day === addDays(today, -1) ? '昨天' : `${m}月${d}日`
  return `${head} ${timeText(ms)}`
}

// 试发一条用哪顿：现在在哪顿的窗口里就是哪顿，不在就是下一顿（都过了是早饭）
function mealNow(times, now) {
  const m = localMinutes(now)
  const inside = MAIN_MEALS.find((t) => Math.abs(m - toMinutes(times[t])) <= WINDOW_MINUTES)
  if (inside) return inside
  return MAIN_MEALS.find((t) => toMinutes(times[t]) > m) || MAIN_MEALS[0]
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

module.exports = { NUDGE_AFTER_MINUTES, CREDITS_MAX, planReminders, messageFor, recordSent, nudgeTimes, whenText, mealNow }
