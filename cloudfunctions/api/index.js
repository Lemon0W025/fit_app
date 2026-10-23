// 云函数入口：所有请求形如 { action: 'meal.analyze', data: {...} }，返回 { ok, data } 或 { ok: false, code, message }

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const config = require('./config')
const { createRepo } = require('./repo')
const { createChat } = require('./ai')
const { createStorage } = require('./storage')
const { createRouter } = require('./router')
const { createProfileService } = require('./services/profile')
const { createMealService } = require('./services/meal')
const { createDayService } = require('./services/day')
const { createWeightService } = require('./services/weight')
const { createForestService } = require('./services/forest')
const { createGardenService } = require('./services/garden')

const log = (...args) => console.error(...args)
const now = () => new Date()

const repo = createRepo(cloud.database())
const chat = createChat(cloud, { fallbackProviders: config.fallbackProviders, log })
const { getImageUrl, deleteFile } = createStorage(cloud, config)
const forest = createForestService({ repo, now })
const garden = createGardenService({ repo, now, getGrant: () => config.testGrant })

const route = createRouter(
  {
    profile: createProfileService({ repo, now }),
    meal: createMealService({ repo, chat, config, getImageUrl, deleteFile, now, forest, garden, log }),
    day: createDayService({ repo, chat, config, now, forest, log }),
    weight: createWeightService({ repo, now }),
    forest,
    garden,
  },
  { log },
)

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  return route(event, OPENID)
}
