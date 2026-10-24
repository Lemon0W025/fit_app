const api = require('../../utils/api')
const { shopGroups } = require('../../utils/camp-view')
const { decorById } = require('../../utils/shared/decor')

Page({
  data: { loaded: false, beans: 0, groups: [] },

  onShow() {
    api.call('camp.get')
      .then((view) => this.render(view))
      .catch((err) => api.showError(err))
  },

  render(view) {
    this.setData({ loaded: true, beans: view.beans, groups: shopGroups(view.decor.owned, view.beans) })
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
