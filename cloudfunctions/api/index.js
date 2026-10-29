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
const { createCampService } = require('./services/camp')
const { createRemindService } = require('./services/remind')

const log = (...args) => console.error(...args)
const now = () => new Date()

const repo = createRepo(cloud.database())
const chat = createChat(cloud, { fallbackProviders: config.fallbackProviders, log })
const { getImageUrl, deleteFile } = createStorage(cloud, config)
const forest = createForestService({ repo, now })
const camp = createCampService({ repo, now, forest, getGrant: () => config.testGrant, getTestPets: () => config.testPets, getTestVisitors: () => config.testVisitors, getTestUnlimited: () => config.testUnlimited })
// 微信服务通知（一次性订阅消息）：config.remindTemplate 填了模板 ID 才会发
const remind = createRemindService({ repo, now, config, send: (msg) => cloud.openapi.subscribeMessage.send(msg), log })

const route = createRouter(
  {
    profile: createProfileService({ repo, now }),
    meal: createMealService({ repo, chat, config, getImageUrl, deleteFile, now, forest, camp, log }),
    day: createDayService({ repo, chat, config, now, forest, remind, log }),
    weight: createWeightService({ repo, now }),
    forest,
    camp,
    remind,
  },
  { log },
)

exports.main = async (event) => {
  // 定时触发器（config.json 的 remind，每 10 分钟）：没有 OPENID，不走路由
  if (event && event.Type === 'Timer') return remind.tick()
  const { OPENID } = cloud.getWXContext()
  return route(event, OPENID)
}
