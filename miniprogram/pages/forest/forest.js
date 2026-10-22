const api = require('../../utils/api')
const { treeImage, treeCard, buildForestCells } = require('../../utils/view')
const { celebrateUnlocks } = require('../../utils/celebrate')
const { STAGE_LABELS } = require('../../utils/shared/forest')

Page({
  data: {
    loaded: false,
    month: '',
    view: null,
    today: null,
    cells: [],
    species: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    switching: false,
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
            totalTrees: view.totalTrees,
            nextUnlock: view.nextUnlock,
          },
          today: treeCard(view.today),
          cells: buildForestCells(view.days, view.firstWeekday),
          species: view.species.map((s) => ({
            ...s,
            image: treeImage('fruit', s.id),
            current: s.id === view.currentSpecies,
            lockText: s.unlocked ? '' : `种满 ${s.unlockAt} 棵`,
          })),
        })
        celebrateUnlocks(view.today.newlyUnlocked)
      })
      .catch((err) => api.showError(err))
  },

  prevMonth() {
    if (this.data.view && this.data.view.prevMonth) this.load(this.data.view.prevMonth)
  },

  nextMonth() {
    if (this.data.view && this.data.view.nextMonth) this.load(this.data.view.nextMonth)
  },

  pickSpecies(e) {
    const s = this.data.species.find((x) => x.id === e.currentTarget.dataset.id)
    if (!s || s.current || this.data.switching) return
    if (!s.unlocked) {
      wx.showToast({ title: `再种 ${s.unlockAt - this.data.view.totalTrees} 棵树就能解锁${s.name}`, icon: 'none' })
      return
    }
    this.setData({ switching: true })
    api.call('forest.setSpecies', { species: s.id })
      .then(() => {
        this.setData({ switching: false })
        wx.showToast({ title: `换成${s.name}啦`, icon: 'none' })
        return this.load(this.data.month)
      })
      .catch((err) => {
        this.setData({ switching: false })
        api.showError(err)
      })
  },

  openDay(e) {
    const cell = this.data.cells.find((c) => c.key === e.currentTarget.dataset.key)
    if (!cell || cell.blank || cell.future) return
    let content = '这天没有打卡'
    if (cell.stage === 'empty' && cell.mealsCount) content = `只打卡了加餐，没种树 · 约 ${cell.kcal} 千卡`
    else if (cell.mealsCount) content = `${STAGE_LABELS[cell.stage]} · 打卡 ${cell.mealsCount} 顿 · 约 ${cell.kcal} 千卡`
    wx.showModal({
      title: `${Number(cell.date.slice(5, 7))}月${cell.day}日`,
      content,
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
