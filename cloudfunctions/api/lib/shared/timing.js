// 与 miniprogram/utils/shared/timing.js 保持一致（test/shared-sync.test.js 会检查）
// 饭点和「准时」：三顿饭各有一个饭点，饭点前后 WINDOW_MINUTES 分钟内（含两端）拍算准时。都按东八区本地时间算；
// 饭点能设的范围保证所有窗口都落在 04:00～22:00，不跨午夜

const { localMinutes } = require('./date')

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']
const MEAL_WORDS = { breakfast: '早饭', lunch: '午饭', dinner: '晚饭' }
const DEFAULT_MEAL_TIMES = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const WINDOW_MINUTES = 60
// 每顿饭点能设的范围（含两端，半小时一档）；相邻两顿至少隔两个半窗口，窗口不重叠
const MEAL_TIME_RANGES = { breakfast: ['05:00', '10:00'], lunch: ['10:30', '14:00'], dinner: ['16:00', '21:00'] }
const MIN_GAP_MINUTES = 2 * WINDOW_MINUTES
// 过点没拍的那顿，过点多久以内首页大卡还先提醒补拍它
const MISSED_RECENT_MINUTES = 120

function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(typeof hhmm === 'string' ? hhmm : '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`
}

// 设置饭点的选项：范围内每半小时一个
function timeOptions(mealType) {
  const [from, to] = MEAL_TIME_RANGES[mealType].map(toMinutes)
  const out = []
  for (let t = from; t <= to; t += 30) out.push(clockText(t))
  return out
}

function isValidTime(mealType, hhmm) {
  return timeOptions(mealType).indexOf(hhmm) !== -1
}

// 档案里的饭点，没设过或不合法的用默认
function mealTimesOf(profile) {
  const src = (profile && profile.mealTimes) || {}
  const out = {}
  MAIN_MEALS.forEach((t) => {
    out[t] = isValidTime(t, src[t]) ? src[t] : DEFAULT_MEAL_TIMES[t]
  })
  return out
}

// 保存档案时校验：哪顿没传就用默认；每顿在范围内、半小时一档；相邻两顿至少隔 2 小时
function validateMealTimes(input) {
  const src = input && typeof input === 'object' ? input : {}
  const value = {}
  const errors = []
  MAIN_MEALS.forEach((t) => {
    value[t] = src[t] === undefined ? DEFAULT_MEAL_TIMES[t] : src[t]
    if (!isValidTime(t, value[t])) {
      const [from, to] = MEAL_TIME_RANGES[t]
      errors.push(`${MEAL_WORDS[t]}时间要在 ${from}～${to} 之间，按半小时选`)
    }
  })
  if (!errors.length) {
    const tooClose = MAIN_MEALS.slice(1).some((t, i) => toMinutes(value[t]) - toMinutes(value[MAIN_MEALS[i]]) < MIN_GAP_MINUTES)
    if (tooClose) errors.push('相邻两顿饭至少隔 2 小时')
  }
  return { value, errors }
}

function windowOf(mealType, times) {
  const at = toMinutes(times[mealType])
  return { start: at - WINDOW_MINUTES, end: at + WINDOW_MINUTES }
}

function windowText(mealType, times) {
  const w = windowOf(mealType, times)
  return `${clockText(w.start)}～${clockText(w.end)}`
}

// 这一刻拍这顿算不算准时：'on' 窗口内（含两端）/ 'early' 窗口前 / 'late' 窗口后；加餐没有饭点，返回 null
function timingFor(mealType, at, times) {
  if (MAIN_MEALS.indexOf(mealType) === -1) return null
  const m = localMinutes(at)
  const w = windowOf(mealType, times)
  if (m < w.start) return 'early'
  if (m > w.end) return 'late'
  return 'on'
}

// 现在正在哪顿的窗口里（打卡页预选餐次用）；不在任何窗口里返回 null
function mealAt(times, at) {
  const m = localMinutes(at)
  const hit = MAIN_MEALS.find((t) => {
    const w = windowOf(t, times)
    return m >= w.start && m <= w.end
  })
  return hit || null
}

// 今天每顿正餐：拍了没有、有没有一次是准时拍的
function loggedMeals(meals) {
  const out = {}
  MAIN_MEALS.forEach((t) => {
    out[t] = { logged: false, onTime: false }
  })
  ;(meals || []).forEach((m) => {
    const d = out[m.mealType]
    if (!d) return
    d.logged = true
    if (m.timing === 'on') d.onTime = true
  })
  return out
}

// 首页「下一顿」大卡，按顺序取第一条成立的：
//   1. 正在某顿的窗口里：拍了 → done，没拍 → open
//   2. 某顿刚过点不到 2 小时、还没拍 → missed
//   3. 之后还有没拍的 → 最近的那顿 upcoming
//   4. 今天还有过了点没拍的 → 最晚的那顿 missed
//   5. 三顿都拍了 → allDone
function mealStatus(meals, times, now) {
  const logged = loggedMeals(meals)
  const m = localMinutes(now)
  const card = (state, t, extra) => ({ state, mealType: t, word: MEAL_WORDS[t], time: times[t], window: windowText(t, times), ...extra })
  const nextAfter = (t) => {
    const later = MAIN_MEALS.slice(MAIN_MEALS.indexOf(t) + 1).find((x) => !logged[x].logged)
    return later ? { mealType: later, word: MEAL_WORDS[later], time: times[later] } : null
  }

  const current = mealAt(times, now)
  if (current) {
    if (logged[current].logged) return card('done', current, { onTime: logged[current].onTime, next: nextAfter(current) })
    return card('open', current, { minutesLeft: windowOf(current, times).end - m })
  }
  const recent = MAIN_MEALS.find((t) => {
    const end = windowOf(t, times).end
    return !logged[t].logged && m > end && m - end <= MISSED_RECENT_MINUTES
  })
  if (recent) return card('missed', recent)
  const upcoming = MAIN_MEALS.find((t) => !logged[t].logged && windowOf(t, times).start > m)
  if (upcoming) return card('upcoming', upcoming)
  const missed = MAIN_MEALS.filter((t) => !logged[t].logged)
  if (missed.length) return card('missed', missed[missed.length - 1])
  return { state: 'allDone', allOnTime: MAIN_MEALS.every((t) => logged[t].onTime) }
}

module.exports = {
  MAIN_MEALS,
  MEAL_WORDS,
  DEFAULT_MEAL_TIMES,
  WINDOW_MINUTES,
  MEAL_TIME_RANGES,
  timeOptions,
  mealTimesOf,
  validateMealTimes,
  windowText,
  timingFor,
  mealAt,
  loggedMeals,
  mealStatus,
}
