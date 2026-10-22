// 与 miniprogram/utils/shared/nutrition.js 保持一致（test/shared-sync.test.js 会检查）

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
}

const ACTIVITY_LABELS = {
  sedentary: '久坐少动',
  light: '轻度活动（散步、家务）',
  moderate: '中度活动（每周运动 3-5 次）',
}

// 每日热量下限，低于这个数不利于健康，也很难坚持
const MIN_KCAL = {
  female: 1200,
  male: 1500,
}

const DEFICIT = 500

function round1(n) {
  return Math.round(n * 10) / 10
}

// Mifflin-St Jeor 公式
function calcBMR({ sex, age, heightCm, weightKg }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

function calcDailyKcal(profile) {
  const factor = ACTIVITY_FACTORS[profile.activity] || ACTIVITY_FACTORS.sedentary
  const tdee = calcBMR(profile) * factor
  const wantsToLose = profile.targetWeightKg < profile.weightKg
  const target = wantsToLose ? tdee - DEFICIT : tdee
  const floor = MIN_KCAL[profile.sex] || MIN_KCAL.female
  return Math.round(Math.max(target, floor) / 10) * 10
}

function sumMeals(meals) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  ;(meals || []).forEach((meal) => {
    if (meal.status !== 'done' || !meal.analysis) return
    total.kcal += meal.analysis.totalKcal || 0
    total.protein += meal.analysis.protein || 0
    total.carbs += meal.analysis.carbs || 0
    total.fat += meal.analysis.fat || 0
  })
  return {
    kcal: Math.round(total.kcal),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  }
}

module.exports = {
  ACTIVITY_FACTORS,
  ACTIVITY_LABELS,
  MIN_KCAL,
  DEFICIT,
  round1,
  calcBMR,
  calcDailyKcal,
  sumMeals,
}
