const { AppError, CODES } = require('../lib/errors')
const { parseMealAnalysis } = require('../lib/parse')
const { buildMealMessages } = require('../lib/prompts')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey } = require('../lib/shared/date')
const { isMealType } = require('../lib/shared/meal-types')
const { MAIN_MEALS, dayBeans, mealStamps, beansHint } = require('../lib/shared/forest')
const { mealTimesOf, timingFor } = require('../lib/shared/timing')
const { LIMITS, isShared, peopleOf, resize, share, totalsAfter } = require('../lib/shared/dish')

const NOTE_MAX = 200
const PORTIONS_KEEP = 12 // 她家常用份量留最近几样

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function isMainMeal(mealType) {
  return MAIN_MEALS.indexOf(mealType) !== -1
}

// 这次打卡前后今天的暖豆变了多少，给打卡结果页做即时反馈
function beansChange(beforeMeals, afterMeals, meal, times, at, milestone = null) {
  const before = dayBeans(beforeMeals)
  const after = dayBeans(afterMeals)
  return {
    beans: after.beans - before.beans,
    beansToday: after.beans,
    hint: beansHint(afterMeals, times, at),
    stamps: mealStamps(afterMeals),
    mealType: meal.mealType,
    timing: meal.timing || null,
    // 这一次让三顿都准时了（结果页额外庆祝一下）
    allOnTime: after.allOnTime && !before.allOnTime,
    // 这一次让连续打卡到了里程碑（结果页弹庆祝、发纪念章）
    milestone,
  }
}

// 第一次改份量 / 人数：把 AI 原来的菜单和总热量存下（结果页「小暖原来估 N 千卡」）
function withAiOriginal(a) {
  return {
    adjusted: true,
    aiFoods: a.aiFoods || a.foods || [],
    aiTotalKcal: typeof a.aiTotalKcal === 'number' ? a.aiTotalKcal : a.totalKcal,
  }
}

// 菜名当字段名存：去掉数据库字段路径里有特殊含义的 . 和 $
function portionKey(name) {
  return String(name || '').replace(/[.$]/g, '').trim()
}

