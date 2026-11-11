const api = require('../../utils/api')
const { foodImage, rarityOf } = require('../../utils/camp-view')
const { foodById } = require('../../utils/shared/foods')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Page({
  data: {
    loaded: false,
    beans: 0,
    spinCost: 30,
    spinMany: 10,
    spinManyCost: 300,
    pityLeft: 10,
    tenSure: true, // 十连里一定有珍稀以上（再扭 pityLeft 次必出，十连扭得到）
    ratesText: '',
    termText: '',
    phase: 'idle', // idle 待扭 / shaking 机器摇晃 / capsule 扭蛋掉出来 / reveal 打开 / many 十连一起开
    result: null,
    results: [], // 十连的结果
    manyText: '',
  },

  // 摇晃动画至少持续这么久，结果回来得再快也要等动画演完（测试里可以设成 0）
  shakeMs: 1200,

  onShow() {
    if (this.data.phase !== 'idle') return
    api.call('camp.get')
      .then((view) => {
        const total = view.rates.reduce((sum, r) => sum + r.weight, 0)
        const termItems = view.term ? view.term.treats.map((id) => foodById(id).name).join('、') : ''
        this.setData({
          loaded: true,
          beans: view.beans,
          spinCost: view.spinCost,
          spinMany: view.spinMany || 10,
          spinManyCost: view.spinManyCost || view.spinCost * 10,
          pityLeft: view.pityLeft,
          tenSure: view.pityLeft <= (view.spinMany || 10),
          ratesText: view.rates.map((r) => `${r.label} ${Math.round((r.weight / total) * 100)}%`).join(' · '),
          termText: termItems ? `${view.term.name}限定点心「${termItems}」出现概率提高` : '',
        })
      })
      .catch((err) => api.showError(err))
  },

  spin() {
    if (!this.canSpin(this.data.spinCost, '暖豆不够啦，再打卡一顿就有了')) return
    this.setData({ phase: 'shaking', result: null })
    Promise.all([api.call('camp.spin'), wait(this.shakeMs)])
      .then(([res]) => {
        this.setData({ phase: 'capsule', beans: res.beans, pityLeft: res.pityLeft, tenSure: res.pityLeft <= this.data.spinMany, result: decorate(res) })
      })
      .catch((err) => {
        this.setData({ phase: 'idle' })
        api.showError(err)
      })
  },

  // 十连：机器摇一会儿，十个一起开（不一个个点扭蛋）
  spinMany() {
    if (!this.canSpin(this.data.spinManyCost, `十连要 ${this.data.spinManyCost} 暖豆，再打几顿卡就有了`)) return
    this.setData({ phase: 'shaking', result: null, results: [] })
    Promise.all([api.call('camp.spinMany'), wait(this.shakeMs)])
      .then(([res]) => {
        const results = res.results.map(decorate)
        this.setData({ phase: 'many', beans: res.beans, pityLeft: res.pityLeft, tenSure: res.pityLeft <= this.data.spinMany, results, manyText: summarize(results) })
      })
      .catch((err) => {
        this.setData({ phase: 'idle' })
        api.showError(err)
      })
  },

  // 能不能扭：没在摇、暖豆够
  canSpin(cost, short) {
    if (['idle', 'reveal', 'many'].indexOf(this.data.phase) === -1) return false
    if (this.data.beans < cost) {
      wx.showToast({ title: `${short}（还差 ${cost - this.data.beans}）`, icon: 'none' })
      return false
    }
    return true
  },

  openCapsule() {
    if (this.data.phase === 'capsule') this.setData({ phase: 'reveal' })
  },

  closeResult() {
    this.setData({ phase: 'idle', result: null, results: [] })
  },

  goCamp() {
    this.setData({ phase: 'idle', result: null, results: [] })
    wx.switchTab({ url: '/pages/camp/camp' })
  },
})

// 一个结果 → 页面上的样子（名字、图、扭蛋壳、稀有度的颜色）
function decorate(res) {
  const item = foodById(res.foodId)
  const rarity = rarityOf(res.rarity)
  return {
    foodId: res.foodId,
    name: item ? item.name : '',
    image: foodImage(res.foodId),
    capsule: `/images/garden/ui/capsule-${rarity.id}.png`,
    rarity: rarity.id,
    rarityLabel: rarity.label,
    rarityColor: rarity.color,
    isNew: !!res.isNew,
  }
}

// 十连的一句总结：「传说 1、珍稀 2、稀有 3，新吃的 2 样」（普通不提）
function summarize(results) {
  const order = ['legendary', 'epic', 'rare']
  const parts = order
    .map((id) => ({ id, n: results.filter((r) => r.rarity === id).length }))
    .filter((p) => p.n > 0)
    .map((p) => `${rarityOf(p.id).label} ${p.n}`)
  const fresh = results.filter((r) => r.isNew).length
  const head = parts.length ? parts.join('、') : '都是普通的'
  return fresh ? `${head}，新吃的 ${fresh} 样` : head
}
