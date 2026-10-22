// 模型输出不一定守规矩：可能带代码块围栏、前后有废话、字段缺失或数值离谱，这里统一兜住

const { round1 } = require('./shared/nutrition')

const RATINGS = ['green', 'yellow', 'red']
const MAX_FOODS = 12
const MAX_FOOD_KCAL = 5000
const MAX_TOTAL_KCAL = 10000
const MAX_MACRO_GRAMS = 1000

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
      kcal: Math.round(num(f.kcal, MAX_FOOD_KCAL)),
    }))
  const foodsKcal = foods.reduce((sum, f) => sum + f.kcal, 0)

  return {
    isFood: true,
    foods,
    totalKcal: Math.round(num(raw.totalKcal, MAX_TOTAL_KCAL)) || Math.min(foodsKcal, MAX_TOTAL_KCAL),
    protein: round1(num(raw.protein, MAX_MACRO_GRAMS)),
    carbs: round1(num(raw.carbs, MAX_MACRO_GRAMS)),
    fat: round1(num(raw.fat, MAX_MACRO_GRAMS)),
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
