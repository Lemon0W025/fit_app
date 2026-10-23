// 与 miniprogram/utils/shared/forest.js 保持一致（test/shared-sync.test.js 会检查）
// 养生森林：每天一棵树，由当天三顿正餐的打卡情况决定长多大

const { addDays } = require('./date')
const { MEAL_LABELS } = require('./meal-types')

const STAGES = ['empty', 'sprout', 'small', 'big', 'bloom', 'fruit']

const STAGE_LABELS = {
  empty: '空地',
  sprout: '树苗',
  small: '小树',
  big: '大树',
  bloom: '开花',
  fruit: '结果',
}

// 加餐照常打卡点评，但不影响树：既不因零食受罚，也不会为了树多吃一顿
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']

function dayTree(meals) {
  // 每种正餐取最新的一条（重拍、重新打卡以最后一次为准）
  const latest = {}
  ;(meals || []).forEach((m) => {
    if (MAIN_MEALS.indexOf(m.mealType) === -1) return
    if (!latest[m.mealType] || m.createdAt > latest[m.mealType].createdAt) latest[m.mealType] = m
  })
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

// 提示还没打卡的下一顿：优先选比已打卡餐次更晚的
function nextMissingMeal(tree) {
  const lastIndex = Math.max(-1, ...tree.logged.map((t) => MAIN_MEALS.indexOf(t)))
  const later = tree.missing.filter((t) => MAIN_MEALS.indexOf(t) > lastIndex)
  return later[0] || tree.missing[0]
}

function treeHint(tree) {
  switch (tree.stage) {
    case 'empty':
      return '打卡一顿正餐，种下今天的树'
    case 'sprout':
      return `再打卡${MEAL_LABELS[nextMissingMeal(tree)]}就能长成小树`
    case 'small':
      return `再打卡${MEAL_LABELS[nextMissingMeal(tree)]}就能长成大树`
    case 'big':
      return '三顿都打卡啦！明天多吃几顿绿色的，就能开花'
    case 'bloom':
      return '真棒！明天三顿都吃成绿色，就能结果'
    default:
      return '今天的树结果啦，完美的一天！'
  }
}

// days：{ 'YYYY-MM-DD': true }，有记录的日子就是有树的日子
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
  STAGE_LABELS,
  MAIN_MEALS,
  dayTree,
  treeHint,
  streakFrom,
}
