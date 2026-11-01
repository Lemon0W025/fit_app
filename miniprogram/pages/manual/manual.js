// 使用说明：怎么用、能得到什么（内容在 utils/manual.js）。「我的」→「使用说明」进来；底下能再看一遍新手导览
const { manualSections } = require('../../utils/manual')
const { resetTours } = require('../../utils/tours')

Page({
  data: {
    sections: [],
  },

  onLoad() {
    this.setData({ sections: manualSections(getApp().globalData.mealTimes || null) })
  },

  // 清掉「看过了」，回首页重新走一遍（进营地时营地那段也会再来）
  replayTour() {
    resetTours()
    wx.switchTab({ url: '/pages/today/today' })
  },
})
