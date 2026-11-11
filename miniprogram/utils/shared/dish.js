// 一道菜的份量怎么变（云函数 meal.adjust / meal.share 存的，和小程序结果页拖滑杆时的预览，都按这一套算，算出来一样）：
//   resize(dish, { grams } | { factor })  用户说吃了多少克 / 原来的几倍 → { dish: 改好的这道菜 } 或 { error: 说给用户听的话 }
//   reportion(analysis, before, after)    这一顿怎么吃的变了（how = { people 几个人, appetite 饭量, left 剩了多少, tune 整体比估的多还是少 }）→ { foods, totalKcal, protein, carbs, fat }
//   eatenOf(dish, how)                    这道菜吃了估出来那份的几成：大家夹的按人数和饭量分，再乘上剩了多少、整体多还是少
//   share(dish, before, after)            一道菜从吃 before 成变成吃 after 成（reportion 里用，一般不用直接调）
//   totalsAfter(analysis, dish, next)     一道菜从 dish 变成 next（null = 删掉）以后，这顿的总热量和营养素
//   isShared(dish)                        大家夹的菜（单独盛的标 false；没标的老打卡当成大家夹的）
//   peopleOf(v) / appetiteOf(v) / leftOf(v) / tuneOf(v)  不对的值都落回默认：一个人 / 差不多 / 全吃了 / 差不多
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
// 和别人一起吃时的饭量：大家夹的菜平分以后再乘这个（比别人吃得少 / 差不多 / 比别人吃得多）
const APPETITE = { less: 0.7, same: 1, more: 1.3 }
// 吃完了吗：全吃了 / 剩了一点 / 剩了一半
const LEFT = { none: 1, some: 0.85, half: 0.5 }
// 整体估得准不准（结果页一键调）：实际吃的比估的少一些 / 差不多 / 多一些。自己单独改过份量的菜已经是准的，不跟着变
const TUNE = { less: 0.8, same: 1, more: 1.25 }
const EPS = 1e-9

const isShared = (dish) => dish.shared !== false

function peopleOf(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= LIMITS.peopleMax ? n : 1
}

const appetiteOf = (v) => (Object.prototype.hasOwnProperty.call(APPETITE, v) ? v : 'same')
const leftOf = (v) => (Object.prototype.hasOwnProperty.call(LEFT, v) ? v : 'none')
const tuneOf = (v) => (Object.prototype.hasOwnProperty.call(TUNE, v) ? v : 'same')

// 这道菜吃了估出来那份（一个人吃、全吃完）的几成。一个人吃时饭量不算（拍到多少就是多少）；分到的最多整份；
// 整体多 / 少（tune）每道菜都乘，自己改过份量的那道除外
function eatenOf(dish, how) {
  const h = how || {}
  const people = peopleOf(h.people)
  const part = isShared(dish) && people > 1 ? Math.min(1, APPETITE[appetiteOf(h.appetite)] / people) : 1
  const tune = dish.adjusted ? 1 : TUNE[tuneOf(h.tune)]
  return part * LEFT[leftOf(h.left)] * tune
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

// 用户自己改的：热量、营养素（有的话）按比例缩放，记上「改过」，「拿不准」去掉；之后按人数分从这儿算（base 去掉）
function resize(dish, src) {
  const s = scaleOf(dish, src || {})
  if (s.error) return { error: s.error }
  const next = { ...dish, kcal: Math.round(scaled(dish.kcal, s.ratio, LIMITS.dishKcalMax)), adjusted: true }
  delete next.base
  delete next.unsure
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

// 每次都从第一次变之前的样子（base：那时的克数、热量、营养素，和那时吃了几成 part）算，改来改去、改回原来的不会越算越偏；
// 用户单独改过这道菜（resize）就以改的为准。老打卡的 base 记的是人数（people），当成 1 / 人数
function share(dish, before, after) {
  const base = dish.base || { grams: dish.grams || 0, kcal: dish.kcal, part: before, ...pickMacros(dish) }
  const basePart = base.part > 0 ? base.part : 1 / (base.people || 1)
  const next = { ...dish }
  delete next.base
  if (Math.abs(after - basePart) < EPS) {
    next.kcal = base.kcal
    if (base.grams > 0) next.grams = base.grams
    MACROS.forEach((k) => {
      if (typeof base[k] === 'number') next[k] = base[k]
    })
    return next
  }
  const ratio = after / basePart
  next.kcal = Math.round(scaled(base.kcal, ratio, LIMITS.dishKcalMax))
  if (base.grams > 0) next.grams = clampGrams(base.grams * ratio)
  MACROS.forEach((k) => {
    if (typeof base[k] === 'number') next[k] = round1(scaled(base[k], ratio, LIMITS.dishMacroMax))
  })
  next.base = base
  return next
}

// 这一顿怎么吃的变了（几个人、饭量、剩了多少）：每道菜按「吃了几成」的变化缩放，总数按每道菜的变化量加减。
// 没变的菜原样返回（单独盛的菜改人数不动）
function reportion(a, before, after) {
  let totals = { totalKcal: a.totalKcal, protein: a.protein, carbs: a.carbs, fat: a.fat }
  const foods = (a.foods || []).map((dish) => {
    const from = eatenOf(dish, before)
    const to = eatenOf(dish, after)
    if (Math.abs(from - to) < EPS) return dish
    const next = share(dish, from, to)
    totals = totalsAfter({ ...a, ...totals }, dish, next)
    return next
  })
  return { foods, ...totals }
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

module.exports = { LIMITS, APPETITE, LEFT, TUNE, isShared, peopleOf, appetiteOf, leftOf, tuneOf, eatenOf, resize, share, reportion, totalsAfter }
