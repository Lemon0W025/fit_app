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

  // 测试福利：until 这天（含）之前打开庭院的账号，各送一次 beans 暖豆（id 换了可以再送一次）。
  // 只给开发测试用，上传体验版给家人之前改成 null
  testGrant: { id: 'preview-1', beans: 5000, until: '2026-10-26' },

  // 测试：until 这天（含）之前打开营地的账号，还没来的宠物一次全放出来（1 级），不用扭蛋喂食等它们搬来。
  // 只给开发测试用，上传体验版给家人之前改成 null
  testPets: { id: 'all-pets-1', until: '2026-11-30' },

  // 测试「客人」那一步：until 这天（含）之前打开营地的账号，remove 里的几只先搬走、送 foods 里能引它们来的食物
  // （胡萝卜→糯糯、莲子→莲莲、柿子→柿柿、烤红薯→杞杞、核桃→薯薯、小鱼干→花花、竹笋→笋宝），今天锅里煮的退回背包。每个账号一次（id 换了再来一次）。
  // 只给开发测试用，上传体验版给家人之前改成 null
  testVisitors: {
    id: 'visitors-1',
    until: '2026-11-30',
    remove: ['nuonuo', 'lianlian', 'shishi', 'qiqi', 'shushu', 'huahua', 'sunbao'],
    foods: { huluobo: 1, lianzi: 1, shizi: 1, kaohongshu: 1, hetao: 1, xiaoyugan: 1, zhusun: 1 },
  },

  // 测试期间无限资源：until 这天（含）之前，每次读营地、每次存之前，暖豆不到 beans 就补到 beans，
  // 每样食物（23 样 + 10 样节气点心）不到 foods 份就补到 foods 份。只给开发测试用，上传体验版给家人之前改成 null
  testUnlimited: { until: '2026-11-30', beans: 99999, foods: 9 },
}
