const api = require('../../utils/api')
const { buildDayView, greetingText, treeCard } = require('../../utils/view')
const { celebrateUnlocks } = require('../../utils/celebrate')
const { localHour } = require('../../utils/shared/date')

Page({
  data: {
    loading: true,
    view: null,
    tree: null,
    greeting: '',
    summarizing: false,
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('day.get')
      .then((day) => {
        // 第一次使用先去建档
        if (!day.profile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.setData({
          loading: false,
          view: buildDayView(day),
          tree: treeCard(day.tree),
          greeting: greetingText(localHour(), day.profile.nickname),
        })
        if (day.tree) celebrateUnlocks(day.tree.newlyUnlocked, () => this.goForest())
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  goForest() {
    wx.switchTab({ url: '/pages/forest/forest' })
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },

  openMeal(e) {
    wx.navigateTo({ url: `/pages/meal/meal?id=${e.currentTarget.dataset.id}` })
  },

  generateSummary() {
    if (this.data.summarizing) return
    this.setData({ summarizing: true })
    api.call('summary.generate')
      .then((summary) => this.setData({ summarizing: false, 'view.summary': summary }))
      .catch((err) => {
        this.setData({ summarizing: false })
        api.showError(err)
      })
  },
})
