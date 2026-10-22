const api = require('../../utils/api')
const { calcDailyKcal, ACTIVITY_LABELS } = require('../../utils/shared/nutrition')

const FIELDS = ['nickname', 'sex', 'age', 'heightCm', 'weightKg', 'targetWeightKg', 'activity', 'avoid']
const NUMBER_FIELDS = ['age', 'heightCm', 'weightKg', 'targetWeightKg']
const EMPTY_FORM = { nickname: '', sex: 'female', age: '', heightCm: '', weightKg: '', targetWeightKg: '', activity: 'light', avoid: '' }

function pickForm(profile) {
  const form = {}
  FIELDS.forEach((k) => {
    form[k] = profile[k] == null ? '' : profile[k]
  })
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

Page({
  data: {
    loading: true,
    isNew: false,
    saving: false,
    form: EMPTY_FORM,
    previewKcal: 0,
    activityOptions: Object.keys(ACTIVITY_LABELS).map((value) => ({ value, label: ACTIVITY_LABELS[value] })),
  },

  onShow() {
    // 正在编辑还没保存时，切回来不覆盖用户填的内容
    if (this.dirty) return
    api.call('profile.get')
      .then((profile) => {
        const form = profile ? pickForm(profile) : { ...EMPTY_FORM }
        this.setData({ loading: false, isNew: !profile, form, previewKcal: previewKcal(form) })
      })
      .catch((err) => {
        this.setData({ loading: false })
        api.showError(err)
      })
  },

  update(field, value) {
    this.dirty = true
    const form = { ...this.data.form, [field]: value }
    this.setData({ form, previewKcal: previewKcal(form) })
  },

  onInput(e) {
    this.update(e.currentTarget.dataset.field, e.detail.value)
  },

  onPick(e) {
    const { field, value } = e.currentTarget.dataset
    this.update(field, value)
  },

  save() {
    if (this.data.saving) return
    this.setData({ saving: true })
    api.call('profile.save', this.data.form)
      .then((profile) => {
        this.dirty = false
        const wasNew = this.data.isNew
        const form = pickForm(profile)
        this.setData({ saving: false, isNew: false, form, previewKcal: profile.dailyKcal })
        wx.showToast({ title: '保存好了', icon: 'success' })
        if (wasNew) setTimeout(() => wx.switchTab({ url: '/pages/today/today' }), 800)
      })
      .catch((err) => {
        this.setData({ saving: false })
        api.showError(err)
      })
  },
})
