// 结果页改份量（点一道菜 → 抽屉里一根滑杆）：滑杆的范围、快捷按钮、拖的时候跟着变的「约 N 克 · M 千卡」、发给 meal.adjust 的参数。
// 有克数的菜按克数拖（10 克一格，小份 5 克、大份 50 克），没克数的老打卡按「原来的几倍」拖（0.25 倍一格）。纯函数，有单测

const GRAMS_MAX = 3000
const FACTOR = { min: 0.25, max: 3, step: 0.25 }
// 快捷按钮：相对打开时的份量
const CHIPS = [
  { label: '少一点', times: 0.75 },
  { label: '原样', times: 1 },
  { label: '多一点', times: 1.5 },
  { label: '两倍', times: 2 },
]
// 分着吃：一整份（一盘、一锅）里她吃了几分之一
const PARTS = [
  { label: '全部', times: 1 },
  { label: '一半', times: 1 / 2 },
  { label: '三分之一', times: 1 / 3 },
  { label: '四分之一', times: 1 / 4 },
  { label: '五分之一', times: 1 / 5 },
]
// 几个人一起吃：就我、2～5 人，「更多」弹出 6 / 7 / 8 / 10
const PEOPLE_MORE = [6, 7, 8, 10]

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

// 一整份是现在的几倍：大家夹的菜（shared 不是 false）按人数分过，整份 = 她那份 × 人数
const wholeTimes = (dish, people) => (dish.shared === false ? 1 : Math.max(1, people || 1))

// 「一整份里我吃了」那排：克数按格子落；倍数（老打卡）保留两位小数
function partsFor(slider, dish, people) {
  const whole = slider.value * wholeTimes(dish, people)
  return PARTS.map((p) => ({
    label: p.label,
    value: slider.mode === 'grams' ? snap(whole * p.times, slider) : Math.round(whole * p.times * 100) / 100,
  }))
}

// 打开抽屉时的样子（people：这顿几个人一起吃）。滑杆最多拖到整份（大家夹的按人数算整盘）
function adjustView(dish, index, people = 1) {
  const slider = sliderFor(dish)
  const times = wholeTimes(dish, people)
  if (times > 1) {
    if (slider.mode === 'grams') {
      const span = slider.step * 10
      slider.max = Math.min(GRAMS_MAX, Math.max(slider.max, Math.ceil((slider.value * times) / span) * span))
    } else {
      slider.max = Math.max(slider.max, times)
    }
  }
  return {
    index,
    name: dish.name,
    title: `${dish.name}吃了多少？`,
    ...slider,
    start: slider.value,
    preview: previewText(dish, slider.mode, slider.value),
    chips: chipsFor(slider),
    parts: partsFor(slider, dish, people),
  }
}

// 「几个人一起吃？」那排：就我、2～5 人、更多（选了 6 人以上「更多」那格写人数）
function peopleChips(people) {
  const n = people || 1
  const chips = [{ value: 1, label: '就我' }]
  for (let i = 2; i <= 5; i++) chips.push({ value: i, label: `${i} 人` })
  chips.push({ value: 'more', label: n > 5 ? `${n} 人` : '更多' })
  return chips.map((c) => ({ ...c, on: c.value === n || (c.value === 'more' && n > 5) }))
}

// 结果页大字下面那句
const peopleText = (people) => (people > 1 ? `${people} 个人一起吃，算的是你那一份` : '')

// 「就这么多」：发给 meal.adjust 的参数；和打开时一样就不用发（null）
function adjustRequest(view, value) {
  if (value === view.start) return null
  return view.mode === 'grams' ? { grams: value } : { factor: value }
}

module.exports = { sliderFor, previewText, chipsFor, partsFor, adjustView, adjustRequest, kcalAt, peopleChips, peopleText, PEOPLE_MORE }
