const api = require('../../utils/api')
const { calcDailyKcal, ACTIVITY_LABELS } = require('../../utils/shared/nutrition')
const { MAIN_MEALS, MEAL_WORDS, DEFAULT_MEAL_TIMES, timeOptions, mealTimesOf } = require('../../utils/shared/timing')
const { mineView, shareCard } = require('../../utils/family')
const { syncTabBar } = require('../../utils/tab-bar')

const FIELDS = ['nickname', 'sex', 'age', 'heightCm', 'weightKg', 'targetWeightKg', 'activity', 'avoid']
const NUMBER_FIELDS = ['age', 'heightCm', 'weightKg', 'targetWeightKg']
const EMPTY_FORM = { nickname: '', sex: 'female', age: '', heightCm: '', weightKg: '', targetWeightKg: '', activity: 'light', avoid: '', mealTimes: { ...DEFAULT_MEAL_TIMES } }

function pickForm(profile) {
  const form = {}
  FIELDS.forEach((k) => {
    form[k] = profile[k] == null ? '' : profile[k]
  })
  form.mealTimes = mealTimesOf(profile)
  return form
}

// 填写过程中实时预览每日预算；数字没填全时返回 0
function previewKcal(form) {
  const nums = {}
  for (const k of NUMBER_FIELDS) {
    const n = Number(form[k])
    if (form[k] === '' || !isFinite(n) || n <= 0) return 0
    nums[k] = n
  }
  return calcDailyKcal({ ...form, ...nums })
}

// 三餐时间的三行：每行的选项和当前选中的是第几个（picker 要下标）
function mealRows(form) {
  return MAIN_MEALS.map((t) => {
    const options = timeOptions(t)
    const value = form.mealTimes[t]
    return { mealType: t, word: MEAL_WORDS[t], options, value, index: Math.max(0, options.indexOf(value)) }
  })
}

// 手机上存的（新手三步、导览看过没有、小动物在哪）和这次打开记在内存里的，全清掉
function forgetLocal() {
  try {
    wx.clearStorageSync()
  } catch (e) {
    // 清不掉的本地记录不影响重新开始
  }
  const g = getApp().globalData
  Object.keys(g).forEach((k) => {
    g[k] = null
  })
}

