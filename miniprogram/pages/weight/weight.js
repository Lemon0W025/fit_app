const api = require('../../utils/api')
const { computeChart, drawChart } = require('../../utils/chart')
const { round1 } = require('../../utils/shared/nutrition')
const { dateKey } = require('../../utils/shared/date')

const CHART_PADDING = 24
const CHART_COLORS = { line: '#4E7D5B', grid: '#ECE4D6', text: '#7A7166', target: '#C98A14' }

function shortDate(key) {
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`
}

function changeText(items) {
  if (items.length < 2) return ''
  const first = items[0]
  const diff = round1(items[items.length - 1].weightKg - first.weightKg)
  if (diff < 0) return `比 ${shortDate(first.date)} 轻了 ${-diff} kg，继续加油 👏`
  if (diff > 0) return `比 ${shortDate(first.date)} 重了 ${diff} kg，别灰心，慢慢来`
  return `和 ${shortDate(first.date)} 持平`
}

function targetText(latest, target) {
  if (!latest || !target) return ''
  const gap = round1(latest.weightKg - target)
  return gap > 0 ? `距离目标 ${target} kg 还差 ${gap} kg` : `已经达到目标 ${target} kg 啦 🎉`
}

Page({
  data: {
    input: '',
    saving: false,
    loaded: false,
    items: [],
    recent: [],
    latest: null,
    todayRecorded: false,
    changeText: '',
    targetText: '',
    budgetText: '',
  },

  onShow() {
    this.load()
  },

  load() {
    return api.call('weight.list', { limit: 30 })
      .then(({ items, targetWeightKg }) => {
        this.target = targetWeightKg
        const latest = items.length ? items[items.length - 1] : null
        this.setData({
          loaded: true,
          items,
          recent: items.slice(-7).reverse(),
          latest,
          todayRecorded: !!latest && latest.date === dateKey(),
          changeText: changeText(items),
          targetText: targetText(latest, targetWeightKg),
        }, () => this.drawChart())
      })
      .catch((err) => api.showError(err))
  },

  drawChart() {
    const values = this.data.items.map((i) => i.weightKg)
    if (!values.length) return
    wx.createSelectorQuery()
      .select('#chart')
      .fields({ node: true, size: true })
      .exec((res) => {
        const box = res && res[0]
        if (!box || !box.node) return
        const canvas = box.node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio
        canvas.width = box.width * dpr
        canvas.height = box.height * dpr
        ctx.scale(dpr, dpr)
        const size = { width: box.width, height: box.height, padding: CHART_PADDING }
        const chart = computeChart(values, { ...size, target: this.target })
        drawChart(ctx, chart, { ...size, colors: CHART_COLORS })
      })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  save() {
    if (this.data.saving) return
    const value = Number(this.data.input)
    if (!this.data.input || !isFinite(value)) {
      wx.showToast({ title: '先填一下体重', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    api.call('weight.save', { weightKg: value })
      .then((res) => {
        this.setData({
          saving: false,
          input: '',
          budgetText: res.dailyKcal ? `每日热量预算已调整为 ${res.dailyKcal} 千卡` : '',
        })
        wx.showToast({ title: '记好了', icon: 'success' })
        return this.load()
      })
      .catch((err) => {
        this.setData({ saving: false })
        api.showError(err)
      })
  },
})
