const config = require('./config')

App({
  globalData: {
    // 打卡页把"这次打卡让今天的树怎么变了"交给结果页展示
    lastGain: null,
    // 正餐打卡成功后回到营地，全员庆祝一次
    celebrate: false,
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '微信版本太低，请升级微信后再使用', showCancel: false })
      return
    }
    const options = { traceUser: true }
    if (config.envId) options.env = config.envId
    wx.cloud.init(options)
  },
})