Page({
  data: {
    loading: true,
    isNew: false,
    saving: false,
    form: EMPTY_FORM,
    previewKcal: 0,
    sexOptions: [
      { label: '女', value: 'female' },
      { label: '男', value: 'male' },
    ],
    activityOptions: Object.keys(ACTIVITY_LABELS).map((value) => ({ value, label: ACTIVITY_LABELS[value] })),
    mealRows: mealRows(EMPTY_FORM),
    canReset: false,
    // 亲友看板：我的邀请码、谁在看我的打卡、我关注了几位（utils/family.js 的 mineView）
    family: null,
  },

  // 测试期间才有「从头再来」
  onLoad() {
    api.call('account.info')
      .then((info) => this.setData({ canReset: !!(info && info.canReset) }))
      .catch(() => {})
  },

  onShow() {
    syncTabBar(this)
    this.loadFamily()
    // 正在编辑还没保存时，切回来不覆盖用户填的内容
    if (this.dirty) return
    api.call('profile.get')
      .then((profile) => {
        const form = profile ? pickForm(profile) : { ...EMPTY_FORM }
        this.setData({ loading: false, isNew: !profile, form, previewKcal: previewKcal(form), mealRows: mealRows(form) })
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  update(field, value) {
    this.dirty = true
    const form = { ...this.data.form, [field]: value }
    this.setData({ form, previewKcal: previewKcal(form), mealRows: mealRows(form) })
  },

  onInput(e) {
    this.update(e.currentTarget.dataset.field, e.detail.value)
  },

  onPick(e) {
    const { field, value } = e.currentTarget.dataset
    this.update(field, value)
  },

  // 分段控制器（components/segmented）：哪个字段写在 data-field 上，选的值在 detail.value
  onSegment(e) {
    this.update(e.currentTarget.dataset.field, e.detail.value)
  },

  onMealTime(e) {
    const { mealType } = e.currentTarget.dataset
    const options = timeOptions(mealType)
    const value = options[Number(e.detail.value)]
    if (!value) return
    this.update('mealTimes', { ...this.data.form.mealTimes, [mealType]: value })
  },

  goRemind() {
    wx.navigateTo({ url: '/pages/remind/remind' })
  },

  goWeek() {
    wx.navigateTo({ url: '/pages/week/week?offset=1' })
  },

  goManual() {
    wx.navigateTo({ url: '/pages/manual/manual' })
  },

  // ---- 亲友看板（pages/family）：邀请亲友看我的打卡、谁在看、我关注的亲友 ----
  loadFamily() {
    return api.call('family.mine')
      .then((res) => this.setData({ family: mineView(res) }))
      .catch(() => {})
  },

  // 「邀请亲友看我的打卡」按钮分享出去的卡片带着我的邀请码；右上角菜单里的转发只是普通分享，不带
  onShareAppMessage(res) {
    const code = this.data.family && this.data.family.code
    if (res && res.from === 'button' && code) return shareCard(code)
    return { title: '小暖自律打卡：每顿拍一张，准时吃饭', path: '/pages/today/today' }
  },

  // 移除一位亲友：先问一句；移除后以前发出去的邀请也作废
  removeViewer(e) {
    const { viewer, name } = e.currentTarget.dataset
    wx.showModal({
      title: `不让${name}看了？`,
      content: 'TA 就看不到你的打卡了。以前发出去的邀请也会作废，想再让 TA 看要重新邀请。',
      confirmText: '移除',
      confirmColor: '#d4543c',
      success: (res) => {
        if (!res.confirm) return
        api.call('family.remove', { viewer })
          .then((mine) => {
            this.setData({ family: mineView(mine) })
            wx.showToast({ title: '移除了', icon: 'success' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  goFamily() {
    wx.navigateTo({ url: '/pages/family/family' })
  },

  // 从头再来（测试用）：先问一句，清空云端自己的数据，再清掉手机上存的（新手三步、导览看过没有、小动物在哪），
  // 整个小程序重新打开到首页 → 欢迎页 → 建档……
  startOver() {
    wx.showModal({
      title: '从头再来？',
      content: '会清空你的档案、所有打卡和照片、体重、营地（小动物、暖豆、家具）和提醒，回到第一次打开的样子。清掉就找不回来了。',
      confirmText: '清空',
      confirmColor: '#C82014',
      success: (res) => {
        if (res.confirm) this.reset()
      },
    })
  },

  reset() {
    wx.showLoading({ title: '正在清空', mask: true })
    api.call('account.reset')
      .then(() => {
        wx.hideLoading()
        forgetLocal()
        this.dirty = false
        // 营地页关掉时会把小动物在哪再存一次：重新打开完了再清一遍
        wx.reLaunch({ url: '/pages/today/today', success: forgetLocal })
      })
      .catch((err) => {
        wx.hideLoading()
        api.showError(err)
      })
  },

  save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    api.call('profile.save', this.data.form)
      .then((profile) => {
        this.dirty = false
        const wasNew = this.data.isNew
        const form = pickForm(profile)
        getApp().globalData.mealTimes = mealTimesOf(profile)
        this.setData({ saving: false, isNew: false, form, previewKcal: profile.dailyKcal, mealRows: mealRows(form) })
        wx.showToast({ title: '保存好了', icon: 'success' })
        // 第一次建档：接着设饭点提醒（新手三步的第二步），那页底下「设好了，去拍第一顿」
        if (wasNew) setTimeout(() => wx.navigateTo({ url: '/pages/remind/remind?first=1' }), 800)
      })
      .catch((err) => {
        this.setData({ saving: false })
        api.showError(err)
      })
  },
})
