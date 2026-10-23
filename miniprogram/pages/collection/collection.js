const api = require('../../utils/api')
const { collectionGroups } = require('../../utils/garden-view')

Page({
  data: {
    loaded: false,
    collectedCount: 0,
    totalCount: 0,
    percent: 0,
    groups: [],
  },

  onShow() {
    api.call('garden.get')
      .then((view) => {
        this.setData({
          loaded: true,
          collectedCount: view.collectedCount,
          totalCount: view.totalCount,
          percent: Math.round((view.collectedCount / view.totalCount) * 100),
          groups: collectionGroups(view.collected),
        })
      })
      .catch((err) => api.showError(err))
  },

  goGacha() {
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },
})
