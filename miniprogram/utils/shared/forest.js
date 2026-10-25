// 与 miniprogram/utils/shared/forest.js 保持一致（test/shared-sync.test.js 会检查）
// 每天的暖豆和早 / 午 / 晚三个印章：看三顿正餐拍了没有、是不是准时拍的（饭点规则在 timing.js）、吃得好不好

const { addDays } = require('./date')
const { MAIN_MEALS, MEAL_WORDS, loggedMeals, mealStatus, windowText } = require('./timing')

// 准时拍一顿 15、不在饭点拍 5、三顿都准时再加 15、评级「吃得好」（绿）每顿 5；加餐照常点评但不算暖豆
const BEANS = { onTime: 15, offTime: 5, allOnTime: 15, green: 5 }
const STAMP_LABELS = { breakfast: '早', lunch: '午', dinner: '晚' }

// 每种正餐最新的一条（重拍以最后一次的评级为准）
function latestMainMeals(meals) {
  const latest = {}
  ;(meals || []).forEach((m) => {
    if (MAIN_MEALS.indexOf(m.mealType) === -1) return
    if (!latest[m.mealType] || m.createdAt > latest[m.mealType].createdAt) latest[m.mealType] = m
  })
  return latest
}

function ratingOf(m) {
  return m && m.status === 'done' && m.analysis && m.analysis.rating ? m.analysis.rating : null
}

// 这一天的暖豆；logged / onTime 是拍了的、准时拍了的正餐
function dayBeans(meals) {
  const logged = loggedMeals(meals)
  const latest = latestMainMeals(meals)
  let beans = 0
  MAIN_MEALS.forEach((t) => {
    if (!logged[t].logged) return
    beans += logged[t].onTime ? BEANS.onTime : BEANS.offTime
    if (ratingOf(latest[t]) === 'green') beans += BEANS.green
  })
  const onTime = MAIN_MEALS.filter((t) => logged[t].onTime)
  const allOnTime = onTime.length === MAIN_MEALS.length
  if (allOnTime) beans += BEANS.allOnTime
  return { beans, logged: MAIN_MEALS.filter((t) => logged[t].logged), onTime, allOnTime }
}

// 早 / 午 / 晚三个印章：state 是评级的颜色（分析失败但打了卡是 done，没打卡是 none），onTime 是有没有准时拍的一次
function mealStamps(meals) {
  const logged = loggedMeals(meals)
  const latest = latestMainMeals(meals)
  return MAIN_MEALS.map((t) => ({
    mealType: t,
    label: STAMP_LABELS[t],
    state: logged[t].logged ? ratingOf(latest[t]) || 'done' : 'none',
    onTime: logged[t].onTime,
  }))
}

// 卡片上的一句话：围绕「下一顿准时拍」说能得多少暖豆
function beansHint(meals, times, now) {
  const s = mealStatus(meals, times, now)
  const day = dayBeans(meals)
  if (s.state === 'open' || s.state === 'upcoming') {
    const last = day.onTime.length === MAIN_MEALS.length - 1 ? `，三顿都准时再加 ${BEANS.allOnTime}` : ''
    return `${s.word} ${s.window} 拍算准时，能得 ${BEANS.onTime} 暖豆${last}`
  }
  if (s.state === 'missed') return `${s.word}过点了，现在补拍也有 ${BEANS.offTime} 暖豆`
  if (s.state === 'done' && s.next) return `下一顿${s.next.word} ${windowText(s.next.mealType, times)} 拍算准时`
  const missing = MAIN_MEALS.filter((t) => day.logged.indexOf(t) === -1)
  if (missing.length) return `${missing.map((t) => MEAL_WORDS[t]).join('、')}还没拍，补拍也有 ${BEANS.offTime} 暖豆`
  return day.allOnTime ? '三顿都准时拍了，真棒！' : '三顿都拍完啦！明天按饭点拍，暖豆更多'
}

// 一段日子里准时拍的正餐顿数（每天每顿最多算一次）
function onTimeCount(meals) {
  const byDate = {}
  ;(meals || []).forEach((m) => {
    ;(byDate[m.date] = byDate[m.date] || []).push(m)
  })
  return Object.keys(byDate).reduce((sum, d) => sum + dayBeans(byDate[d]).onTime.length, 0)
}

// days：{ 'YYYY-MM-DD': true }，有正餐打卡的日子
// 今天还没打卡时算到昨天为止，今天还有机会续上
function streakFrom(days, today) {
  const has = (d) => !!(days && days[d])
  let d = has(today) ? today : addDays(today, -1)
  let count = 0
  while (has(d)) {
    count += 1
    d = addDays(d, -1)
  }
  return count
}

module.exports = {
  MAIN_MEALS,
  BEANS,
  dayBeans,
  mealStamps,
  beansHint,
  onTimeCount,
  streakFrom,
}
