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

// ---------------------------------------------------------------- 养生森林

const GREW_TITLES = {
  sprout: '🌱 种下了今天的树苗',
  small: '🎉 今天的树长成小树了',
  big: '🎉 今天的树长成大树了',
  bloom: '🌸 今天的树开花了',
  fruit: '🍎 今天的树结果了！',
}

// 树苗、小树各树种通用；大树、开花、结果每个树种一张
function treeImage(stage, species) {
  if (!stage || stage === 'future') return ''
  if (stage === 'empty' || stage === 'sprout' || stage === 'small') return `/images/forest/${stage}.png`
  return `/images/forest/${stage}-${species || 'apple'}.png`
}

// 打卡结果页：这次打卡让今天的树发生了什么
function decorateTree(tree) {
  if (!tree) return null
  return {
    ...tree,
    image: treeImage(tree.after, tree.species),
    title: tree.grew && GREW_TITLES[tree.after] ? GREW_TITLES[tree.after] : `今天的树：${tree.stageLabel}`,
  }
}

// 今日页顶部的小树卡片
function treeCard(tree) {
  if (!tree) return null
  return {
    ...tree,
    image: treeImage(tree.stage, tree.species),
    title: tree.stage === 'empty' ? '今天还没种树' : `今天的${tree.speciesName}：${tree.stageLabel}`,
    streakText: tree.streak > 0 ? `🔥 已连续 ${tree.streak} 天` : '',
  }
}

// 森林日历：周一开头，firstWeekday 是 1 号的星期（0 = 周日）
function buildForestCells(days, firstWeekday) {
  const blanks = (firstWeekday + 6) % 7
  const cells = []
  for (let i = 0; i < blanks; i++) cells.push({ key: `blank-${i}`, blank: true })
  days.forEach((d) => {
    cells.push({
      ...d,
      key: d.date,
      future: d.stage === 'future',
      image: treeImage(d.stage, d.species),
    })
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
  treeImage,
  decorateTree,
  treeCard,
  buildForestCells,
}
