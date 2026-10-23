// 把云函数返回的数据整理成页面直接能用的展示字段（纯函数，有单测）

const { MEAL_ORDER, MEAL_LABELS, RATING_LABELS } = require('./shared/meal-types')
const { timeText, dateLabel } = require('./shared/date')

// 还没建档时进度条用的兜底预算
const FALLBACK_DAILY_KCAL = 1500

function decorateMeal(meal) {
  const a = meal.analysis
  const view = {
    label: MEAL_LABELS[meal.mealType] || '加餐',
    timeText: meal.createdAt ? timeText(meal.createdAt) : '',
    foodsText: a && a.foods ? a.foods.map((f) => f.name).join('、') : '',
  }

  if (meal.status !== 'done' || !a) {
    Object.assign(view, { ratingClass: 'failed', ratingText: '待分析', kcalText: '分析失败', commentText: meal.error || '点开重新分析' })
  } else if (a.isFood === false) {
    Object.assign(view, { ratingClass: 'none', ratingText: '', kcalText: '不计热量', commentText: a.comment || '' })
  } else {
    Object.assign(view, {
      ratingClass: RATING_LABELS[a.rating] ? a.rating : 'none',
      ratingText: RATING_LABELS[a.rating] || '',
      kcalText: `约 ${a.totalKcal} 千卡`,
      commentText: a.comment || '',
    })
  }
  return { ...meal, ...view }
}

function sortMeals(meals) {
  return meals.slice().sort((a, b) => {
    const byType = MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)
    return byType !== 0 ? byType : a.createdAt - b.createdAt
  })
}

function buildDayView(day) {
  const dailyKcal = day.dailyKcal || FALLBACK_DAILY_KCAL
  const kcal = day.totals.kcal
  const remaining = dailyKcal - kcal
  const over = remaining < 0
  let statusText = `还可以吃 ${remaining} 千卡`
  if (over) statusText = `已超出 ${-remaining} 千卡，下一餐清淡些`
  else if (kcal === 0) statusText = `今天的预算是 ${dailyKcal} 千卡`

  return {
    date: day.date,
    dateLabel: dateLabel(day.date),
    dailyKcal,
    totals: day.totals,
    remaining,
    over,
    percent: Math.min(100, Math.round((kcal / dailyKcal) * 100)),
    statusText,
    meals: sortMeals(day.meals || []).map(decorateMeal),
    summary: day.summary || null,
    hasProfile: !!day.profile,
  }
}

// ---------------------------------------------------------------- 每日暖豆

// 早 / 午 / 晚三个印章：cls 对应 app.wxss 里的颜色
function stampsView(stamps) {
  return (stamps || []).map((s) => ({ key: s.mealType, label: s.label, cls: `stamp-${s.state}` }))
}

// 打卡结果页：这次打卡多得了多少暖豆
function decorateGain(gain) {
  if (!gain) return null
  return {
    title: gain.beans > 0 ? `+${gain.beans} 暖豆` : '这顿记下啦',
    hint: gain.hint,
    stamps: stampsView(gain.stamps),
  }
}

// 今日页、打卡日历顶部的「今天的暖豆」卡片
function beansCard(daily) {
  if (!daily) return null
  return {
    title: daily.beansToday > 0 ? `今天得了 ${daily.beansToday} 暖豆` : '今天还没打卡',
    hint: daily.hint,
    stamps: stampsView(daily.stamps),
    streakText: daily.streak > 0 ? `🔥 已连续 ${daily.streak} 天` : '',
  }
}

// 打卡日历：周一开头，firstWeekday 是 1 号的星期（0 = 周日）；没打正餐的日子不画印章，月历看着清爽
function buildCalendarCells(days, firstWeekday) {
  const blanks = (firstWeekday + 6) % 7
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push({ key: `blank-${i}`, blank: true })
  days.forEach((d) => {
    const logged = d.beans > 0
    cells.push({ ...d, key: d.date, stamps: logged ? stampsView(d.stamps) : [], beansText: logged ? `+${d.beans}` : '' })
  })
  return cells
}

function greetingText(hour, nickname) {
  let hello = '晚上好'
  if (hour >= 5 && hour < 11) hello = '早上好'
  else if (hour >= 11 && hour < 13) hello = '中午好'
  else if (hour >= 13 && hour < 18) hello = '下午好'
  return nickname ? `${hello}，${nickname}` : hello
}

module.exports = {
  decorateMeal,
  buildDayView,
  greetingText,
  stampsView,
  decorateGain,
  beansCard,
  buildCalendarCells,
}
