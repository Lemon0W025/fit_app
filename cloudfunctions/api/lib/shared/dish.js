// 一道菜的份量怎么变（云函数 meal.adjust / meal.share 存的，和小程序结果页拖滑杆时的预览，都按这一套算，算出来一样）：
//   resize(dish, { grams } | { factor })  她说吃了多少克 / 原来的几倍 → { dish: 改好的这道菜 } 或 { error: 说给她听的话 }
//   share(dish, before, people)           大家夹的菜按人数分：before 个人 → people 个人
//   totalsAfter(analysis, dish, next)     一道菜从 dish 变成 next（null = 删掉）以后，这顿的总热量和营养素
//   isShared(dish)                        大家夹的菜（单独盛给她的标 false；没标的老打卡当成大家夹的）
//   peopleOf(v)                           几个人一起吃：1～20 的整数，不对就当一个人
// 两边逐字节一致（cloudfunctions/api/lib/shared/ 和 miniprogram/utils/shared/）

const { round1 } = require('./nutrition')

const LIMITS = {
  gramsMin: 1,
  gramsMax: 3000,
  factorMin: 0.1,
  factorMax: 5,
  dishKcalMax: 5000,
  dishMacroMax: 500,
  peopleMax: 20,
}
const MACROS = ['protein', 'carbs', 'fat']

const isShared = (dish) => dish.shared !== false

function peopleOf(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= LIMITS.peopleMax ? n : 1
}

const clampGrams = (g) => Math.min(LIMITS.gramsMax, Math.max(LIMITS.gramsMin, Math.round(g)))

// 改到多少：{ grams（新克数，没克数的菜是 0）, ratio（热量、营养素乘多少）} 或 { error }
function scaleOf(dish, src) {
  const has = dish.grams > 0
  if (src.grams !== undefined) {
    const g = src.grams
    if (typeof g !== 'number' || !isFinite(g) || g < LIMITS.gramsMin || g > LIMITS.gramsMax) {
      return { error: `克数要在 ${LIMITS.gramsMin}～${LIMITS.gramsMax} 之间` }
    }
    if (!has) return { error: '这道菜没有记克数，按比例改吧' }
    const grams = Math.round(g)
    return { grams, ratio: grams / dish.grams }
  }
  if (src.factor !== undefined) {
    const f = src.factor
    if (typeof f !== 'number' || !isFinite(f) || f < LIMITS.factorMin || f > LIMITS.factorMax) {
      return { error: '份量改得太离谱了' }
    }
    if (!has) return { grams: 0, ratio: f }
    const grams = clampGrams(dish.grams * f)
    return { grams, ratio: grams / dish.grams }
  }
  return { error: '要改成多少？' }
}

function scaled(v, ratio, max) {
  return Math.min(max, v * ratio)
}

// 她自己改的：热量、营养素（有的话）按比例缩放，记上「改过」；之后按人数分从这儿算（base 去掉）
function resize(dish, src) {
  const s = scaleOf(dish, src || {})
  if (s.error) return { error: s.error }
  const next = { ...dish, kcal: Math.round(scaled(dish.kcal, s.ratio, LIMITS.dishKcalMax)), adjusted: true }
  delete next.base
  if (s.grams > 0) next.grams = s.grams
  MACROS.forEach((k) => {
    if (typeof dish[k] === 'number') next[k] = round1(scaled(dish[k], s.ratio, LIMITS.dishMacroMax))
  })
  return { dish: next }
}

function pickMacros(dish) {
  const out = {}
  MACROS.forEach((k) => {
    if (typeof dish[k] === 'number') out[k] = dish[k]
  })
  return out
}

// 每次都从第一次分之前的样子（base：那时的克数、热量、营养素和人数）算，改来改去、改回原来的人数不会越算越偏；
// 她单独改过这道菜（resize）就以她改的为准
function share(dish, before, people) {
  const base = dish.base || { grams: dish.grams || 0, kcal: dish.kcal, people: before, ...pickMacros(dish) }
  const next = { ...dish }
  delete next.base
  if (people === base.people) {
    next.kcal = base.kcal
    if (base.grams > 0) next.grams = base.grams
    MACROS.forEach((k) => {
      if (typeof base[k] === 'number') next[k] = base[k]
    })
    return next
  }
  const ratio = base.people / people
  next.kcal = Math.round(scaled(base.kcal, ratio, LIMITS.dishKcalMax))
  if (base.grams > 0) next.grams = clampGrams(base.grams * ratio)
  MACROS.forEach((k) => {
    if (typeof base[k] === 'number') next[k] = round1(scaled(base[k], ratio, LIMITS.dishMacroMax))
  })
  next.base = base
  return next
}

// 按这道菜的变化量加减（老打卡的总数是 AI 给的、不一定等于菜之和，别的菜那部分不动）。
// 这道菜没有营养素（老打卡）时，总营养素按总热量的比例缩放
function totalsAfter(a, dish, next) {
  const totalKcal = Math.max(0, Math.round((a.totalKcal || 0) + (next ? next.kcal : 0) - dish.kcal))
  const out = { totalKcal }
  const byDish = typeof dish.protein === 'number'
  MACROS.forEach((k) => {
    const old = a[k] || 0
    if (byDish) out[k] = Math.max(0, round1(old + (next ? next[k] : 0) - dish[k]))
    else out[k] = a.totalKcal > 0 ? round1((old * totalKcal) / a.totalKcal) : old
  })
  return out
}

module.exports = { LIMITS, isShared, peopleOf, resize, share, totalsAfter }
