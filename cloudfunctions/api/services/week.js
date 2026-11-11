// 每周小结：week.get { offset }，0 = 这一周（到今天）、1 = 上一周……最多往前看 MAX_OFFSET 周。怎么算在 lib/week.js
const { AppError, CODES } = require('../lib/errors')
const { normalizeCamp } = require('../lib/camp-state')
const { dateKey } = require('../lib/shared/date')
const { MIN_KCAL } = require('../lib/shared/nutrition')
const { weekRange, buildWeek } = require('../lib/week')

const MAX_OFFSET = 26
const WEIGHTS_BACK = 120 // 往回读多少条体重（一周前后的够用）

function createWeekService({ repo, now }) {
  return {
    async get(openid, input) {
      const offset = (input || {}).offset === undefined ? 1 : (input || {}).offset
      if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new AppError(CODES.BAD_REQUEST, '只能看最近半年的')
      const profile = await repo.getProfile(openid)
      if (!profile) throw new AppError(CODES.NO_PROFILE, '先完善一下个人档案吧')
      const today = dateKey(now())
      const { start, end } = weekRange(today, offset)
      const [meals, garden, weights] = await Promise.all([
        repo.listMealsBetween(openid, start, end),
        repo.getGarden(openid),
        repo.listWeights(openid, WEIGHTS_BACK),
      ])
      const camp = normalizeCamp(garden)
      return {
        offset,
        // 再往前一周有没有（看得到的最早一周）、往后一周有没有（这一周之后没有）
        older: offset < MAX_OFFSET ? offset + 1 : null,
        newer: offset > 0 ? offset - 1 : null,
        ...buildWeek({
          start,
          today,
          meals,
          dailyKcal: profile.dailyKcal,
          minKcal: MIN_KCAL[profile.sex] || MIN_KCAL.female,
          earned: camp.beans.earned,
          days: camp.days,
          weights,
        }),
      }
    },
  }
}

module.exports = { createWeekService }
