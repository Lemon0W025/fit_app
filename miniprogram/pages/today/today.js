const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard, nextMealCard } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')
const { mealTimesOf, mealStatus } = require('../../utils/shared/timing')
const { clockOf } = require('../../utils/fx')
const { guideCard } = require('../../utils/guide')
const { TOURS, seen, markSeen } = require('../../utils/tours')
const { appVersion } = require('../../utils/remind')

const GUIDE_HIDDEN_KEY = 'guideHidden' // 新手三步点过「不用了」

// 下一顿大卡和提示跟着时间走（倒计时、过点），每分钟按现在的时间重算一次
const REFRESH_MS = 60000
const TOUR_AFTER_MS = 700 // 卡片浮上来之后再开始导览

Page({
  data: {
    loading: true,
    view: null,
    daily: null,
    card: null,
    greeting: '',
    summarizing: false,
    guide: null,
    tourSteps: TOURS.today,
    tourShow: false,
  },

  onShow() {
    this.load()
  },

  onHide() {
    this.stopRefresh()
    this.stopTour()
  },

  onUnload() {
    this.stopRefresh()
    this.stopTour()
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
        this.checkSilent(day.remind)
        // 直接给最后的数：热量卡的圆环（components/ring）自己把数字和圆环从上次显示的数一起滚过去（第一次从 0），
        // 页面藏起来时它跳到最后的数
        this.setData({
          loading: false,
          view: buildDayView(day),
          greeting: greetingText(localHour(), day.profile.nickname),
          guide: guideCard(day.guide, this.guideHidden()),
        })
        this.refresh()
        this.maybeTour()
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  refresh() {
    const meals = this.day.meals || []
    // 暖豆卡只说得了多少、印章、连续几天；该拍哪顿、能得多少在上面的大卡里说
    this.setData({
      card: nextMealCard(mealStatus(meals, this.times, new Date())),
      daily: beansCard(this.day.daily),
    })
    this.stopRefresh()
    this.refreshTimer = clockOf(this).set(() => this.refresh(), REFRESH_MS)
  },

  stopRefresh() {
    if (!this.refreshTimer) return
    clockOf(this).clear(this.refreshTimer)
    this.refreshTimer = null
  },

  // 第一次进首页（建好档以后）：新手导览，看过就不再自动出来（「使用说明」里能再看一遍）
  maybeTour() {
    if (this.data.tourShow || this.tourTimer || seen('today')) return
    this.tourTimer = clockOf(this).set(() => {
      this.tourTimer = null
      this.setData({ tourShow: true })
    }, TOUR_AFTER_MS)
  },

  stopTour() {
    if (!this.tourTimer) return
    clockOf(this).clear(this.tourTimer)
    this.tourTimer = null
  },

  onTourDone() {
    markSeen('today')
    this.setData({ tourShow: false })
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
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

  // 她第一次「允许」时勾了「总是保持以上选择」的话，以后申请不弹窗：点首页拍照时也顺手攒一次（没勾的不在这儿弹，只在交给小暖时问）
  checkSilent(remind) {
    this.silentTemplate = ''
    const id = remind && remind.notify ? remind.templateId : ''
    if (!id || !wx.getSetting) return
    wx.getSetting({
      withSubscriptions: true,
      success: (res) => {
        const items = (res.subscriptionsSetting && res.subscriptionsSetting.itemSettings) || {}
        if (items[id] === 'accept') this.silentTemplate = id
      },
    })
  },

  silentSubscribe() {
    const id = this.silentTemplate
    if (!id || !wx.requestSubscribeMessage) return
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: (res) => {
        if (res[id] === 'accept') api.call('remind.subscribed', { accepted: true, version: appVersion() }).catch(() => {})
      },
    })
  },

  goCheckin(e) {
    this.silentSubscribe()
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
