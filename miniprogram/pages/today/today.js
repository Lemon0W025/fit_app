const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard, nextMealCard } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')
const { mealTimesOf, mealStatus } = require('../../utils/shared/timing')
const { beansHint } = require('../../utils/shared/forest')
const { clockOf } = require('../../utils/fx')

// 下一顿大卡和提示跟着时间走（倒计时、过点），每分钟按现在的时间重算一次
const REFRESH_MS = 60000

Page({
  data: {
    loading: true,
    view: null,
    daily: null,
    card: null,
    greeting: '',
    summarizing: false,
  },

  onShow() {
    this.load()
  },

  onHide() {
    this.stopRefresh()
  },

  onUnload() {
    this.stopRefresh()
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
        this.day = day
        this.times = mealTimesOf(day.profile)
        getApp().globalData.mealTimes = this.times
        // 直接给最后的数：热量卡的圆环（components/ring）自己把数字和圆环从上次显示的数一起滚过去（第一次从 0），
        // 页面藏起来时它跳到最后的数
        this.setData({
          loading: false,
          view: buildDayView(day),
          greeting: greetingText(localHour(), day.profile.nickname),
        })
        this.refresh()
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  refresh() {
    const now = new Date()
    const meals = this.day.meals || []
    this.setData({
      card: nextMealCard(mealStatus(meals, this.times, now)),
      daily: beansCard({ ...this.day.daily, hint: beansHint(meals, this.times, now) }),
    })
    this.stopRefresh()
    this.refreshTimer = clockOf(this).set(() => this.refresh(), REFRESH_MS)
  },

  stopRefresh() {
    if (!this.refreshTimer) return
    clockOf(this).clear(this.refreshTimer)
    this.refreshTimer = null
  },

  goGarden() {
    wx.switchTab({ url: '/pages/camp/camp' })
  },

  goCheckin(e) {
    const mealType = e && e.currentTarget.dataset.mealType
    wx.navigateTo({ url: mealType ? `/pages/checkin/checkin?mealType=${mealType}` : '/pages/checkin/checkin' })
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
