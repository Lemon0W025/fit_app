// 把云函数返回的数据整理成页面直接能用的展示字段（纯函数，有单测）

const { MEAL_ORDER, MEAL_LABELS, RATING_LABELS } = require('./shared/meal-types')
const { timeText, dateLabel } = require('./shared/date')
const { MEAL_WORDS } = require('./shared/timing')
const { BEANS } = require('./shared/forest')
const { petImage } = require('./camp-view')
const { milestoneLine } = require('./milestone-lines')

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

// 早 / 午 / 晚三个印章：cls 对应 app.wxss 里的颜色，准时拍的再加金边 stamp-on
function stampsView(stamps) {
  return (stamps || []).map((s) => ({ key: s.mealType, label: s.label, cls: `stamp-${s.state}${s.onTime ? ' stamp-on' : ''}` }))
}

// 结果页暖豆横幅的标题；shown 是滚动时正在显示的数（默认就是这次得的）
function gainTitle(gain, shown = gain.beans) {
  if (!(gain.beans > 0)) return '这顿记下啦'
  return gain.timing === 'on' ? `${MEAL_WORDS[gain.mealType]}准时打卡 +${shown} 暖豆` : `+${shown} 暖豆`
}

// 打卡结果页：这次打卡多得了多少暖豆，准时的写清楚是哪顿准时；fresh（刚打完卡进来）时这顿的印章要「盖」一下
function decorateGain(gain, { fresh = false } = {}) {
  if (!gain) return null
  const stamps = stampsView(gain.stamps).map((s) => (fresh && s.key === gain.mealType ? { ...s, cls: `${s.cls} fx-stamp` } : s))
  return {
    title: gainTitle(gain),
    bonus: gain.allOnTime ? `三顿都准时，再加 ${BEANS.allOnTime}！` : '',
    hint: gain.hint,
    stamps,
  }
}

// 暖豆卡上的连续天数，带着下一枚纪念章的盼头
function streakText(daily) {
  const streak = daily.streak || 0
  if (!streak) return '今天拍一顿，开始连续打卡'
  const head = `🔥 已连续 ${streak} 天`
  const next = daily.nextMilestone
  if (!next) return head
  if (next.left === 1) {
    const todayDone = (daily.stamps || []).some((s) => s.state !== 'none')
    return `${head} · ${todayDone ? '明天再拍' : '今天拍一顿'}就拿 ${next.days} 天纪念章`
  }
  return `${head} · 再 ${next.left} 天拿 ${next.days} 天纪念章`
}

// 今日页、打卡日历顶部的「今天的暖豆」卡片
function beansCard(daily) {
  if (!daily) return null
  return {
    title: daily.beansToday > 0 ? `今天得了 ${daily.beansToday} 暖豆` : '今天还没打卡',
    hint: daily.hint,
    stamps: stampsView(daily.stamps),
    streakText: streakText(daily),
    onTimeText: daily.monthOnTime > 0 ? `本月准时 ${daily.monthOnTime} 顿` : '',
  }
}

// 「40 分钟」「1 小时 40 分」「1 小时」
function leftText(minutes) {
  if (minutes < 60) return `${minutes} 分钟`
  const m = minutes % 60
  return `${Math.floor(minutes / 60)} 小时${m ? ` ${m} 分` : ''}`
}

// 首页「下一顿」大卡：shared/timing.js 的 mealStatus → 页面字段。mealType 是按钮带去打卡页的餐次，small 是只给一个小链接
function nextMealCard(s) {
  if (!s) return null
  if (s.state === 'allDone') {
    return { state: 'allDone', title: s.allOnTime ? '今天三顿都准时拍了 ✓' : '今天三顿都拍完啦 ✓', sub: '', button: '加餐也可以拍', mealType: 'snack', small: true, warn: false }
  }
  const card = { state: s.state, title: `${s.word} · ${s.time}`, sub: `${s.window} 拍算准时`, button: `📷 拍${s.word}`, mealType: s.mealType, small: false, warn: false }
  if (s.state === 'open') card.sub = `${s.window} 拍算准时，还剩 ${leftText(s.minutesLeft)}`
  if (s.state === 'missed') Object.assign(card, { title: `${s.word}还没拍`, sub: '现在补拍也算数', button: `📷 补拍${s.word}`, warn: true })
  if (s.state === 'done') {
    Object.assign(card, {
      title: s.onTime ? `${s.word}准时拍了 ✓` : `${s.word}拍了 ✓`,
      sub: s.next ? `下一顿：${s.next.word} ${s.next.time}` : '',
      button: '拍加餐',
      mealType: 'snack',
      small: true,
    })
  }
  return card
}

// 打卡日历：周一开头，firstWeekday 是 1 号的星期（0 = 周日）；没打正餐的日子不画印章，月历看着清爽
function buildCalendarCells(days, firstWeekday, today = '') {
  const blanks = (firstWeekday + 6) % 7
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push({ key: `blank-${i}`, blank: true })
  days.forEach((d) => {
    const logged = d.beans > 0
    cells.push({ ...d, key: d.date, isToday: d.date === today, stamps: logged ? stampsView(d.stamps) : [], beansText: logged ? `+${d.beans}` : '' })
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

// ---------------------------------------------------------------- 连续打卡里程碑

// 结果页的庆祝卡
function milestoneView(m) {
  if (!m) return null
  return {
    days: m.days,
    tier: m.tier,
    glow: m.glow,
    title: `连续打卡 ${m.days} 天！`,
    sub: m.times > 1 ? `第 ${m.times} 次做到` : '',
    line: milestoneLine(m.days),
    image: m.petId ? petImage(m.petId) : '/images/garden/ui/bean.png',
  }
}

// 打卡日历顶上的一排纪念章
function badgesView(badges) {
  return (badges || []).map((b) => {
    const [y, m, d] = (b.first || '').split('-')
    return {
      ...b,
      label: b.got || !b.left ? `${b.days} 天` : `还差 ${b.left} 天`,
      firstText: b.first ? `${y}年${Number(m)}月${Number(d)}日` : '',
    }
  })
}

// 打卡页等小暖分析时的几步：有照片先上传
function analysisSteps(hasPhoto, at) {
  const labels = hasPhoto ? ['上传照片', '认出菜', '算热量'] : ['认出菜', '算热量']
  return labels.map((label, i) => ({ label, state: i < at ? 'done' : i === at ? 'now' : 'todo' }))
}

module.exports = {
  decorateMeal,
  buildDayView,
  greetingText,
  stampsView,
  gainTitle,
  decorateGain,
  streakText,
  beansCard,
  nextMealCard,
  buildCalendarCells,
  milestoneView,
  badgesView,
  analysisSteps,
}
