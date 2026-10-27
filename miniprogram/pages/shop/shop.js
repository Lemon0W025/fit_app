const api = require('../../utils/api')
const { shopGroups } = require('../../utils/camp-view')
const { CATEGORIES, decorById } = require('../../utils/shared/decor')

// 顶上一排标签：全部 + 装饰的几类（单选），选了哪类就只列那一类
const ALL = 'all'
const TAGS = [{ id: ALL, label: '全部' }].concat(CATEGORIES.map((c) => ({ id: c.id, label: c.label })))

Page({
  data: { loaded: false, beans: 0, tags: TAGS, tag: ALL, groups: [], emptyTag: false },

  onShow() {
    api.call('camp.get')
      .then((view) => this.render(view))
      .catch((err) => api.showError(err))
  },

  render(view) {
    this.all = shopGroups(view.decor.owned, view.beans)
    this.setData({ loaded: true, beans: view.beans, ...this.filtered(this.data.tag) })
  },

  // 按标签筛出来的分组；那一类一件都没有就说一声
  filtered(tag) {
    const groups = tag === ALL ? this.all || [] : (this.all || []).filter((g) => g.id === tag)
    return { groups, emptyTag: tag !== ALL && !groups.some((g) => g.items.length) }
  },

  pickTag(e) {
    const { id } = e.currentTarget.dataset
    if (id === this.data.tag || !TAGS.some((t) => t.id === id)) return
    this.setData({ tag: id, ...this.filtered(id) })
  },

  buy(e) {
    const { id } = e.currentTarget.dataset
    const d = decorById(id)
    if (!d || this.buying) return
    this.buying = true
    api.call('camp.buy', { decorId: id })
      .then((view) => {
        this.buying = false
        this.render(view)
        wx.showToast({ title: '买好了，去营地摆上吧', icon: 'none' })
      })
      .catch((err) => {
        this.buying = false
        api.showError(err)
      })
  },

  goCamp() {
    wx.switchTab({ url: '/pages/camp/camp' })
  },
})
