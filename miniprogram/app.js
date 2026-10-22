const config = require('./config')

App({
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
