const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard, nextMealCard } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')
const { mealTimesOf, mealStatus } = require('../../utils/shared/timing')
const { beansHint } = require('../../utils/shared/forest')
const { clockOf } = require('../../utils/fx')
const { guideCard } = require('../../utils/guide')

const GUIDE_HIDDEN_KEY = 'guideHidden' // 新手三步点过「不用了」

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
    guide: null,
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
        // 第一次使用：先看欢迎页（这次打开只看一次），再去建档
        if (!day.profile) {
          const app = getApp()
          if (!app.globalData.welcomed) wx.navigateTo({ url: '/pages/welcome/welcome' })
          else wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.day = day
        this.times = mealTimesOf(day.profile)
        getApp().globalData.mealTimes = this.times
        // 微信提醒开没开（打卡页提交时要不要顺手申请「允许」）
        getApp().globalData.remind = day.remind || null
        // 直接给最后的数：热量卡的圆环（components/ring）自己把数字和圆环从上次显示的数一起滚过去（第一次从 0），
        // 页面藏起来时它跳到最后的数
        this.setData({
          loading: false,
          view: buildDayView(day),
          greeting: greetingText(localHour(), day.profile.nickname),
          guide: guideCard(day.guide, this.guideHidden()),
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

  guideHidden() {
    try {
      return !!wx.getStorageSync(GUIDE_HIDDEN_KEY)
    } catch (e) {
      return false
    }
  },

  // 新手三步：点没做的那步就去做
  guideStep(e) {
    const action = e.currentTarget.dataset.action
    if (action === 'goRemind') wx.navigateTo({ url: '/pages/remind/remind' })
    else if (action === 'goCheckin') this.goCheckin()
  },

  hideGuide() {
    try {
      wx.setStorageSync(GUIDE_HIDDEN_KEY, true)
    } catch (e) {
      // 存不了：这次先藏起来
    }
    this.setData({ guide: null })
  },

  goCheckin(e) {
    const mealType = e && e.currentTarget && e.currentTarget.dataset.mealType
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
