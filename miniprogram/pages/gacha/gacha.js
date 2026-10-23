const api = require('../../utils/api')
const { itemImage, rarityOf } = require('../../utils/garden-view')
const { itemById } = require('../../utils/shared/garden')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Page({
  data: {
    loaded: false,
    beans: 0,
    spinCost: 30,
    pityLeft: 10,
    ratesText: '',
    termText: '',
    phase: 'idle', // idle 待扭 / shaking 机器摇晃 / capsule 扭蛋掉出来 / reveal 打开
    result: null,
  },

  // 摇晃动画至少持续这么久，结果回来得再快也要等动画演完（测试里可以设成 0）
  shakeMs: 1200,

  onShow() {
    if (this.data.phase !== 'idle') return
    api.call('garden.get')
      .then((view) => {
        const total = view.rates.reduce((sum, r) => sum + r.weight, 0)
        const termItems = view.term ? view.term.items.map((id) => itemById(id).name).join('、') : ''
        this.setData({
          loaded: true,
          beans: view.beans,
          spinCost: view.spinCost,
          pityLeft: view.pityLeft,
          ratesText: view.rates.map((r) => `${r.label} ${Math.round((r.weight / total) * 100)}%`).join(' · '),
          termText: termItems ? `${view.term.name}限定「${termItems}」出现概率提高` : '',
        })
      })
      .catch((err) => api.showError(err))
  },

  spin() {
    if (this.data.phase !== 'idle' && this.data.phase !== 'reveal') return
    if (this.data.beans < this.data.spinCost) {
      wx.showToast({ title: '暖豆不够啦，再打卡一顿就有了', icon: 'none' })
      return
    }
    this.setData({ phase: 'shaking', result: null })
    Promise.all([api.call('garden.spin'), wait(this.shakeMs)])
      .then(([res]) => {
        const item = itemById(res.itemId)
        const rarity = rarityOf(res.rarity)
        this.setData({
          phase: 'capsule',
          beans: res.beans,
          pityLeft: res.pityLeft,
          result: {
            itemId: res.itemId,
            name: item ? item.name : '',
            image: itemImage(res.itemId),
            capsule: `/images/garden/ui/capsule-${rarity.id}.png`,
            rarity: rarity.id,
            rarityLabel: rarity.label,
            rarityColor: rarity.color,
            isNew: res.isNew,
          },
        })
      })
      .catch((err) => {
        this.setData({ phase: 'idle' })
        api.showError(err)
      })
  },

  openCapsule() {
    if (this.data.phase === 'capsule') this.setData({ phase: 'reveal' })
  },

  closeResult() {
    this.setData({ phase: 'idle', result: null })
  },

  goPlace() {
    this.setData({ phase: 'idle', result: null })
    wx.switchTab({ url: '/pages/garden/garden' })
  },
})
