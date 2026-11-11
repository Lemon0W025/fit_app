// 亲友看板（准时打卡设计第四块）：我关注的亲友今天吃了什么、准不准时，给 TA 点个赞；
// 带着邀请码打开（亲友分享的卡片，?code=）先问一句称呼，点了才建立关系。看的人不用建档
const api = require('../../utils/api')
const { boardView } = require('../../utils/family')
const { appVersion } = require('../../utils/remind')
const { buzz } = require('../../utils/fx')

Page({
  data: {
    loading: true,
    view: null,
    // 接受邀请时填的称呼（不填就叫「亲友」）
    name: '',
    working: false,
  },

  onLoad(options) {
    this.code = (options && options.code) || ''
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    return api.call('family.get', this.code ? { code: this.code } : {})
      .then((res) => this.show(res))
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  show(res) {
    this.board = res
    this.setData({ loading: false, view: boardView(res) })
    this.checkSilent()
  },

  render() {
    this.setData({ view: boardView(this.board) })
  },

  person(owner) {
    return ((this.board && this.board.people) || []).find((p) => p.owner === owner) || null
  },

  // 微信昵称的输入框：选了昵称有的版本不触发 input，离开输入框时再记一次
  onName(e) {
    this.setData({ name: e.detail.value || '' })
  },

  // 接受邀请：建立关注关系，之后就是普通的看板
  accept() {
    if (this.data.working || !this.code) return
    this.setData({ working: true })
    api.call('family.accept', { code: this.code, name: this.data.name })
      .then((res) => {
        this.code = ''
        wx.showToast({ title: `能看到${res.name}的打卡了`, icon: 'none' })
        return this.load()
      })
      .then(() => this.setData({ working: false }))
      .catch((err) => {
        this.setData({ working: false })
        api.showError(err)
        // 邀请过期了之类的：重新读一次，卡片上写清楚
        this.load()
      })
  },

  // 点赞：先变实心再去记，没记上再变回来；赞过的再点没反应
  like(e) {
    const { owner, id } = e.currentTarget.dataset
    const p = this.person(owner)
    const meal = p && p.meals.find((m) => m._id === id)
    if (!meal || meal.liked) return
    this.silentSubscribe()
    meal.liked = true
    this.render()
    buzz('light')
    api.call('family.like', { owner, mealId: id })
      .then((res) => {
        meal.likeNames = res.likeNames
        this.render()
      })
      .catch((err) => {
        meal.liked = false
        this.render()
        api.showError(err)
      })
  },

  previewPhoto(e) {
    wx.previewImage({ urls: [e.currentTarget.dataset.url] })
  },

  // 向微信要一次「允许」（要在点击里调），允许了攒一次（和饭点提醒攒的是同一份次数）
  askAllow(then) {
    const id = this.board && this.board.templateId
    if (!id || !wx.requestSubscribeMessage) return
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: (res) => {
        if (res[id] !== 'accept') {
          wx.showModal({ title: '没有允许', content: '要点「允许」微信才能提醒你。最好勾上「总是保持以上选择，不再询问」', showCancel: false })
          return
        }
        api.call('remind.subscribed', { accepted: true, version: appVersion() })
          .then((r) => {
            this.board.credits = r.credits
            then()
          })
          .catch((err) => api.showError(err))
      },
      fail: () => api.showError(new Error('微信提醒打不开，稍后再试')),
    })
  },

  // 「TA 过了饭点没拍，提醒我」：打开时先要一次「允许」，再开
  toggleNotify(e) {
    if (this.data.working) return
    const owner = e.currentTarget.dataset.owner
    if (!e.detail.value) return this.setNotify(owner, false)
    this.askAllow(() => this.setNotify(owner, true))
  },

  setNotify(owner, on) {
    this.setData({ working: true })
    return api.call('family.setNotify', { owner, on })
      .then((res) => {
        const p = this.person(owner)
        if (p) p.notify = res.notify
        this.setData({ working: false })
        this.render()
        this.checkSilent()
        wx.showToast({ title: on ? '开好了' : '关掉了', icon: 'success' })
      })
      .catch((err) => {
        this.setData({ working: false })
        api.showError(err)
      })
  },

  // 微信规定每点一次「允许」只能提醒一次：次数不够了再攒一次
  addCredit() {
    this.askAllow(() => {
      this.render()
      wx.showToast({ title: '攒上了', icon: 'success' })
    })
  },

  // 第一次「允许」时勾了「总是保持以上选择」的，以后要「允许」不弹窗：开着提醒时，每次点赞顺手攒一次
  checkSilent() {
    this.silentTemplate = ''
    const b = this.board
    const id = b && b.templateId
    if (!id || !wx.getSetting || !(b.people || []).some((p) => p.notify)) return
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
        if (res[id] !== 'accept') return
        api.call('remind.subscribed', { accepted: true, version: appVersion() })
          .then((r) => {
            this.board.credits = r.credits
            this.render()
          })
          .catch(() => {})
      },
    })
  },

  // 不看了：先问一句
  leave(e) {
    const { owner, name } = e.currentTarget.dataset
    wx.showModal({
      title: `不看${name}的打卡了？`,
      content: '以后想看，要让 TA 再邀请你一次。',
      confirmText: '不看了',
      confirmColor: '#d4543c',
      success: (res) => {
        if (!res.confirm) return
        api.call('family.leave', { owner })
          .then(() => this.load())
          .catch((err) => api.showError(err))
      },
    })
  },

  goToday() {
    wx.switchTab({ url: '/pages/today/today' })
  },
})
