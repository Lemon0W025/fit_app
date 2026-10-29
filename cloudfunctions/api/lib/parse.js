// 模型输出不一定守规矩：可能带代码块围栏、前后有废话、字段缺失或数值离谱，这里统一兜住

const { round1 } = require('./shared/nutrition')

const RATINGS = ['green', 'yellow', 'red']
const MAX_FOODS = 12
const MAX_FOOD_KCAL = 5000
const MAX_TOTAL_KCAL = 10000
const MAX_MACRO_GRAMS = 1000
const MAX_DISH_GRAMS = 3000
const MAX_DISH_MACRO = 500
const MACROS = ['protein', 'carbs', 'fat']

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('AI 没有返回内容')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('AI 返回的不是 JSON')
  const obj = JSON.parse(text.slice(start, end + 1))
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('AI 返回的不是 JSON 对象')
  return obj
}

function num(v, max) {
  const n = Number(v)
  if (!isFinite(n) || n < 0) return 0
  return Math.min(n, max)
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

// 一道菜的三大营养素：三样都给了才算（缺一样就整道菜不记，总数退回用 AI 给的）
function dishMacros(f) {
  if (MACROS.some((k) => f[k] == null || f[k] === '' || !isFinite(Number(f[k])))) return null
  const out = {}
  MACROS.forEach((k) => {
    out[k] = round1(num(f[k], MAX_DISH_MACRO))
  })
  return out
}

function parseMealAnalysis(text) {
  const raw = extractJson(text)
  const comment = str(raw.comment, 200)
  const suggestion = str(raw.suggestion, 200)

  if (raw.isFood === false) {
    return { isFood: false, foods: [], totalKcal: 0, protein: 0, carbs: 0, fat: 0, rating: null, comment, suggestion }
  }

  const foods = (Array.isArray(raw.foods) ? raw.foods : [])
    .filter((f) => f && typeof f === 'object')
    .slice(0, MAX_FOODS)
    .map((f) => ({
      name: str(f.name, 20) || '未知食物',
      portion: str(f.portion, 20),
      // 估计吃下去的克数，0 = 没给（老格式）
      grams: Math.round(num(f.grams, MAX_DISH_GRAMS)),
      kcal: Math.round(num(f.kcal, MAX_FOOD_KCAL)),
      ...dishMacros(f),
      // 大家一起夹的（一盘、一锅）true，单独盛给她的（一碗饭）false；没说就不记（当成大家夹的）
      ...(typeof f.shared === 'boolean' ? { shared: f.shared } : {}),
    }))
  // 总数由程序按菜加总（AI 自己加常常对不上）；菜的热量全是 0（只给了总数）或没有菜时才用 AI 的总数
  const foodsKcal = foods.reduce((sum, f) => sum + f.kcal, 0)
  const totalKcal = foodsKcal > 0 ? Math.min(foodsKcal, MAX_TOTAL_KCAL) : Math.round(num(raw.totalKcal, MAX_TOTAL_KCAL))
  const byDish = foods.length > 0 && foodsKcal > 0 && foods.every((f) => 'protein' in f)
  const macro = (k) => round1(num(byDish ? foods.reduce((sum, f) => sum + f[k], 0) : raw[k], MAX_MACRO_GRAMS))

  return {
    isFood: true,
    foods,
    totalKcal,
    protein: macro('protein'),
    carbs: macro('carbs'),
    fat: macro('fat'),
    rating: RATINGS.indexOf(raw.rating) !== -1 ? raw.rating : 'yellow',
    comment,
    suggestion,
  }
}

function cleanSummaryText(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 400)
}

module.exports = { extractJson, parseMealAnalysis, cleanSummaryText }
