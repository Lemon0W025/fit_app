const api = require('../../utils/api')
const { MEAL_ORDER, MEAL_LABELS, guessMealType } = require('../../utils/shared/meal-types')
const { localHour } = require('../../utils/shared/date')

Page({
  data: {
    mealTypes: MEAL_ORDER.map((value) => ({ value, label: MEAL_LABELS[value] })),
    mealType: 'lunch',
    photo: '',
    note: '',
    submitting: false,
    stage: '',
  },

  onLoad() {
    this.setData({ mealType: guessMealType(localHour()) })
  },

  pickMealType(e) {
    this.setData({ mealType: e.currentTarget.dataset.value })
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      camera: 'back',
      success: (res) => this.setData({ photo: res.tempFiles[0].tempFilePath }),
      fail: (err) => {
        if (!/cancel/.test((err && err.errMsg) || '')) api.showError(new Error('没能打开相机或相册，请检查微信的权限设置'))
      },
    })
  },

  previewPhoto() {
    wx.previewImage({ urls: [this.data.photo] })
  },

  removePhoto() {
    this.setData({ photo: '' })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
  },

  submit() {
    const { photo, note, mealType, submitting } = this.data
    if (submitting) return
    if (!photo && !note.trim()) {
      wx.showToast({ title: '拍张照片或写几句吧', icon: 'none' })
      return
    }

    this.setData({ submitting: true, stage: photo ? '正在上传照片…' : '小暖正在看…' })
    const upload = photo ? api.uploadMealPhoto(photo) : Promise.resolve('')
    upload
      .then((fileID) => {
        this.setData({ stage: '小暖正在仔细看你的饭菜…' })
        return api.call('meal.analyze', { fileID, mealType, note })
      })
      .then((meal) => {
        getApp().globalData.lastTree = { mealId: meal._id, tree: meal.tree, arrival: meal.arrival }
        wx.redirectTo({ url: `/pages/meal/meal?id=${meal._id}` })
      })
      .catch((err) => {
        this.setData({ submitting: false, stage: '' })
        api.showError(err)
      })
  },
})
