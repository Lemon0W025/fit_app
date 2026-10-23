const api = require('../../utils/api')
const { decorateMeal, decorateGain } = require('../../utils/view')
const { arrivalCard } = require('../../utils/garden-view')

Page({
  data: {
    loading: true,
    meal: null,
    gain: null,
    arrival: null,
    note: '',
    editing: false,
    working: false,
  },

  onLoad(options) {
    this.mealId = options.id
    // 刚打完卡跳过来时，告诉妈妈这次得了多少暖豆、有没有小动物搬来
    const app = getApp()
    const last = app.globalData.lastGain
    if (last && last.mealId === options.id) {
      this.setData({ gain: decorateGain(last.gain), arrival: arrivalCard(last.arrival) })
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

  goGarden() {
    wx.switchTab({ url: '/pages/garden/garden' })
  },

  backToToday() {
    wx.switchTab({ url: '/pages/today/today' })
  },
})
