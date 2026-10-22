// 与 miniprogram/utils/shared/meal-types.js 保持一致（test/shared-sync.test.js 会检查）

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

const RATING_LABELS = {
  green: '吃得好',
  yellow: '还可以',
  red: '要注意',
}

function isMealType(t) {
  return MEAL_ORDER.indexOf(t) !== -1
}

// 按东八区小时预选餐次，用户可以在打卡页改
function guessMealType(hour) {
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 14) return 'lunch'
  if (hour >= 17 && hour < 21) return 'dinner'
  return 'snack'
}

module.exports = {
  MEAL_ORDER,
  MEAL_LABELS,
  RATING_LABELS,
  isMealType,
  guessMealType,
}
