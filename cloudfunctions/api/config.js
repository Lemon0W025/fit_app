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
}
