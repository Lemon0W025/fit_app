const { AppError, CODES } = require('../lib/errors')
const { cleanSummaryText } = require('../lib/parse')
const { buildSummaryMessages } = require('../lib/prompts')
const { sumMeals } = require('../lib/shared/nutrition')
const { dateKey, isDateKey } = require('../lib/shared/date')

function createDayService({ repo, chat, config, now, log = () => {} }) {
  function resolveDate(input) {
    const date = (input || {}).date
    if (date === undefined || date === null || date === '') return dateKey(now())
    if (!isDateKey(date)) throw new AppError(CODES.BAD_REQUEST, '日期格式不对')
    return date
  }

  return {
    async get(openid, input) {
      const date = resolveDate(input)
      const [profile, meals, summary] = await Promise.all([
        repo.getProfile(openid),
        repo.listMeals(openid, date),
        repo.getSummary(openid, date),
      ])
      const totals = sumMeals(meals)
      const dailyKcal = profile ? profile.dailyKcal : null
      return {
        date,
        profile,
        dailyKcal,
        meals,
        totals,
        remainingKcal: dailyKcal == null ? null : dailyKcal - totals.kcal,
        summary,
      }
    },

    async summarize(openid, input) {
      const date = resolveDate(input)
      const profile = await repo.getProfile(openid)
      if (!profile) throw new AppError(CODES.NO_PROFILE, '先完善一下个人档案吧')

      const meals = (await repo.listMeals(openid, date)).filter((m) => m.status === 'done')
      if (!meals.length) throw new AppError(CODES.NO_MEALS, '今天还没有打卡，先拍一餐吧')

      const totals = sumMeals(meals)
      const weights = await repo.listWeights(openid, 2)
      const latestWeight = weights.length ? weights[weights.length - 1] : null
      const previousWeight = weights.length > 1 ? weights[weights.length - 2] : null

      let text = ''
      try {
        const reply = await chat({
          provider: config.provider,
          model: config.textModel,
          messages: buildSummaryMessages({ profile, date, meals, totals, latestWeight, previousWeight }),
        })
        text = cleanSummaryText(reply)
      } catch (e) {
        log('summary failed', e)
      }
      if (!text) throw new AppError(CODES.AI_FAILED, '总结没生成出来，稍后再试')

      const summary = { text, totalKcal: totals.kcal, createdAt: now().getTime() }
      await repo.saveSummary(openid, date, summary)
      return { ...summary, date }
    },
  }
}

module.exports = { createDayService }
