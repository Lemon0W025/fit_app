// 第一次打开（还没建档）：四张大字卡片说清楚怎么用，最后「开始」去建档（新手三步：建档 → 设饭点提醒 → 拍第一顿）。
// 左右滑或点「下一步」；右上「跳过」直接到最后一张
const { WELCOME_CARDS } = require('../../utils/guide')

Page({
  data: {
    cards: WELCOME_CARDS,
    current: 0,
  },

  onLoad() {
    getApp().globalData.welcomed = true
  },

  onSwipe(e) {
    this.setData({ current: e.detail.current })
  },

  next() {
    const last = this.data.cards.length - 1
    if (this.data.current < last) this.setData({ current: this.data.current + 1 })
    else this.start()
  },

  skip() {
    this.setData({ current: this.data.cards.length - 1 })
  },

  start() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },
})
