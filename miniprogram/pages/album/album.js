const api = require('../../utils/api')
const { petImage, petFace, foodImage, decorImage, rarityOf, starText, goalText, stayText } = require('../../utils/camp-view')
const { SOLAR_TERMS } = require('../../utils/shared/garden')

const termName = (key) => ((SOLAR_TERMS.find((t) => t.key === key) || {}).name || '')

// 宠物那一页的亲密度：「亲密 2 级，再喂 3 顿升级；再喂 11 顿就住下」/「亲密 5 级，再喂 9 顿就住下」/「亲密 5 级，已经是家人了」
function levelText(p) {
  const stay = stayText(p)
  if (p.next) return `亲密 ${p.level} 级，再喂 ${p.next - p.fed} 顿升级${stay ? `；${stay}` : ''}`
  return stay ? `亲密 ${p.level} 级，${stay}` : `亲密 ${p.level} 级，已经是家人了`
}

Page({
  data: { loaded: false, pages: [], current: 0, progress: '', full: false },

  onShow() {
    api.call('camp.album')
      .then((a) => {
        const pets = a.pets.map((p) => ({
          kind: 'pet', key: p.id, ...p,
          image: p.met ? petImage(p.id) : petFace(p.id),
          sinceText: p.since ? `${p.since} 第一次来` : '',
          foodsText: p.foods ? `爱吃：${p.foods.join('、')}` : '',
          homeText: p.met ? (p.home ? '🏠 住下了' : p.here ? '常客，这会儿在营地' : '常客，这会儿不在') : '',
          // 常客多写一句还要喂几顿住下（按稀有度：普通 15、稀有 25、珍稀 40、传说 60 顿；珍稀、传说到了 5 级还没住下）
          levelText: p.met ? levelText(p) : '',
          // 满级之后：每再喂 30 顿多一颗星（云函数还是老版本、没给 stars 的时候不显示）
          starRow: p.met && !p.next && p.stars !== undefined ? starText(p.stars) : '',
          starHint: p.met && !p.next && p.stars !== undefined ? (p.nextStar ? `再喂 ${p.nextStar - p.fed} 顿，多一颗星` : '五颗星集齐啦') : '',
        }))
        const foods = a.foods.map((f) => ({ ...f, image: foodImage(f.id), rarityLabel: rarityOf(f.rarity).label, rarityColor: rarityOf(f.rarity).color, termName: f.term ? termName(f.term) : '' }))
        const decor = a.decor.map((d) => ({ ...d, image: decorImage(d.id) }))
        // 12 只都到齐了封面换成全家福
        const cover = { kind: 'cover', key: 'cover', progress: a.progress, goalText: goalText(a.progress.home, a.goal), full: a.full, image: a.full ? '/images/camp/family.jpg' : '/images/garden/ui/book.png' }
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
