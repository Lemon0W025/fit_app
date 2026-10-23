// 与 miniprogram/utils/shared/forest.js 保持一致（test/shared-sync.test.js 会检查）
// 每天的打卡档位：由当天三顿正餐的打卡情况决定当天得多少暖豆；界面上显示成早 / 午 / 晚三个印章

const { addDays } = require('./date')
const { MEAL_LABELS } = require('./meal-types')
const { STAGE_BEANS, nextStageGain } = require('./garden')

const STAGES = ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit']

// 加餐照常打卡点评，但不算进每天的暖豆：既不因零食受罚，也不会为了暖豆多吃一顿
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']
const STAMP_LABELS = { breakfast: '早', lunch: '午', dinner: '晚' }

// 每种正餐取最新的一条（重拍、重新打卡以最后一次为准）
function latestMainMeals(meals) {
  const latest = {}
  ;(meals || []).forEach((m) => {
    if (MAIN_MEALS.indexOf(m.mealType) === -1) return
    if (!latest[m.mealType] || m.createdAt > latest[m.mealType].createdAt) latest[m.mealType] = m
  })
  return latest
}

function dayTree(meals) {
  const latest = latestMainMeals(meals)
  const logged = MAIN_MEALS.filter((t) => latest[t])
  const missing = MAIN_MEALS.filter((t) => !latest[t])
  // 分析失败的打卡也算打卡了，只是没有评级
  const greens = logged.filter((t) => {
    const m = latest[t]
    return m.status === 'done' && m.analysis && m.analysis.rating === 'green'
  }).length

  let stage = 'empty'
  if (logged.length === 1) stage = 'sprout'
  else if (logged.length === 2) stage = 'small'
  else if (logged.length === 3) stage = greens === 3 ? 'fruit' : greens === 2 ? 'bloom' : 'big'

  return { stage, logged, missing, greens }
}

// 早 / 午 / 晚三个印章：评级的颜色；分析失败但打了卡是 done；没打卡是 none
function mealStamps(meals) {
  const latest = latestMainMeals(meals)
  return MAIN_MEALS.map((t) => {
    const m = latest[t]
    let state = 'none'
    if (m) state = m.status === 'done' && m.analysis && m.analysis.rating ? m.analysis.rating : 'done'
    return { mealType: t, label: STAMP_LABELS[t], state }
  })
}

// 提示还没打卡的下一顿：优先选比已打卡餐次更晚的
function nextMissingMeal(tree) {
  const lastIndex = Math.max(-1, ...tree.logged.map((t) => MAIN_MEALS.indexOf(t)))
  const later = tree.missing.filter((t) => MAIN_MEALS.indexOf(t) > lastIndex)
  return later[0] || tree.missing[0]
}

function beansHint(tree) {
  switch (tree.stage) {
    case 'empty':
      return `打卡一顿正餐就能得 ${STAGE_BEANS.sprout} 暖豆`
    case 'sprout':
    case 'small':
      return `再打卡${MEAL_LABELS[nextMissingMeal(tree)]}还能得 ${nextStageGain(tree.stage)} 暖豆`
    case 'big':
      return '三顿都打卡啦！明天多吃绿色的，暖豆更多'
    case 'bloom':
      return `真棒！明天三顿都吃成绿色，能拿满 ${STAGE_BEANS.fruit} 暖豆`
    default:
      return '三顿都吃得好，今天的暖豆拿满啦！'
  }
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
  STAGES,
  MAIN_MEALS,
  dayTree,
  mealStamps,
  beansHint,
  streakFrom,
}
