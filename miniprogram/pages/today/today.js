const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')

Page({
  data: {
    loading: true,
    view: null,
    daily: null,
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
          daily: beansCard(day.daily),
          greeting: greetingText(localHour(), day.profile.nickname),
        })
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  goGarden() {
    wx.switchTab({ url: '/pages/garden/garden' })
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