function createMealService({ repo, chat, config, getImageUrl, deleteFile, now, forest, camp, log = () => {} }) {
  async function requireProfile(openid) {
    const profile = await repo.getProfile(openid)
    if (!profile) throw new AppError(CODES.NO_PROFILE, '先完善一下个人档案吧')
    return profile
  }

  async function requireMeal(openid, mealId) {
    if (typeof mealId !== 'string' || !mealId) throw new AppError(CODES.BAD_REQUEST, '缺少打卡编号')
    const meal = await repo.getMeal(openid, mealId)
    if (!meal) throw new AppError(CODES.NOT_FOUND, '这条打卡找不到了')
    return meal
  }

  function consumedKcal(meals, excludeId) {
    return sumMeals(meals.filter((m) => m._id !== excludeId)).kcal
  }

  // 她家常用份量：读不到不影响打卡
  async function portionsOf(openid) {
    try {
      return await repo.getPortions(openid)
    } catch (e) {
      log('read portions failed', e)
      return {}
    }
  }

  async function rememberPortion(openid, dish) {
    const key = portionKey(dish.name)
    if (!key || !(dish.grams > 0)) return
    try {
      const items = { ...(await repo.getPortions(openid)), [key]: { grams: dish.grams, at: now().getTime() } }
      const kept = Object.entries(items)
        .sort((x, y) => (y[1].at || 0) - (x[1].at || 0))
        .slice(0, PORTIONS_KEEP)
      await repo.savePortions(openid, Object.fromEntries(kept))
    } catch (e) {
      log('save portions failed', e)
    }
  }

  async function ask(model, messages) {
    const reply = await chat({ provider: config.provider, model, messages })
    return parseMealAnalysis(reply)
  }

  // 先看图；看图不可用或失败时，有文字描述就按描述估算；都不行就记为失败，留给用户补描述后重试
  async function runAnalysis({ profile, mealType, note, fileID, consumed, timing, at, times, portions, people }) {
    const base = { profile, mealType, note, consumedKcal: consumed, timing, at, times, portions, people }

    if (fileID && config.visionModel) {
      try {
        const imageUrl = await getImageUrl(fileID)
        const analysis = await ask(config.visionModel, buildMealMessages({ ...base, imageUrl }))
        return { status: 'done', mode: 'vision', analysis, error: '' }
      } catch (e) {
        log('vision analysis failed', e)
      }
    }

    if (note) {
      try {
        const analysis = await ask(config.textModel, buildMealMessages({ ...base, imageUrl: null }))
        return { status: 'done', mode: 'text', analysis, error: '' }
      } catch (e) {
        log('text analysis failed', e)
      }
    }

    return {
      status: 'failed',
      mode: '',
      analysis: null,
      error: note
        ? '小暖暂时没回上话，稍后点「重新分析」试试'
        : '照片暂时没认出来，补一句文字描述（比如"一碗米饭、半盘青菜"）再重新分析',
    }
  }

  return {
    async analyze(openid, input) {
      const src = input || {}
      if (!isMealType(src.mealType)) throw new AppError(CODES.BAD_REQUEST, '请选择餐次')
      const note = text(src.note, NOTE_MAX)
      const fileID = text(src.fileID, 512)
      if (!fileID && !note) throw new AppError(CODES.BAD_REQUEST, '拍张照片或写几句描述吧')

      const profile = await requireProfile(openid)
      const at = now()
      const date = dateKey(at)
      const times = mealTimesOf(profile)
      const timing = timingFor(src.mealType, at, times)
      const meals = await repo.listMeals(openid, date)
      const portions = await portionsOf(openid)
      const people = peopleOf(src.people)
      const result = await runAnalysis({ profile, mealType: src.mealType, note, fileID, consumed: consumedKcal(meals), timing, at, times, portions, people })

      const meal = {
        _openid: openid,
        date,
        mealType: src.mealType,
        timing,
        fileID,
        note,
        people,
        ...result,
        createdAt: at.getTime(),
        updatedAt: at.getTime(),
      }
      const saved = { _id: await repo.addMeal(meal), ...meal }

      // 只有正餐算暖豆、喂宠物、引来新住户，加餐不算
      let gain = null
      let arrival = null
      if (isMainMeal(src.mealType)) {
        const synced = await forest.syncDay(openid, date)
        gain = beansChange(meals, meals.concat(saved), saved, times, at, synced.milestone)
        arrival = await camp.arrive(openid)
      }
      return { ...saved, gain, arrival }
    },

    async reanalyze(openid, input) {
      const src = input || {}
      const meal = await requireMeal(openid, src.mealId)
      const profile = await requireProfile(openid)
      const note = src.note === undefined ? meal.note || '' : text(src.note, NOTE_MAX)
      if (!meal.fileID && !note) throw new AppError(CODES.BAD_REQUEST, '写几句描述再分析吧')

      const times = mealTimesOf(profile)
      const meals = await repo.listMeals(openid, meal.date)
      const result = await runAnalysis({
        profile,
        mealType: meal.mealType,
        note,
        fileID: meal.fileID,
        consumed: consumedKcal(meals, meal._id),
        timing: meal.timing || null,
        at: new Date(meal.createdAt),
        times,
        portions: await portionsOf(openid),
        people: peopleOf(meal.people),
      })
      // 已经有结果的打卡，重试失败时不要把好结果覆盖掉
      if (result.status === 'failed' && meal.status === 'done') {
        throw new AppError(CODES.AI_FAILED, result.error)
      }

      const patch = { note, ...result, updatedAt: now().getTime() }
      await repo.updateMeal(meal._id, patch)
      const updated = { ...meal, ...patch }

      let gain = null
      if (isMainMeal(meal.mealType)) {
        await forest.syncDay(openid, meal.date)
        gain = beansChange(meals, meals.map((m) => (m._id === meal._id ? updated : m)), updated, times, now())
      }
      return { ...updated, gain }
    },

    // 结果页点一道菜改份量：{ mealId, index, grams | factor | remove }。只动这道菜和总数，评级、点评、暖豆不变；
    // 第一次改把 AI 原来的菜单和总热量存下（结果页「小暖原来估 N 千卡」）；改了克数的记进她家常用份量
    async adjust(openid, input) {
      const src = input || {}
      const meal = await requireMeal(openid, src.mealId)
      const a = meal.analysis
      if (meal.status !== 'done' || !a || a.isFood === false) throw new AppError(CODES.BAD_REQUEST, '这顿还没算好，先不能改份量')
      const foods = a.foods || []
      const index = src.index
      if (!Number.isInteger(index) || index < 0 || index >= foods.length) throw new AppError(CODES.BAD_REQUEST, '找不到这道菜了，回去刷新一下')
      const dish = foods[index]

      let next = null
      if (src.remove === true) {
        if (foods.length <= 1) throw new AppError(CODES.BAD_REQUEST, '这顿就剩这一道了，没吃的话删掉整条打卡吧')
      } else {
        const r = resize(dish, src)
        if (r.error) throw new AppError(CODES.BAD_REQUEST, r.error)
        next = r.dish
      }
      const nextFoods = foods.slice()
      if (next) nextFoods[index] = next
      else nextFoods.splice(index, 1)

      const analysis = {
        ...a,
        foods: nextFoods,
        ...totalsAfter(a, dish, next),
        ...withAiOriginal(a),
      }
      const patch = { analysis, updatedAt: now().getTime() }
      await repo.updateMeal(meal._id, patch)
      if (next) await rememberPortion(openid, next)
      return { ...meal, ...patch }
    },

    // 几个人一起吃（结果页改人数）：{ mealId, people }。大家夹的菜（shared 不是 false）按 原来人数 / 新人数 缩放
    // （她单独改过的份量也按比例留着），单独盛给她的不动；总数按每道菜的变化量加减。评级、点评、暖豆不变
    async share(openid, input) {
      const src = input || {}
      const meal = await requireMeal(openid, src.mealId)
      const a = meal.analysis
      if (meal.status !== 'done' || !a || a.isFood === false) throw new AppError(CODES.BAD_REQUEST, '这顿还没算好，先不能改人数')
      const people = src.people
      if (typeof people !== 'number' || !Number.isInteger(people) || people < 1 || people > LIMITS.peopleMax) {
        throw new AppError(CODES.BAD_REQUEST, `人数要在 1～${LIMITS.peopleMax} 之间`)
      }
      const before = peopleOf(meal.people)
      if (people === before) return meal
      let totals = { totalKcal: a.totalKcal, protein: a.protein, carbs: a.carbs, fat: a.fat }
      const foods = (a.foods || []).map((dish) => {
        if (!isShared(dish)) return dish
        const next = share(dish, before, people)
        totals = totalsAfter({ ...a, ...totals }, dish, next)
        return next
      })
      const analysis = { ...a, foods, ...totals, ...withAiOriginal(a) }
      const patch = { people, analysis, updatedAt: now().getTime() }
      await repo.updateMeal(meal._id, patch)
      return { ...meal, ...patch }
    },

    async get(openid, input) {
      return requireMeal(openid, (input || {}).mealId)
    },

    async remove(openid, input) {
      const meal = await requireMeal(openid, (input || {}).mealId)
      await repo.deleteMeal(meal._id)
      if (isMainMeal(meal.mealType)) await forest.syncDay(openid, meal.date)
      if (meal.fileID) {
        try {
          await deleteFile(meal.fileID)
        } catch (e) {
          log('delete meal photo failed', e)
        }
      }
      return { removed: true }
    },
  }
}

module.exports = { createMealService }
