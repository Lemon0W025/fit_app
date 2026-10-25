const api = require('../../utils/api')
const { calcDailyKcal, ACTIVITY_LABELS } = require('../../utils/shared/nutrition')
const { MAIN_MEALS, MEAL_WORDS, DEFAULT_MEAL_TIMES, timeOptions, mealTimesOf } = require('../../utils/shared/timing')

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

Page({
  data: {
    loading: true,
    isNew: false,
    saving: false,
    form: EMPTY_FORM,
    previewKcal: 0,
    activityOptions: Object.keys(ACTIVITY_LABELS).map((value) => ({ value, label: ACTIVITY_LABELS[value] })),
    mealRows: mealRows(EMPTY_FORM),
  },

  onShow() {
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

  onMealTime(e) {
    const { mealType } = e.currentTarget.dataset
    const options = timeOptions(mealType)
    const value = options[Number(e.detail.value)]
    if (!value) return
    this.update('mealTimes', { ...this.data.form.mealTimes, [mealType]: value })
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
        if (wasNew) setTimeout(() => wx.switchTab({ url: '/pages/today/today' }), 800)
      })
      .catch((err) => {
        this.setData({ saving: false })
        api.showError(err)
      })
  },
})
