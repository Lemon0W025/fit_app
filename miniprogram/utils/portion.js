// 结果页改份量（点一道菜 → 抽屉里一根滑杆）：滑杆的范围、快捷按钮、拖的时候跟着变的「约 N 克 · M 千卡」、发给 meal.adjust 的参数。
// 有克数的菜按克数拖（10 克一格，小份 5 克、大份 50 克），没克数的老打卡按「原来的几倍」拖（0.25 倍一格）。纯函数，有单测

const GRAMS_MAX = 3000
const FACTOR = { min: 0.25, max: 3, step: 0.25 }
// 快捷按钮：相对打开时的份量
const CHIPS = [
  { label: '一半', times: 0.5 },
  { label: '少一点', times: 0.75 },
  { label: '原样', times: 1 },
  { label: '多一点', times: 1.5 },
  { label: '两倍', times: 2 },
]

function stepFor(grams) {
  if (grams <= 60) return 5
  if (grams <= 400) return 10
  return 50
}

function snap(v, { min, max, step }) {
  const k = Math.round((v - min) / step)
  return parseFloat(Math.min(max, Math.max(min, min + k * step)).toFixed(6))
}

// 滑杆：克数从一格到原来的 2.5 倍（取整到 10 格），最多 3000 克
function sliderFor(dish) {
  const grams = dish.grams > 0 ? dish.grams : 0
  if (!grams) return { mode: 'factor', ...FACTOR, value: 1, unit: ' 倍', prefix: '×' }
  const step = stepFor(grams)
  const span = step * 10
  const max = Math.min(GRAMS_MAX, Math.max(span, Math.ceil((grams * 2.5) / span) * span))
  return { mode: 'grams', min: step, max, step, value: grams, unit: ' 克', prefix: '' }
}

function kcalAt(dish, mode, value) {
  const ratio = mode === 'grams' ? value / dish.grams : value
  return Math.round(dish.kcal * ratio)
}

function timesText(value) {
  return String(Number(value.toFixed(2)))
}

// 抽屉里的大字：「约 150 克 · 174 千卡」/「原来的 1.5 倍 · 300 千卡」
function previewText(dish, mode, value) {
  const kcal = kcalAt(dish, mode, value)
  if (mode === 'grams') return `约 ${value} 克 · ${kcal} 千卡`
  if (value === 1) return `和原来一样 · ${kcal} 千卡`
  return `原来的 ${timesText(value)} 倍 · ${kcal} 千卡`
}

function chipsFor(slider) {
  const base = slider.value
  return CHIPS.map((c) => ({ label: c.label, value: snap(base * c.times, slider) }))
}

// 打开抽屉时的样子
function adjustView(dish, index) {
  const slider = sliderFor(dish)
  return {
    index,
    name: dish.name,
    title: `${dish.name}吃了多少？`,
    ...slider,
    start: slider.value,
    preview: previewText(dish, slider.mode, slider.value),
    chips: chipsFor(slider),
  }
}

// 「就这么多」：发给 meal.adjust 的参数；和打开时一样就不用发（null）
function adjustRequest(view, value) {
  if (value === view.start) return null
  return view.mode === 'grams' ? { grams: value } : { factor: value }
}

module.exports = { sliderFor, previewText, chipsFor, adjustView, adjustRequest, kcalAt }
