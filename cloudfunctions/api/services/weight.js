const { AppError, CODES } = require('../lib/errors')
const { calcDailyKcal, round1 } = require('../lib/shared/nutrition')
const { dateKey, isDateKey } = require('../lib/shared/date')

const WEIGHT_MIN = 30
const WEIGHT_MAX = 250
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 90

function createWeightService({ repo, now }) {
  return {
    async save(openid, input) {
      const src = input || {}
      const n = Number(src.weightKg)
      if (src.weightKg === '' || src.weightKg == null || !isFinite(n) || n < WEIGHT_MIN || n > WEIGHT_MAX) {
        throw new AppError(CODES.BAD_REQUEST, `体重需要在 ${WEIGHT_MIN}-${WEIGHT_MAX} kg 之间`)
      }
      const today = dateKey(now())
      const date = src.date == null || src.date === '' ? today : src.date
      if (!isDateKey(date) || date > today) throw new AppError(CODES.BAD_REQUEST, '日期不对')

      const weightKg = round1(n)
      await repo.saveWeight(openid, date, weightKg)

      // 体重变了，每日热量预算也跟着调整
      let dailyKcal = null
      if (date === today) {
        const profile = await repo.getProfile(openid)
        if (profile) {
          dailyKcal = calcDailyKcal({ ...profile, weightKg })
          await repo.saveProfile(openid, { ...profile, weightKg, dailyKcal, updatedAt: now().getTime() })
        }
      }
      return { date, weightKg, dailyKcal }
    },

    async list(openid, input) {
      let limit = Number((input || {}).limit)
      if (!isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
      limit = Math.min(Math.round(limit), MAX_LIMIT)
      const [items, profile] = await Promise.all([repo.listWeights(openid, limit), repo.getProfile(openid)])
      return { items, targetWeightKg: profile ? profile.targetWeightKg : null }
    },
  }
}

module.exports = { createWeightService }
