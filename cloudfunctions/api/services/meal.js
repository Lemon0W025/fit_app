const { AppError, CODES } = require('../lib/errors')
const { parseMealAnalysis } = require('../lib/parse')
const { buildMealMessages } = require('../lib/prompts')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey } = require('../lib/shared/date')
const { isMealType } = require('../lib/shared/meal-types')
const { MAIN_MEALS, dayBeans, mealStamps, beansHint } = require('../lib/shared/forest')
const { mealTimesOf, timingFor } = require('../lib/shared/timing')

const NOTE_MAX = 200

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function isMainMeal(mealType) {
  return MAIN_MEALS.indexOf(mealType) !== -1
}

// 这次打卡前后今天的暖豆变了多少，给打卡结果页做即时反馈
function beansChange(beforeMeals, afterMeals, meal, times, at) {
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
  }
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

  async function ask(model, messages) {
    const reply = await chat({ provider: config.provider, model, messages })
    return parseMealAnalysis(reply)
  }

  // 先看图；看图不可用或失败时，有文字描述就按描述估算；都不行就记为失败，留给用户补描述后重试
  async function runAnalysis({ profile, mealType, note, fileID, consumed, timing, at, times }) {
    const base = { profile, mealType, note, consumedKcal: consumed, timing, at, times }

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
      const result = await runAnalysis({ profile, mealType: src.mealType, note, fileID, consumed: consumedKcal(meals), timing, at, times })

      const meal = {
        _openid: openid,
        date,
        mealType: src.mealType,
        timing,
        fileID,
        note,
        ...result,
        createdAt: at.getTime(),
        updatedAt: at.getTime(),
      }
      const saved = { _id: await repo.addMeal(meal), ...meal }

      // 只有正餐算暖豆、喂宠物、引来新住户，加餐不算
      let gain = null
      let arrival = null
      if (isMainMeal(src.mealType)) {
        await forest.syncDay(openid, date)
        gain = beansChange(meals, meals.concat(saved), saved, times, at)
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
