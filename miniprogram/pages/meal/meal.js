const api = require('../../utils/api')
const { decorateMeal, decorateGain, gainTitle, milestoneView } = require('../../utils/view')
const { arrivalCard } = require('../../utils/camp-view')
const { clockOf, countUp, buzz } = require('../../utils/fx')
const { adjustView, adjustRequest, previewText, peopleText, rangeText, howToast, tuneText, moreOpenFor, APPETITES, LEFTS, TUNES } = require('../../utils/portion')
const { likesText } = require('../../utils/family')

// 刚打完卡的节奏（毫秒）：盖章落下时轻震，三顿都准时撒彩带，里程碑等前面都播完再弹
const FX = { buzz: 250, beansMs: 600, kcalMs: 800, burst: 700, milestone: 1400 }
// 改完份量，大字的热量从原来的滚到新的
const ADJUST_KCAL_MS = 600
// 不在「点掉没吃的」
const NO_PICKS = { picking: false, picks: {}, pickCount: 0, pickText: '点一下没吃的' }

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
    // 改份量的抽屉（utils/portion.js 的 adjustView）
    adjust: null,
    adjustShow: false,
    // 几个人一起吃、饭量、吃完了吗
    peopleText: '',
    rangeText: '',
    appetites: APPETITES,
    lefts: LEFTS,
    // 整体比估的少一些 / 差不多 / 多一些；不常用的几项（几个人、吃完了吗、点掉没吃的）收在「这顿有变化？」里
    tunes: TUNES,
    tuneText: '',
    moreOpen: false,
    // 一次点掉几道没吃的：picks[第几道] = true
    picking: false,
    picks: {},
    pickCount: 0,
    pickText: '点一下没吃的',
    // 亲友给这顿点的赞：「❤ 小明 赞了」
    likesText: '',
  },

  onLoad(options) {
    this.mealId = options.id
    // 刚打完卡跳过来时：这次得了多少暖豆、有没有小动物搬来
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
    this.setData({ loading: false, meal: decorateMeal(meal), note: meal.note || '', ...this.peopleView(meal) })
    this.setData({ likesText: likesText(meal.likes) })
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

  // ---------------------------------------------------------------- 改份量

  // 点一道菜：抽屉里一根滑杆，按克数（老打卡按倍数）拖，大字跟着算热量
  openDish(e) {
    const meal = this.data.meal
    const a = meal && meal.status === 'done' ? meal.analysis : null
    if (!a || a.isFood === false) return
    const index = Number(e.currentTarget.dataset.index)
    const dish = (a.foods || [])[index]
    if (!dish) return
    if (this.data.picking) return this.togglePick(index)
    this.dish = dish
    const adjust = adjustView(dish, index, this.data.meal.people || 1)
    this.portionValue = adjust.value
    this.setData({ adjust, adjustShow: true })
  },

  // 拖着的时候：只改大字（滑杆自己跟手，这里不回写 value）
  onPortionSliding(e) {
    this.portionValue = e.detail.value
    this.setData({ 'adjust.preview': previewText(this.dish, this.data.adjust.mode, e.detail.value) })
  },

  // 松手、点快捷按钮：值定下来（快捷按钮改了 value，滑杆带过渡滑过去）
  onPortionSlide(e) {
    this.setPortion(e.detail.value)
  },

  pickPortion(e) {
    this.setPortion(Number(e.currentTarget.dataset.value))
  },

  setPortion(value) {
    this.portionValue = value
    this.setData({ 'adjust.value': value, 'adjust.preview': previewText(this.dish, this.data.adjust.mode, value) })
  },

  closeAdjust() {
    this.setData({ adjustShow: false })
  },

  // 没改：小暖「拿不准」的菜算看过了、没错（去掉标记），别的直接关上
  saveAdjust() {
    const req = adjustRequest(this.data.adjust, this.portionValue)
    if (req) return this.sendAdjust(req, '改好了')
    if (this.dish && this.dish.unsure) return this.sendAdjust({ confirm: true }, '好的')
    this.closeAdjust()
  },

  removeDish() {
    wx.showModal({
      title: `${this.data.adjust.name}没吃？`,
      content: '这道菜从这顿里去掉，热量也减掉',
      confirmText: '去掉',
      success: (res) => {
        if (res.confirm) this.sendAdjust({ remove: true }, '去掉了')
      },
    })
  },

  sendAdjust(req, toast) {
    this.update('meal.adjust', { index: this.data.adjust.index, ...req }, toast)
  },

  // 改份量、改人数：存好后热量从原来的滚到新的
  update(action, data, toast) {
    if (this.data.working) return
    const from = this.data.meal.analysis.totalKcal
    this.setData({ working: true })
    api.call(action, { mealId: this.mealId, ...data })
      .then((meal) => {
        const view = decorateMeal(meal)
        const to = meal.analysis.totalKcal
        this.setData({ working: false, adjustShow: false, meal: { ...view, kcalText: `约 ${from} 千卡` }, ...this.peopleView(meal), ...NO_PICKS })
        const c = countUp(from, to, ADJUST_KCAL_MS, (n) => this.setData({ 'meal.kcalText': `约 ${n} 千卡` }), clockOf(this))
        this.counters = (this.counters || []).concat(c)
        wx.showToast({ title: toast, icon: 'success' })
      })
      .catch((err) => {
        this.setData({ working: false })
        api.showError(err)
      })
  },

  // ---------------------------------------------------------------- 几个人一起吃

  peopleView(meal) {
    const people = meal.people || 1
    const ok = meal.status === 'done' && meal.analysis && meal.analysis.isFood !== false
    return {
      peopleText: peopleText(people, meal.appetite),
      rangeText: ok ? rangeText(meal.analysis, people) : '',
      tuneText: tuneText(meal.tune),
      // 自己点开过就一直开着；和别人一起吃的、没吃完的先展开
      moreOpen: this.data.moreOpen || moreOpenFor(meal),
    }
  },

  toggleMore() {
    this.setData({ moreOpen: !this.data.moreOpen })
  },

  // 整体看，实际吃的比估的少一些 / 差不多 / 多一些：每道菜一起调（自己改过份量的不动）
  onTune(e) {
    const tune = e.detail.value
    if (!tune || tune === (this.data.meal.tune || 'same')) return
    this.update('meal.share', { tune }, howToast({ tune }))
  },

  // 点「就我 / 2 人 / … / 更多」（components/people）：大家夹的菜按人数分（meal.share）
  onPeople(e) {
    const people = e.detail.value
    if (!people || people === (this.data.meal.people || 1)) return
    this.update('meal.share', { people }, howToast({ people }))
  },

  // 和大家比吃得少 / 差不多 / 多：大家夹的菜再乘一下；顺手记在手机上，下次打卡默认这个
  onAppetite(e) {
    const appetite = e.detail.value
    if (!appetite || appetite === (this.data.meal.appetite || 'same')) return
    wx.setStorageSync('appetite', appetite)
    this.update('meal.share', { appetite }, howToast({ appetite }))
  },

  // 吃完了吗：全吃了 / 剩了一点 / 剩了一半，每道菜都按这个算
  onLeft(e) {
    const left = e.detail.value
    if (!left || left === (this.data.meal.left || 'none')) return
    this.update('meal.share', { left }, howToast({ left }))
  },

  // ---------------------------------------------------------------- 一次点掉几道没吃的

  startPick() {
    this.setData({ picking: true, picks: {}, pickCount: 0, pickText: '点一下没吃的' })
  },

  cancelPick() {
    this.setData(NO_PICKS)
  },

  togglePick(index) {
    const picks = { ...this.data.picks }
    if (picks[index]) delete picks[index]
    else picks[index] = true
    const n = Object.keys(picks).length
    // 至少留一道吃了的
    if (n >= this.data.meal.dishes.length) {
      wx.showToast({ title: '至少留一道吃了的', icon: 'none' })
      return
    }
    this.setData({ picks, pickCount: n, pickText: n ? `去掉这 ${n} 道` : '点一下没吃的' })
  },

  confirmPick() {
    const indexes = Object.keys(this.data.picks).map(Number)
    if (!indexes.length) return
    this.update('meal.skip', { indexes }, '去掉了')
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
      confirmColor: '#C82014',
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
