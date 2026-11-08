// AI 模型配置。改完重新部署 api 云函数即可生效，小程序前端不用改。
// 模型在「云开发控制台 → AI → 生文模型」里查看，用到的模型要把「套餐抵扣」开关打开。

module.exports = {
  // createModel 的分组名（不是模型名）。新版控制台的模型一般在 'cloudbase' 分组；
  // 调不通时会自动试 fallbackProviders 里的分组，并记住调通的那个（见 ai.js）
  provider: 'cloudbase',
  fallbackProviders: ['hunyuan-exp'],

  // 看图识菜：混元图生文模型。填 '' 表示不看图，只根据打卡时写的文字描述估算
  visionModel: 'hy-vision-2.0-instruct',

  // 文字估算和每日总结：hy3（控制台标注「小程序成长计划」）
  textModel: 'hy3',

  // 图片怎么交给模型：
  //   'url'   ：云存储临时链接（默认）
  //   'base64'：把图片内容直接塞进请求（模型拿不到链接时改用这个）
  imageMode: 'url',

  // 饭点提醒的微信服务通知（一次性订阅消息）。一般不用填：小程序「我的 → 饭点提醒」点「开通微信提醒」，云函数自己找 / 加模板，
  // 存进集合 settings（lib/remind-template.js）。想自己指定模板时在这里填，填了以它为准。
  // 自己指定的话：小程序后台「功能 → 订阅消息」选一个「用餐提醒 / 打卡提醒」类公共模板后填：
  //   id：模板 ID；state：'trial'（体验版，给妈妈用的就是体验版）/ 'developer' / 'formal'；
  //   fields：我们的几样说法填到模板的哪个字段（模板详情里的 thing1、time2……）：
  //     meal「到饭点啦，拍午饭吧」、mealTime「2026-10-29 12:00」（time / date 类字段用这个）、tip「13:00 前拍还算准时」、name「小暖自律打卡」
  //   例：{ id: 'xxxx', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }
  // 填好后 npm run wx:function。null 时用一键开通存下的模板；都没有时提醒页只有「开通微信提醒」按钮和手机日历闹钟。
  // 定时触发器（每 10 分钟看一次）用 npm run wx:trigger 建一次就行
  remindTemplate: null,

  // ---- 下面几样都是测试期间用的（福利怎么做的在 lib/test-perks.js，从头再来在 services/account.js）。
  // ---- 上传体验版给家人之前全改成 null，再 npm run wx:function ----

  // 测试福利：until 这天（含）之前打开营地的账号，各送一次 beans 暖豆（id 换了可以再送一次）
  testGrant: null,

  // 测试：until 这天（含）之前打开营地的账号，还没来的宠物一次全放出来（1 级），不用扭蛋喂食等它们搬来。
  // 10/31 用户要从零开始体验，关了（例：{ id: 'all-pets-1', until: '2026-11-30' }）
  testPets: null,

  // 测试「客人」那一步：remove 里的几只先搬走、送 foods 里能引它们来的食物，今天锅里煮的退回背包。每个账号一次。
  // 10/31 关了（例：{ id: 'visitors-1', until: '2026-11-30', remove: ['nuonuo'], foods: { huluobo: 1 } }）
  testVisitors: null,

  // 测试期间无限资源：until 这天（含）之前，每次读营地、每次存之前，暖豆不到 beans 就补到 beans，
  // 每样食物不到 foods 份就补到 foods 份。10/31 用户要从零开始：只留暖豆无限，食物要自己扭蛋抽（foods: 0）
  testUnlimited: { until: '2026-11-30', beans: 99999, foods: 0 },

  // 测试：「我的」页最下面多一个「从头再来」，清空自己这个账号的全部数据（档案、打卡和照片、体重、营地、提醒），
  // 回到第一次打开的样子，好从新手指引走一遍。只清点按钮的那个人自己的
  testReset: { until: '2026-11-30' },
}
