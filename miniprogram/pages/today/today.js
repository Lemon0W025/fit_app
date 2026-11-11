const api = require('../../utils/api')
const { buildDayView, greetingText, beansCard, nextMealCard, nextMealHero } = require('../../utils/view')
const { localHour } = require('../../utils/shared/date')
const { mealTimesOf, mealStatus } = require('../../utils/shared/timing')
const { clockOf } = require('../../utils/fx')
const { guideCard, streakPill, remindLowCard, familyHintCard } = require('../../utils/guide')
const { TOURS, seen, markSeen } = require('../../utils/tours')
const { appVersion } = require('../../utils/remind')
const { likesView, shareCard, SEEN_LIKES_KEY } = require('../../utils/family')
const { patchCard, weekCard } = require('../../utils/week')
const { syncTabBar } = require('../../utils/tab-bar')

const GUIDE_HIDDEN_KEY = 'guideHidden' // 新手三步点过「不用了」
const PATCH_HIDDEN_KEY = 'patchHidden' // 补签卡点过「算了」的那一天
const WEEK_SEEN_KEY = 'weekSeen' // 看过小结的上一周（周一的日期）
const REMIND_LOW_HIDDEN_KEY = 'remindLowHidden' // 「微信提醒快用完了」点过「今天不提了」/ 续上过的那一天
const FAMILY_HINT_HIDDEN_KEY = 'familyHintHidden' // 邀请亲友的提示点过「不用了」

// 下一顿大卡和提示跟着时间走（倒计时、过点），每分钟按现在的时间重算一次
const REFRESH_MS = 60000
const TOUR_AFTER_MS = 700 // 卡片浮上来之后再开始导览

