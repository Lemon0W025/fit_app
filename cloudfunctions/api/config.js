// AI 模型配置。改完重新「上传并部署」api 云函数即可生效，小程序前端不用改。
// 可用的分组和模型以云开发控制台 → AI → 大模型 页面为准，详见 README。

module.exports = {
  // createModel 的分组名（不是模型名）：
  //   'hunyuan-exp'：报名「小程序成长计划」后可用，有赠送额度
  //   'cloudbase'  ：购买 Token 资源包后可用，模型需要先在控制台开启
  provider: 'hunyuan-exp',

  // 看图识菜的视觉模型，必须是上面分组里已开启的模型。
  // 填 '' 表示不看图，只根据打卡时写的文字描述估算。
  visionModel: 'hunyuan-vision',

  // 文字估算和每日总结用的模型
  textModel: 'hunyuan-2.0-instruct-20251111',

  // 图片怎么交给模型：
  //   'url'   ：云存储临时链接（默认）
  //   'base64'：把图片内容直接塞进请求（模型拿不到链接时改用这个）
  imageMode: 'url',
}
