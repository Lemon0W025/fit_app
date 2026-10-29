// 饭点提醒（准时打卡设计第二块）：手机日历里加三个每天重复的饭点闹钟；有微信模板时还能开「快过饭点还没拍，用微信提醒我」。
// 第一次建档后自动进来（?first=1），底下「设好了，去拍第一顿」
const api = require('../../utils/api')
const { remindView, calendarEvents } = require('../../utils/remind')

Page({
  data: {
    loading: true,
    first: false,
    view: null,
    working: false,
  },

  onLoad(options) {
    this.setData({ first: !!(options && options.first) })
  },

  onShow() {
    this.load()
  },

  load() {
    return api.call('remind.get')
      .then((res) => this.show(res))
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  show(res) {
    this.remind = res
    this.setData({ loading: false, view: remindView(res) })
  },

  // 手机日历：一个一个加（每个微信都会问一下），加完记下当时的饭点
  addCalendar() {
    if (this.data.working) return
    if (!wx.canIUse || !wx.canIUse('addPhoneRepeatCalendar')) {
      wx.showModal({ title: '加不了日历', content: '微信版本有点旧，升级微信后再来加', showCancel: false })
      return
    }
    const times = this.remind.mealTimes
    const events = calendarEvents(times, new Date())
    this.setData({ working: true })
    const next = (i) => {
      if (i >= events.length) {
        api.call('remind.calendarDone', { times })
          .then((res) => {
            this.setData({ working: false })
            this.show(res)
            wx.showToast({ title: '三个闹钟加好了', icon: 'success' })
          })
          .catch((err) => {
            this.setData({ working: false })
            api.showError(err)
          })
        return
      }
      wx.addPhoneRepeatCalendar({
        ...events[i],
        success: () => next(i + 1),
        fail: (err) => {
          this.setData({ working: false })
          const msg = (err && err.errMsg) || ''
          if (/cancel/.test(msg)) return
          if (/auth|deny|permission/i.test(msg)) {
            wx.showModal({
              title: '要允许加日历',
              content: '在设置里打开「添加到日历」，再回来点一次',
              confirmText: '去设置',
              success: (r) => r.confirm && wx.openSetting(),
            })
            return
          }
          api.showError(new Error('没加上，稍后再试一次'))
        },
      })
    }
    next(0)
  },

  // 微信提醒开关：打开时先申请一次「允许」（要在点击里调），允许了攒一次再打开
  toggleNotify(e) {
    if (this.data.working) return
    const on = e.detail.value
    const id = this.remind.templateId
    if (!on) return this.setNotify(false)
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: (res) => {
        const accepted = res[id] === 'accept'
        if (!accepted) {
          wx.showModal({ title: '没有允许', content: '要点「允许」才能用微信提醒。最好勾上「总是保持以上选择，不再询问」', showCancel: false })
          return
        }
        api.call('remind.subscribed', { accepted: true }).then(() => this.setNotify(true)).catch((err) => api.showError(err))
      },
      fail: () => api.showError(new Error('微信提醒打不开，稍后再试')),
    })
  },

  setNotify(on) {
    this.setData({ working: true })
    api.call('remind.setNotify', { on })
      .then((res) => {
        this.setData({ working: false })
        this.show(res)
        wx.showToast({ title: on ? '开好了' : '关掉了', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ working: false })
        api.showError(err)
      })
  },

  editTimes() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  // 第一次：设好了，去拍第一顿
  done() {
    wx.switchTab({ url: '/pages/today/today' })
  },
})
