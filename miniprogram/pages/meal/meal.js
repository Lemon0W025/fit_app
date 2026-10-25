const api = require('../../utils/api')
const { decorateMeal, decorateGain, gainTitle, milestoneView } = require('../../utils/view')
const { arrivalCard } = require('../../utils/camp-view')
const { clockOf, countUp, buzz } = require('../../utils/fx')

// 刚打完卡的节奏（毫秒）：盖章落下时轻震，三顿都准时撒彩带，里程碑等前面都播完再弹
const FX = { buzz: 250, beansMs: 600, kcalMs: 800, burst: 700, milestone: 1400 }

Page({
  data: {
    loading: true,
    meal: null,
    gain: null,
    arrival: null,
    note: '',
    editing: false,
    working: false,
    fxSkip: false,
    celebrate: '',
    milestone: null,
  },

  onLoad(options) {
    this.mealId = options.id
    // 刚打完卡跳过来时，告诉妈妈这次得了多少暖豆、有没有小动物搬来
    const app = getApp()
    const last = app.globalData.lastGain
    if (last && last.mealId === options.id) {
      this.freshGain = last.gain
      this.setData({ gain: decorateGain(last.gain, { fresh: true }), arrival: arrivalCard(last.arrival) })
      app.globalData.lastGain = null
    }
    api.call('meal.get', { mealId: this.mealId })
      .then((meal) => this.showMeal(meal))
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  showMeal(meal) {
    this.setData({ loading: false, meal: decorateMeal(meal), note: meal.note || '' })
    if (this.freshGain) {
      const raw = this.freshGain
      this.freshGain = null
      this.playFx(raw)
    }
  },

  // 刚打完卡：暖豆和热量从 0 滚上来，盖章那一下轻震，三顿都准时撒一把彩带，到了里程碑最后弹庆祝
  playFx(raw) {
    const clock = clockOf(this)
    this.fxTimers = []
    this.counters = []
    const later = (fn, ms) => {
      const h = clock.set(() => {
        this.fxTimers = this.fxTimers.filter((x) => x !== h)
        fn()
      }, ms)
      this.fxTimers.push(h)
    }
    later(() => buzz('light'), FX.buzz)
    if (raw && raw.beans > 0 && this.data.gain) {
      this.counters.push(countUp(0, raw.beans, FX.beansMs, (n) => this.setData({ 'gain.title': gainTitle(raw, n) }), clock))
    }
    const meal = this.data.meal
    if (meal.status === 'done' && meal.analysis && meal.analysis.isFood !== false) {
      this.counters.push(countUp(0, meal.analysis.totalKcal, FX.kcalMs, (n) => this.setData({ 'meal.kcalText': `约 ${n} 千卡` }), clock))
    }
    if (raw && raw.milestone) {
      this.pendingMilestone = milestoneView(raw.milestone)
      later(() => this.openMilestone(), FX.milestone)
    } else if (raw && raw.allOnTime) {
      later(() => this.setData({ celebrate: 'burst' }), FX.burst)
    }
  },

  stopFx() {
    const clock = clockOf(this)
    ;(this.fxTimers || []).forEach((h) => clock.clear(h))
    this.fxTimers = []
    ;(this.counters || []).forEach((c) => c.finish())
    this.counters = []
  },

  // 点一下屏幕：动效直接跳到结束，有里程碑就马上弹
  skipFx() {
    const playing = (this.fxTimers || []).length > 0 || (this.counters || []).some((c) => !c.done())
    if (!playing && !this.pendingMilestone) return
    this.stopFx()
    this.setData({ fxSkip: true })
    this.openMilestone()
  },

  openMilestone() {
    if (!this.pendingMilestone) return
    const milestone = this.pendingMilestone
    this.pendingMilestone = null
    this.setData({ celebrate: 'milestone', milestone })
  },

  onCelebrateClose() {
    this.setData({ celebrate: '' })
  },

  onUnload() {
    this.stopFx()
  },

  previewPhoto() {
    wx.previewImage({ urls: [this.data.meal.fileID] })
  },

  startEdit() {
    this.setData({ editing: true })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  reanalyze() {
    if (this.data.working) return
    this.setData({ working: true })
    wx.showLoading({ title: '小暖重新看看…', mask: true })
    api.call('meal.reanalyze', { mealId: this.mealId, note: this.data.note })
      .then((meal) => {
        wx.hideLoading()
        this.setData({ working: false, editing: false, gain: decorateGain(meal.gain) })
        this.showMeal(meal)
        if (meal.status === 'failed') api.showError(new Error(meal.error))
      })
      .catch((err) => {
        wx.hideLoading()
        this.setData({ working: false })
        api.showError(err)
      })
  },

  remove() {
    wx.showModal({
      title: '删除这条打卡？',
      content: '删除后不能恢复',
      confirmText: '删除',
      confirmColor: '#D1543F',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        api.call('meal.delete', { mealId: this.mealId })
          .then(() => {
            wx.hideLoading()
            this.backToToday()
          })
          .catch((err) => {
            wx.hideLoading()
            api.showError(err)
          })
      },
    })
  },

  goCamp() {
    wx.switchTab({ url: '/pages/camp/camp' })
  },

  backToToday() {
    wx.switchTab({ url: '/pages/today/today' })
  },
})
