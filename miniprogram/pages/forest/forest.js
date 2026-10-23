const api = require('../../utils/api')
const { beansCard, buildCalendarCells } = require('../../utils/view')

Page({
  data: {
    loaded: false,
    month: '',
    view: null,
    daily: null,
    cells: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
  },

  onShow() {
    this.load(this.data.month)
  },

  load(month) {
    return api.call('forest.get', month ? { month } : {})
      .then((view) => {
        this.setData({
          loaded: true,
          month: view.month,
          view: {
            monthLabel: view.monthLabel,
            prevMonth: view.prevMonth,
            nextMonth: view.nextMonth,
            stats: view.stats,
            totalDays: view.totalDays,
          },
          daily: beansCard(view.today),
          cells: buildCalendarCells(view.days, view.firstWeekday),
        })
      })
      .catch((err) => api.showError(err))
  },

  prevMonth() {
    if (this.data.view && this.data.view.prevMonth) this.load(this.data.view.prevMonth)
  },

  nextMonth() {
    if (this.data.view && this.data.view.nextMonth) this.load(this.data.view.nextMonth)
  },

  openDay(e) {
    const cell = this.data.cells.find((c) => c.key === e.currentTarget.dataset.key)
    if (!cell || cell.blank || cell.future) return
    let content = '这天没有打卡'
    if (cell.mealsCount) {
      content = `打卡 ${cell.mealsCount} 顿 · 约 ${cell.kcal} 千卡`
      if (cell.beans) content += ` · 得了 ${cell.beans} 暖豆`
    }
    wx.showModal({
      title: `${Number(cell.date.slice(5, 7))}月${cell.day}日`,
      content,
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
