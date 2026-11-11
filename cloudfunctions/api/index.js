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
const { createTestPerks } = require('./lib/test-perks')
const { createAccountService } = require('./services/account')
const { createWeekService } = require('./services/week')
const { createFamilyService } = require('./services/family')

const log = (...args) => console.error(...args)
const now = () => new Date()

const repo = createRepo(cloud.database())
const chat = createChat(cloud, { fallbackProviders: config.fallbackProviders, log })
const { getImageUrl, deleteFile, getPhotoUrls } = createStorage(cloud, config)
const forest = createForestService({ repo, now })
const camp = createCampService({ repo, now, forest, perks: createTestPerks({ config, now }) })
// 微信服务通知（一次性订阅消息）：config.remindTemplate 填了模板 ID 才会发
// 开通用的几个模板接口（addTemplate 等）参数名本来就是驼峰（kidList / sceneDesc），云调用默认会转成 kid_list，
// 微信就收不到关键词、报 200020，所以要 convertCase: false（微信官方示例也是这样）；它们返回的字段也本来就是驼峰。
// send 的参数是下划线的（template_id / miniprogram_state），照旧让 SDK 转
const remind = createRemindService({
  repo,
  now,
  config,
  send: (msg) => cloud.openapi.subscribeMessage.send(msg),
  wxapi: cloud.openapi({ convertCase: false }).subscribeMessage,
  log,
  // 定时检查时顺带：谁过了饭点没拍，告诉开了提醒的亲友（family 在下面才建，叫的时候已经有了）
  alsoTick: () => family.alertFollowers(),
})
// 亲友看板：邀请亲友看打卡、点赞、过了饭点没拍告诉亲友（用饭点提醒的同一个模板和「允许」次数）
const family = createFamilyService({
  repo,
  now,
  template: () => remind.template(),
  send: (msg) => cloud.openapi.subscribeMessage.send(msg),
  photoUrls: getPhotoUrls,
  log,
})

const route = createRouter(
  {
    profile: createProfileService({ repo, now }),
    meal: createMealService({ repo, chat, config, getImageUrl, deleteFile, now, forest, camp, log }),
    day: createDayService({ repo, chat, config, now, forest, remind, log }),
    weight: createWeightService({ repo, now }),
    forest,
    camp,
    remind,
    account: createAccountService({ repo, config, now, deleteFile, log }),
    week: createWeekService({ repo, now }),
    family,
  },
  { log },
)

// 定时触发器叫起来的：事件里有 Type: 'Timer'（大小写都认）或 TriggerName；小程序发来的请求一定带 action
function isTimer(event, openid) {
  if (!event) return !openid
  if (String(event.Type || '').toLowerCase() === 'timer' || event.TriggerName) return true
  return !event.action && !openid
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  // 定时触发器（config.json 的 remind，每 10 分钟）：没有 OPENID，不走路由
  if (isTimer(event, OPENID)) {
    console.log('remind timer', JSON.stringify(Object.keys(event || {})), event && event.TriggerName)
    return remind.tick({ trigger: (event && event.TriggerName) || '' })
  }
  return route(event, OPENID)
}
