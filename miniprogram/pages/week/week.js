// 每周小结（week.get）：打卡几天、准时几顿、每天吃了多少、小暖挑的两三句话。默认看上一周，左右箭头换周
const api = require('../../utils/api')
const { weekView } = require('../../utils/week')

const SEEN_KEY = 'weekSeen' // 看过的上一周（首页周一到周三的那张卡不再出）

Page({
  data: {
    loaded: false,
    view: null,
  },

  onLoad(options) {
    const n = Number(options && options.offset)
    this.load(Number.isInteger(n) && n >= 0 ? n : 1)
  },

  load(offset) {
    return api.call('week.get', { offset })
      .then((week) => {
        this.setData({ loaded: true, view: weekView(week) })
        if (offset === 1) this.markSeen(week.start)
      })
      .catch((err) => {
        this.setData({ loaded: true })
        api.showError(err)
      })
  },

  markSeen(start) {
    try {
      wx.setStorageSync(SEEN_KEY, start)
    } catch (e) {
      // 存不了：首页那张卡下次还会出，不要紧
    }
  },

  older() {
    const v = this.data.view
    if (v && v.older !== null) this.load(v.older)
  },

  newer() {
    const v = this.data.view
    if (v && v.newer !== null) this.load(v.newer)
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },
})