Page({
  data: {
    loading: true,
    view: null,
    daily: null,
    card: null,
    hero: null,
    greeting: '',
    summarizing: false,
    guide: null,
    tourSteps: TOURS.today,
    tourShow: false,
    // 补签卡、上周的小结（utils/week.js）
    patch: null,
    patching: false,
    weekCard: null,
    // 问好旁边的连续天数；微信提醒快用完了；邀请亲友的提示（utils/guide.js）
    streak: null,
    remindLow: null,
    renewing: false,
    familyHint: null,
    // 亲友的赞：by 是每顿下面那行，note 是新来的赞的提示（utils/family.js 的 likesView）
    likes: { by: {}, note: '' },
  },

  onShow() {
    syncTabBar(this)
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
        // 第一次使用：先看欢迎页（这次打开只看一次），再去建档。
        // 没建档但关注了亲友的（只是来看亲友打卡）：这次打开先去亲友页，从那儿回来再走欢迎页
        if (!day.profile) {
          const app = getApp()
          if (day.following > 0 && !app.globalData.familyFirst) {
            app.globalData.familyFirst = true
            wx.navigateTo({ url: '/pages/family/family' })
            return
          }
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
          patch: patchCard(day.daily && day.daily.patch, this.stored(PATCH_HIDDEN_KEY)),
          weekCard: weekCard(day.date, this.stored(WEEK_SEEN_KEY), !!(day.guide && day.guide.meal)),
          streak: streakPill(day.daily),
          remindLow: remindLowCard(day.remind, this.stored(REMIND_LOW_HIDDEN_KEY), day.date),
        })
        this.maybeFamilyHint(day)
        this.refresh()
        this.maybeTour()
        this.showLikes(day)
        this.maybeSummary(day)
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  refresh() {
    const meals = this.day.meals || []
    // 暖豆卡只说得了多少、印章、连续几天；该拍哪顿、能得多少在上面的大卡里说
    const status = mealStatus(meals, this.times, new Date())
    this.setData({
      card: nextMealCard(status),
      hero: nextMealHero(status),
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

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
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

  // 亲友看板：亲友给今天的打卡点的赞写在每顿下面；上次看过之后新来的赞，最上面提示一次（记在本地，下次进来就不再提）
  showLikes(day) {
    let seenAt = 0
    try {
      seenAt = Number(wx.getStorageSync(SEEN_LIKES_KEY)) || 0
    } catch (e) {
      // 读不到就当没看过
    }
    const v = likesView(day.meals, seenAt)
    this.setData({ likes: { by: v.by, note: v.note } })
    if (v.latest <= seenAt) return
    try {
      wx.setStorageSync(SEEN_LIKES_KEY, v.latest)
    } catch (e) {
      // 存不了：下次进来再提一次
    }
  },

  stored(key) {
    try {
      return wx.getStorageSync(key) || ''
    } catch (e) {
      return ''
    }
  },

  // 补签卡：问一句，花暖豆把昨天补上，连续打卡接着算
  usePatch() {
    const patch = this.data.patch
    if (!patch || !patch.can || this.data.patching) return
    wx.showModal({
      title: '补上昨天？',
      content: patch.confirm,
      confirmText: '补上',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ patching: true })
        api.call('forest.patch')
          .then((done) => {
            this.setData({ patching: false, patch: null })
            wx.showToast({ title: done.milestone ? `补上了！拿到 ${done.milestone.days} 天纪念章` : `补上了，已连续 ${done.streak} 天`, icon: 'none' })
            this.load()
          })
          .catch((err) => {
            this.setData({ patching: false })
            api.showError(err)
          })
      },
    })
  },

  hidePatch() {
    const patch = this.data.patch
    try {
      if (patch) wx.setStorageSync(PATCH_HIDDEN_KEY, patch.date)
    } catch (e) {
      // 存不了：这次先藏起来
    }
    this.setData({ patch: null })
  },

  goWeek() {
    wx.navigateTo({ url: '/pages/week/week?offset=1' })
  },

  store(key, value) {
    try {
      wx.setStorageSync(key, value)
    } catch (e) {
      // 存不了：这次先藏起来，下次进来再提
    }
  },

  // 微信提醒续上：一次「允许」攒一次。点了允许今天就不再提（没点允许卡片留着）
  renewRemind() {
    const id = this.day && this.day.remind && this.day.remind.templateId
    if (!id || this.data.renewing) return
    if (!wx.requestSubscribeMessage) {
      wx.showToast({ title: '微信版本太旧，续不上', icon: 'none' })
      return
    }
    this.setData({ renewing: true })
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: (res) => {
        if (res[id] !== 'accept') {
          this.setData({ renewing: false })
          wx.showToast({ title: '没点「允许」，这次没续上', icon: 'none' })
          return
        }
        api.call('remind.subscribed', { accepted: true, version: appVersion() })
          .then((r) => {
            this.store(REMIND_LOW_HIDDEN_KEY, this.day.date)
            this.day.remind = { ...this.day.remind, credits: r.credits }
            this.setData({ renewing: false, remindLow: null })
            wx.showToast({ title: `续上了，还能提醒 ${r.credits} 次`, icon: 'none' })
            this.checkSilent(this.day.remind)
          })
          .catch((err) => {
            this.setData({ renewing: false })
            api.showError(err)
          })
      },
      fail: () => {
        this.setData({ renewing: false })
        wx.showToast({ title: '没续上，去「我的 → 饭点提醒」看看', icon: 'none' })
      },
    })
  },

  hideRemindLow() {
    this.store(REMIND_LOW_HIDDEN_KEY, this.day ? this.day.date : '')
    this.setData({ remindLow: null })
  },

  // 邀请亲友的提示：要先拿到邀请码（分享卡片带着它），拿到了才显示，一次打开只取一次
  maybeFamilyHint(day) {
    const card = familyHintCard((day.daily && day.daily.streak) || 0, day.viewers || 0, !!this.stored(FAMILY_HINT_HIDDEN_KEY))
    if (!card) {
      if (this.data.familyHint) this.setData({ familyHint: null })
      return
    }
    if (this.familyCode) {
      this.setData({ familyHint: card })
      return
    }
    api.call('family.mine')
      .then((mine) => {
        if (!mine.code) return
        this.familyCode = mine.code
        this.setData({ familyHint: card })
      })
      .catch(() => {})
  },

  hideFamilyHint() {
    this.store(FAMILY_HINT_HIDDEN_KEY, true)
    this.setData({ familyHint: null })
  },

  // 「邀请亲友」按钮分享出去的卡片带着邀请码；右上角菜单里的转发只是普通分享
  onShareAppMessage(res) {
    if (res && res.from === 'button' && this.familyCode) return shareCard(this.familyCode)
    return { title: '小暖自律打卡：每顿拍一张，准时吃饭', path: '/pages/today/today' }
  },

  // 晚饭拍好了、今天还没有总结：小暖自己写一份（一天只自动试一次，没写出来不打扰，按钮还在）
  maybeSummary(day) {
    if (day.summary || this.data.summarizing || this.autoSummaryFor === day.date) return
    const dinner = (day.meals || []).some((m) => m.mealType === 'dinner' && m.status === 'done')
    if (!dinner) return
    this.autoSummaryFor = day.date
    this.summarize(true)
  },

  generateSummary() {
    this.summarize(false)
  },

  summarize(quiet) {
    if (this.data.summarizing) return
    this.setData({ summarizing: true })
    api.call('summary.generate')
      .then((summary) => this.setData({ summarizing: false, 'view.summary': summary }))
      .catch((err) => {
        this.setData({ summarizing: false })
        if (!quiet) api.showError(err)
      })
  },
})
