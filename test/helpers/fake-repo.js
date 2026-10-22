// 内存版 repo，接口与 cloudfunctions/api/repo.js 完全一致，用于测试 services

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

function createFakeRepo() {
  const state = {
    profiles: new Map(),
    meals: [],
    summaries: new Map(),
    weights: new Map(),
    gardens: new Map(),
    seq: 0,
  }

  return {
    state,

    async getProfile(openid) {
      return clone(state.profiles.get(openid)) || null
    },
    async saveProfile(openid, profile) {
      state.profiles.set(openid, clone(profile))
    },

    async listMeals(openid, date) {
      return state.meals
        .filter((m) => m._openid === openid && m.date === date)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(clone)
    },
    async listMealsBetween(openid, startDate, endDate) {
      return state.meals
        .filter((m) => m._openid === openid && m.date >= startDate && m.date <= endDate)
        .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
        .map(clone)
    },
    async getMeal(openid, id) {
      const meal = state.meals.find((m) => m._id === id && m._openid === openid)
      return meal ? clone(meal) : null
    },
    async addMeal(meal) {
      state.seq += 1
      const id = 'meal' + state.seq
      state.meals.push({ ...clone(meal), _id: id })
      return id
    },
    async updateMeal(id, patch) {
      const meal = state.meals.find((m) => m._id === id)
      Object.assign(meal, clone(patch))
    },
    async deleteMeal(id) {
      state.meals = state.meals.filter((m) => m._id !== id)
    },

    async getSummary(openid, date) {
      return clone(state.summaries.get(`${openid}_${date}`)) || null
    },
    async saveSummary(openid, date, doc) {
      state.summaries.set(`${openid}_${date}`, { ...clone(doc), _openid: openid, date })
    },

    async getGarden(openid) {
      return clone(state.gardens.get(openid)) || null
    },
    async saveGarden(openid, garden) {
      state.gardens.set(openid, clone(garden))
    },

    async saveWeight(openid, date, weightKg) {
      state.weights.set(`${openid}_${date}`, { _openid: openid, date, weightKg })
    },
    async listWeights(openid, limit) {
      return [...state.weights.values()]
        .filter((w) => w._openid === openid)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-limit)
        .map((w) => ({ date: w.date, weightKg: w.weightKg }))
    },
  }
}

// 按顺序返回预设结果的假 AI；结果可以是字符串、Error 或函数
function createFakeChat(results) {
  const queue = [...results]
  const calls = []
  async function chat(req) {
    calls.push(req)
    const next = queue.shift()
    if (next instanceof Error) throw next
    if (typeof next === 'function') return next(req)
    if (next === undefined) throw new Error('fake chat: no more results')
    return next
  }
  chat.calls = calls
  return chat
}

const PROFILE = {
  nickname: '妈妈',
  sex: 'female',
  age: 50,
  heightCm: 160,
  weightKg: 70,
  targetWeightKg: 60,
  activity: 'light',
  avoid: '',
  dailyKcal: 1270,
  createdAt: 1,
  updatedAt: 1,
}

// 北京时间 2026-10-22 12:00
const NOW = new Date('2026-10-22T04:00:00Z')
const TODAY = '2026-10-22'

const CONFIG = {
  provider: 'hunyuan-exp',
  visionModel: 'vision-model',
  textModel: 'text-model',
  imageMode: 'url',
}

function analysisJson(overrides = {}) {
  return JSON.stringify({
    isFood: true,
    foods: [{ name: '米饭', portion: '一碗', kcal: 230 }],
    totalKcal: 230,
    protein: 5,
    carbs: 50,
    fat: 1,
    rating: 'green',
    comment: '不错',
    suggestion: '晚上加点青菜',
    ...overrides,
  })
}

module.exports = { createFakeRepo, createFakeChat, PROFILE, NOW, TODAY, CONFIG, analysisJson }
