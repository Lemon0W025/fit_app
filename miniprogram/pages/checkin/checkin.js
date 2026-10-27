const api = require('../../utils/api')
const { MEAL_ORDER, MEAL_LABELS, guessMealType, isMealType } = require('../../utils/shared/meal-types')
const { localHour } = require('../../utils/shared/date')
const { MEAL_WORDS, mealTimesOf, mealAt, timingFor, windowText } = require('../../utils/shared/timing')
const { clockOf } = require('../../utils/fx')
const { analysisSteps } = require('../../utils/view')

// 认菜和算热量是同一次调用：认菜这步走 6 秒后把「算热量」点亮，让等的人知道还在往前走
const COUNT_AFTER_MS = 6000

Page({
  data: {
    mealTypes: MEAL_ORDER.map((value) => ({ value, label: MEAL_LABELS[value] })),
    mealType: 'lunch',
    photo: '',
    note: '',
    submitting: false,
    stage: '',
    steps: [],
    timingText: '',
    timingOn: false,
  },

  // 首页大卡带着餐次进来就用它；不然按饭点窗口猜，都不在窗口里按钟点猜
  onLoad(options) {
    this.times = getApp().globalData.mealTimes || mealTimesOf(null)
    const want = options && options.mealType
    const mealType = isMealType(want) ? want : mealAt(this.times, new Date()) || guessMealType(localHour())
    this.setData({ mealType })
    this.updateTiming()
  },

  // 分段控制器（components/segmented）选了哪一餐
  pickMealType(e) {
    this.setData({ mealType: e.detail.value })
    this.updateTiming()
  },

  // 餐次下面那句：现在拍这顿算不算准时（加餐不说）
  updateTiming() {
    const { mealType } = this.data
    const timing = timingFor(mealType, new Date(), this.times)
    const word = MEAL_WORDS[mealType]
    let text = ''
    if (timing === 'on') text = `现在拍${word}：准时 ✓`
    else if (timing === 'early') text = `还没到${word}时间（${windowText(mealType, this.times)}），提前拍也算数`
    else if (timing === 'late') text = `现在不在${word}时间，补拍也算数`
    this.setData({ timingText: text, timingOn: timing === 'on' })
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

    const hasPhoto = !!photo
    this.setData({ submitting: true, stage: photo ? '正在上传照片…' : '小暖正在看…', steps: analysisSteps(hasPhoto, 0) })
    const upload = photo ? api.uploadMealPhoto(photo) : Promise.resolve('')
    upload
      .then((fileID) => {
        const look = hasPhoto ? 1 : 0
        this.setData({ stage: '小暖正在仔细看你的饭菜…', steps: analysisSteps(hasPhoto, look) })
        this.stepTimer = clockOf(this).set(() => {
          this.stepTimer = null
          this.setData({ steps: analysisSteps(hasPhoto, look + 1) })
        }, COUNT_AFTER_MS)
        return api.call('meal.analyze', { fileID, mealType, note })
      })
      .then((meal) => {
        this.stopSteps()
        getApp().globalData.lastGain = { mealId: meal._id, gain: meal.gain, arrival: meal.arrival }
        // 正餐打卡成功：回营地时全员到篝火边庆祝
        if (meal.gain) getApp().globalData.celebrate = true
        wx.redirectTo({ url: `/pages/meal/meal?id=${meal._id}` })
      })
      .catch((err) => {
        this.stopSteps()
        this.setData({ submitting: false, stage: '' })
        api.showError(err)
      })
  },

  stopSteps() {
    if (!this.stepTimer) return
    clockOf(this).clear(this.stepTimer)
    this.stepTimer = null
  },

  onUnload() {
    this.stopSteps()
  },
})
