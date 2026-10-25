const { AppError, CODES } = require('../lib/errors')
const { validateProfile } = require('../lib/profile')
const { calcDailyKcal } = require('../lib/shared/nutrition')
const { dateKey } = require('../lib/shared/date')
const { mealTimesOf } = require('../lib/shared/timing')

function createProfileService({ repo, now }) {
  return {
    async get(openid) {
      return repo.getProfile(openid)
    },

    async save(openid, input) {
      const { value, errors } = validateProfile(input)
      if (errors.length) throw new AppError(CODES.BAD_REQUEST, errors.join('；'))

      const existing = await repo.getProfile(openid)
      const at = now()
      const profile = {
        ...value,
        mealTimes: value.mealTimes || mealTimesOf(existing),
        dailyKcal: calcDailyKcal(value),
        createdAt: existing ? existing.createdAt : at.getTime(),
        updatedAt: at.getTime(),
      }
      await repo.saveProfile(openid, profile)
      // 建档时的体重作为体重曲线的起点
      if (!existing) await repo.saveWeight(openid, dateKey(at), value.weightKg)
      return profile
    },
  }
}

module.exports = { createProfileService }
