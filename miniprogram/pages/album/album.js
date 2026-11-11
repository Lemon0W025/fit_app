const api = require('../../utils/api')
const { petImage, petFace, foodImage, decorImage, rarityOf, starText, goalText } = require('../../utils/camp-view')
const { SOLAR_TERMS } = require('../../utils/shared/garden')

const termName = (key) => ((SOLAR_TERMS.find((t) => t.key === key) || {}).name || '')

Page({
  data: { loaded: false, pages: [], current: 0, progress: '', full: false },

  onShow() {
    api.call('camp.album')
      .then((a) => {
        const pets = a.pets.map((p) => ({
          kind: 'pet', key: p.id, ...p,
          image: p.home ? petImage(p.id) : petFace(p.id),
          sinceText: p.since ? `${p.since} 搬来` : '',
          foodsText: p.foods ? `爱吃：${p.foods.join('、')}` : '',
          levelText: p.home ? (p.next ? `亲密 ${p.level} 级，再喂 ${p.next - p.fed} 顿升级` : '亲密 5 级，已经是家人了') : '',
          // 满级之后：每再喂 30 顿多一颗星（云函数还是老版本、没给 stars 的时候不显示）
          starRow: p.home && !p.next && p.stars !== undefined ? starText(p.stars) : '',
          starHint: p.home && !p.next && p.stars !== undefined ? (p.nextStar ? `再喂 ${p.nextStar - p.fed} 顿，多一颗星` : '五颗星集齐啦') : '',
        }))
        const foods = a.foods.map((f) => ({ ...f, image: foodImage(f.id), rarityLabel: rarityOf(f.rarity).label, rarityColor: rarityOf(f.rarity).color, termName: f.term ? termName(f.term) : '' }))
        const decor = a.decor.map((d) => ({ ...d, image: decorImage(d.id) }))
        // 12 只都到齐了封面换成全家福
        const cover = { kind: 'cover', key: 'cover', progress: a.progress, goalText: goalText(a.progress, a.goal), full: a.full, image: a.full ? '/images/camp/family.jpg' : '/images/garden/ui/book.png' }
        const pages = [cover].concat(pets, [{ kind: 'foods', key: 'foods', foods }, { kind: 'decor', key: 'decor', decor }])
        this.setData({ loaded: true, pages, progress: `${a.progress.pets} / ${a.progress.total}`, full: a.full })
      })
      .catch((err) => api.showError(err))
  },

  onSwipe(e) {
    this.setData({ current: e.detail.current })
  },

  goGacha() {
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },
})
