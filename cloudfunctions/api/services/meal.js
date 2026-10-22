const { AppError, CODES } = require('../lib/errors')
const { parseMealAnalysis } = require('../lib/parse')
const { buildMealMessages } = require('../lib/prompts')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey } = require('../lib/shared/date')
const { isMealType } = require('../lib/shared/meal-types')

const NOTE_MAX = 200

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function createMealService({ repo, chat, config, getImageUrl, deleteFile, now, log = () => {} }) {
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
  async function runAnalysis({ profile, mealType, note, fileID, consumed }) {
    const base = { profile, mealType, note, consumedKcal: consumed }

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
      const meals = await repo.listMeals(openid, date)
      const result = await runAnalysis({ profile, mealType: src.mealType, note, fileID, consumed: consumedKcal(meals) })

      const meal = {
        _openid: openid,
        date,
        mealType: src.mealType,
        fileID,
        note,
        ...result,
        createdAt: at.getTime(),
        updatedAt: at.getTime(),
      }
      const id = await repo.addMeal(meal)
      return { _id: id, ...meal }
    },

    async reanalyze(openid, input) {
      const src = input || {}
      const meal = await requireMeal(openid, src.mealId)
      const profile = await requireProfile(openid)
      const note = src.note === undefined ? meal.note || '' : text(src.note, NOTE_MAX)
      if (!meal.fileID && !note) throw new AppError(CODES.BAD_REQUEST, '写几句描述再分析吧')

      const meals = await repo.listMeals(openid, meal.date)
      const result = await runAnalysis({
        profile,
        mealType: meal.mealType,
        note,
        fileID: meal.fileID,
        consumed: consumedKcal(meals, meal._id),
      })
      // 已经有结果的打卡，重试失败时不要把好结果覆盖掉
      if (result.status === 'failed' && meal.status === 'done') {
        throw new AppError(CODES.AI_FAILED, result.error)
      }

      const patch = { note, ...result, updatedAt: now().getTime() }
      await repo.updateMeal(meal._id, patch)
      return { ...meal, ...patch }
    },

    async get(openid, input) {
      return requireMeal(openid, (input || {}).mealId)
    },

    async remove(openid, input) {
      const meal = await requireMeal(openid, (input || {}).mealId)
      await repo.deleteMeal(meal._id)
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
