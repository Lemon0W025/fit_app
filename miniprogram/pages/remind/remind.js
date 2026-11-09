// 饭点提醒（准时打卡设计第二块）：手机日历里加三个每天重复的饭点闹钟；有微信模板时还能开「到饭点用微信提醒我」。
// 第一次建档后自动进来（?first=1），底下「设好了，去拍第一顿」
const api = require('../../utils/api')
const { remindView, calendarEvent, appVersion } = require('../../utils/remind')
const { MEAL_WORDS } = require('../../utils/shared/timing')

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

  // 手机日历：一顿一个按钮（微信规定一次点击只能加一个，连着加后面的会被拒），加好了记下这顿
  addCalendar(e) {
    if (this.data.working) return
    const mealType = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.meal : ''
    if (!mealType) return
    if (!wx.canIUse || !wx.canIUse('addPhoneRepeatCalendar')) {
      wx.showModal({ title: '加不了日历', content: '微信版本有点旧，升级微信后再来加', showCancel: false })
      return
    }
    const times = this.remind.mealTimes
    this.setData({ working: true })
    wx.addPhoneRepeatCalendar({
      ...calendarEvent(times, new Date(), mealType),
      success: () => {
        api.call('remind.calendarDone', { times, mealType })
          .then((res) => {
            this.setData({ working: false })
            this.show(res)
            wx.showToast({ title: `${MEAL_WORDS[mealType]}闹钟加好了`, icon: 'success' })
          })
          .catch((err) => {
            this.setData({ working: false })
            api.showError(err)
          })
      },
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
        api.showError(new Error('没加上，再点一下按钮试试'))
      },
    })
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
        api.call('remind.subscribed', { accepted: true, version: appVersion() }).then(() => this.setNotify(true)).catch((err) => api.showError(err))
      },
      fail: () => api.showError(new Error('微信提醒打不开，稍后再试')),
    })
  },

  // 一键开通：云函数自己找一个「用餐提醒 / 打卡提醒」模板加上；开通好了再点开关「允许」
  setupWechat() {
    if (this.data.working) return
    this.setData({ working: true })
    wx.showLoading({ title: '正在开通', mask: true })
    api.call('remind.setup')
      .then((res) => {
        wx.hideLoading()
        this.setData({ working: false })
        this.show(res)
        wx.showModal({ title: '开通好了', content: '打开下面「微信提醒」的开关，弹出来时勾上「总是保持以上选择」再点「允许」', showCancel: false })
      })
      .catch((err) => {
        wx.hideLoading()
        this.setData({ working: false })
        api.showError(err)
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

  // 现在发一条试试：先申请一次「允许」（要在点击里调，正好补上要用掉的那次），再让云函数按现在这顿发一条
  testSend() {
    if (this.data.working) return
    const id = this.remind.templateId
    this.setData({ working: true })
    const send = () => api.call('remind.test')
      .then((res) => {
        this.setData({ working: false })
        this.show(res)
        wx.showModal({ title: '发出去了', content: '看看微信聊天列表里的「服务通知」，点开会直接到拍照页', showCancel: false })
      })
      .catch((err) => {
        this.setData({ working: false })
        api.showError(err)
        this.load()
      })
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: (res) => {
        if (res[id] !== 'accept') return send()
        api.call('remind.subscribed', { accepted: true, version: appVersion() }).then(send, send)
      },
      fail: () => send(),
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
