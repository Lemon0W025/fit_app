const api = require('../../utils/api')
const config = require('../../config')
const V = require('../../utils/camp-view')
const { createLife } = require('../../utils/camp-life')
const { fxViews } = require('../../utils/scene-fx')
const { beansCard } = require('../../utils/view')
const { petById } = require('../../utils/shared/pets')
const { foodById } = require('../../utils/shared/foods')
const { decorById, placeProblem } = require('../../utils/shared/decor')
const SHEETS = require('../../utils/anim-sheets')

const DOUBLE_TAP_MS = 300
const HOUR_CHECK_MS = 60000

function windowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

function capsule() {
  try {
    return wx.getMenuButtonBoundingClientRect()
  } catch (e) {
    return null
  }
}

Page({
  data: {
    loaded: false,
    beans: 0,
    canSpin: false,
    daily: null,
    hud: { top: 28, height: 32, below: 72 },
    world: null,
    view: { x: 0, y: 0, scale: 1 },
    backdrop: '/images/camp/base/backdrop.jpg',
    base: [],
    decor: [],
    pets: [],
    bowls: [],
    fx: [],
    cuts: [],
    tint: '',
    peekText: '',
    termText: '',
    mode: 'view',
    selectedName: '',
    drag: null,
    bagOpen: false,
    bagTab: 'food',
    foodBag: [],
    decorBag: [],
    bagCount: 0,
    residents: [],
    residentsOpen: false,
    giftReady: false,
    giftShown: false,
    welcome: null,
    celebrate: false,
  },

  onLoad() {
    this.badSheets = new Set()
    const rect = capsule()
    if (rect && rect.height) this.setData({ hud: { top: rect.top, height: rect.height, below: rect.bottom + 12 } })
  },

  onShow() {
    this.cancel()
    this.load()
  },

  onHide() {
    this.stopLife()
  },

  onUnload() {
    this.stopLife()
  },

  win() {
    const info = windowInfo()
    return { width: info.windowWidth || 375, height: info.windowHeight || 667 }
  },

  nowHour() {
    return this.hour ? this.hour() : new Date().getHours()
  },

  load() {
    return api.call('camp.get', { markSeen: true })
      .then((view) => {
        if (!view.hasProfile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.render(view, true)
        // 打卡成功回来：全员庆祝
        const app = getApp()
        if (app && app.globalData && app.globalData.celebrate) {
          app.globalData.celebrate = false
          if (this.life) this.life.celebrate()
        }
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const win = this.win()
    if (!this.L) this.L = V.campLayout(win)
    const L = this.L
    this.camp = view
    const foodBag = V.foodBag(view.foods)
    const decorBag = V.decorBag(view.decor.unplaced)
    const peeking = view.bowls.map((b) => b.peeking).filter(Boolean).map((id) => petById(id).name)
    const treats = view.term && view.term.treats.length ? view.term.treats.map((id) => foodById(id).name).join('、') : ''
    if (view.daily !== undefined) this.potLevel = V.potLevel(view.daily)
    const potLevel = this.potLevel || 0
    const night = V.isNight(this.nowHour())
    if (!this.data.base.length || this.baseNight !== night) this.baseNight = night
    const patch = {
      loaded: true,
      beans: view.beans,
      canSpin: view.beans >= view.spinCost,
      world: { width: L.width, height: L.height, viewWidth: L.viewWidth, viewHeight: L.viewHeight, margin: L.margin },
      backdrop: V.backdropImage(night),
      base: this.data.base.length && this.data.base[0].image.indexOf(night ? 'night-t00' : '/t00') !== -1 ? this.data.base : V.baseTiles(L, this.baseFailed ? '' : config.campArt || '', night),
      decor: V.decorViews(view.decor.placed, L, config.decorArt || '', night),
      bowls: V.bowlViews(view.bowls, L, night, this.cutBase()),
      fx: fxViews(L, this.nowHour(), view.decor.placed, potLevel, this.cutBase()),
      cuts: V.cutoutViews(L, potLevel, this.cutBase(), night),
      tint: V.tintFor(this.nowHour()),
      peekText: peeking.length ? `👀 ${peeking.join('、')}在树林边张望…下次打卡就来了` : '',
      termText: treats ? `${view.term.name}限定点心「${treats}」正在扭蛋机里` : '',
      foodBag,
      decorBag,
      bagCount: foodBag.reduce((s, f) => s + f.count, 0) + decorBag.reduce((s, d) => s + d.count, 0),
      giftReady: view.giftReady,
      welcome: view.welcome || this.data.welcome,
    }
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    if (!this.centered) {
      patch.view = V.homeView(L, win)
      this.centered = true
    }
    this.setData(patch)
    this.syncLife(view, fresh)
    if (!this.hourTimer) this.watchHour()
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，扭蛋、买装饰随便试试`, showCancel: false, confirmText: '好的' })
    }
    if (view.giftReady && !this.data.giftShown && this.life) this.offerGift(view)
  },

  // movable-view 只在值变了才动：每次换一点点不同的小数
  nudgeView(offset) {
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: offset.x + d, y: offset.y + d, scale: offset.scale + d / 100 } })
  },

  recenter() {
    this.nudgeView(V.homeView(this.L, this.win()))
  },

  // 云端高清切块加载失败：不再铺切块，只剩包里的垫图（整张画的低清版）
  onBaseError() {
    if (this.baseFailed || !this.data.base.length) return
    this.baseFailed = true
    this.setData({ base: [] })
  },

  // 帐篷 / 锅的抠图层和火苗逐帧图的前缀；云存储的图加载失败过一次就一直用包里的
  cutBase() {
    return this.cutFailed ? '' : config.cutArt || ''
  },

  onCutError() {
    if (this.cutFailed || !config.cutArt) return
    this.cutFailed = true
    const placed = this.camp ? this.camp.decor.placed : []
    this.setData({
      cuts: V.cutoutViews(this.L, this.potLevel || 0, '', this.baseNight),
      fx: fxViews(this.L, this.nowHour(), placed, this.potLevel || 0, ''),
      bowls: V.bowlViews(this.camp ? this.camp.bowls : [], this.L, this.baseNight, ''),
    })
  },

  onDecorError() {
    if (!config.decorArt || !this.camp) return
    this.setData({ decor: V.decorViews(this.camp.decor.placed, this.L, '', this.baseNight) })
  },

  onAnimError(e) {
    const { id } = e.currentTarget.dataset
    if (!id || this.badSheets.has(id)) return
    this.badSheets.add(id)
    if (this.life) this.life.noSheet(id)
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },

  // ---------------------------------------------------------------- 宠物

  syncLife(view, fresh) {
    if (this.life && !fresh) {
      this.life.updateDecor(view.decor.placed)
      return
    }
    this.stopLife()
    this.life = createLife({
      L: this.L,
      pets: view.pets,
      decor: view.decor.placed,
      arrivals: view.arrivals || [],
      hour: this.hour || undefined,
      clock: this.clock || undefined,
      random: this.random || undefined,
      sheets: SHEETS,
      animBase: config.animArt || '',
      bad: this.badSheets,
      onChange: (i, sprite) => this.setData({ [`pets[${i}]`]: sprite }),
    })
    this.setData({ pets: this.life.sprites() })
    if (this.data.mode === 'view') this.life.start()
  },

  stopLife() {
    if (this.life) this.life.stop()
    this.life = null
    this.stopWatchHour()
  },

  // 页面一直开着跨过 6 / 17 / 19 点：换日景 / 夜景整套、傍晚的色调（宠物自己每走一步就按新钟点上色，画也要跟上）
  watchHour() {
    const clock = this.clock || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
    this.stopWatchHour()
    this.hourTimer = clock.set(() => {
      this.hourTimer = null
      const h = this.nowHour()
      if (this.camp && (V.isNight(h) !== this.baseNight || V.tintFor(h) !== this.data.tint)) this.render(this.camp)
      this.watchHour()
    }, HOUR_CHECK_MS)
  },

  stopWatchHour() {
    if (!this.hourTimer) return
    const clock = this.clock || { clear: (h) => clearTimeout(h) }
    clock.clear(this.hourTimer)
    this.hourTimer = null
  },

  // 点一下说话；300ms 内再点一下是连点（打滚）
  tapPet(e) {
    if (!this.life || this.data.mode !== 'view') return
    const index = e.currentTarget.dataset.index
    const now = Date.now()
    if (this.lastTap && this.lastTap.index === index && now - this.lastTap.at < DOUBLE_TAP_MS) {
      this.lastTap = null
      this.life.doubleTap(index)
      return
    }
    this.lastTap = { index, at: now }
    this.life.tap(index)
    const sprite = this.data.pets[index]
    if (sprite && sprite.action === 'gift') this.takeGift()
  },

  pressPet(e) {
    if (!this.life || this.data.mode !== 'view') return
    this.life.longPress(e.currentTarget.dataset.index)
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
  },

  // ---------------------------------------------------------------- 礼物

  // 4 级以上的住户里挑一只在场的（这会儿不在营地的不算），叼着礼物走到篝火边
  offerGift(view) {
    const givers = view.pets.filter((p) => p.level >= 4).map((p) => p.id)
    const here = this.life.whereIs().filter((w) => givers.indexOf(w.id) !== -1)
    for (const w of here) {
      if (this.life.gift(w.index)) {
        this.giftPet = w.id
        this.setData({ giftShown: true })
        return
      }
    }
  },

  takeGift() {
    if (this.taking) return
    this.taking = true
    api.call('camp.gift', this.giftPet ? { petId: this.giftPet } : {})
      .then((view) => {
        this.taking = false
        const g = view.gift
        const text = g.beans ? `${petById(g.petId).name}叼来了 ${g.beans} 颗暖豆！` : `${petById(g.petId).name}叼来了一份${foodById(g.foodId).name}！`
        wx.showToast({ title: text, icon: 'none', duration: 2500 })
        if (this.life) this.life.giftTaken()
        this.render(view)
      })
      .catch((err) => {
        this.taking = false
        if (this.life) this.life.giftTaken()
        api.showError(err)
      })
  },

  // ---------------------------------------------------------------- 背包、食盆

  openBag() {
    this.setData({ bagOpen: true })
  },

  closeBag() {
    this.setData({ bagOpen: false })
  },

  switchBag(e) {
    this.setData({ bagTab: e.currentTarget.dataset.tab })
  },

  pickFood(e) {
    const { id } = e.currentTarget.dataset
    const f = foodById(id)
    this.selected = { type: 'feed', foodId: id }
    this.setData({ bagOpen: false, mode: 'feed', selectedName: f ? f.name : '' })
    if (this.life) this.life.pause()
    this.queryWorldRect()
  },

  pickDecor(e) {
    const { id } = e.currentTarget.dataset
    const d = decorById(id)
    this.selected = { type: 'place', decorId: id }
    this.setData({ bagOpen: false, mode: 'place', selectedName: d ? d.name : '' })
    if (this.life) this.life.pause()
    this.queryWorldRect()
  },

  tapBowl(e) {
    if (this.data.mode !== 'view') return
    const index = e.currentTarget.dataset.index
    const bowl = this.camp.bowls[index]
    if (!bowl.food) {
      if (!this.data.foodBag.length) {
        wx.showToast({ title: '背包里没有吃的，去扭蛋机抽一个吧', icon: 'none' })
        return
      }
      this.setData({ bagOpen: true, bagTab: 'food' })
      return
    }
    const name = foodById(bowl.food).name
    wx.showModal({
      title: '食盆',
      content: bowl.peeking ? `${name}放着呢，${petById(bowl.peeking).name}在树林边张望。拿回背包吗？` : `${name}放着呢，暂时没有小动物来吃。拿回背包吗？`,
      confirmText: '拿回来',
      success: (res) => {
        if (res.confirm) this.save('camp.takeFood', { bowl: index })
      },
    })
  },

  // ---------------------------------------------------------------- 装饰：摆、挪、收

  liftDecor(e) {
    if (this.data.mode !== 'view') return
    const uid = e.currentTarget.dataset.uid
    const d = this.data.decor.find((x) => x.uid === uid)
    if (!d) return
    this.startMove(d)
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
  },

  tapDecor(e) {
    if (this.data.mode !== 'view') return
    const uid = e.currentTarget.dataset.uid
    const d = this.data.decor.find((x) => x.uid === uid)
    if (!d) return
    wx.showActionSheet({
      itemList: ['挪个地方', '收回背包'],
      success: (res) => {
        if (res.tapIndex === 0) this.startMove(d)
        else if (res.tapIndex === 1) this.save('camp.stash', { uid }, `${d.name}收进背包了`)
      },
    })
  },

  startMove(d) {
    this.selected = { type: 'move', uid: d.uid, decorId: d.id }
    this.setData({ mode: 'move', selectedName: d.name })
    if (this.life) this.life.pause()
    this.queryWorldRect()
  },

  queryWorldRect(cb) {
    wx.createSelectorQuery()
      .select('#world')
      .boundingClientRect()
      .exec((res) => {
        if (res && res[0]) this.worldRect = res[0]
        if (cb) cb()
      })
  },

  onDragStart(e) {
    const t = e.touches && e.touches[0]
    if (!t || !this.selected) return
    this.queryWorldRect(() => this.updateDrag(t.clientX, t.clientY))
  },

  onDragMove(e) {
    const t = e.touches && e.touches[0]
    if (!t || !this.selected) return
    this.updateDrag(t.clientX, t.clientY)
  },

  onDragEnd(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
    this.setData({ drag: null })
    if (!t || !this.selected || !this.worldRect) return
    const p = V.fromTouch(t.clientX, t.clientY, this.worldRect, this.L)
    if (this.selected.type === 'feed') this.feedAt(p)
    else this.placeAt(p)
  },

  updateDrag(x, y) {
    const sel = this.selected
    if (!sel || !this.worldRect) return
    const p = V.fromTouch(x, y, this.worldRect, this.L)
    if (sel.type === 'feed') {
      const size = 56
      this.setData({ drag: { image: V.foodImage(sel.foodId), left: p.x * this.L.k - size / 2, top: p.y * this.L.k - size * 1.6, width: size, height: size, ok: !!this.hitTarget(p), foot: null } })
      return
    }
    const problem = placeProblem(this.camp.decor.placed, sel.decorId, p.x, p.y, sel.type === 'move' ? sel.uid : undefined)
    this.setData({ drag: V.ghostView(sel.decorId, p.x, p.y, this.L, !problem) })
  },

  // 松手时手指在谁身上：宠物（外框）或食盆
  hitTarget(p) {
    const L = this.L
    const px = p.x * L.k
    const py = p.y * L.k
    const pets = this.data.pets
    for (let i = pets.length - 1; i >= 0; i--) {
      const s = pets[i]
      if (s.hidden) continue
      const top = L.height - s.bottom - s.width
      if (px >= s.left && px <= s.left + s.width && py >= top && py <= L.height - s.bottom) return { pet: i }
    }
    for (const b of this.data.bowls) {
      if (px >= b.left && px <= b.left + b.width && py >= b.top && py <= b.top + b.height) return { bowl: b.index }
    }
    return null
  },

  feedAt(p) {
    const sel = this.selected
    const hit = this.hitTarget(p)
    if (!hit) {
      wx.showToast({ title: '拖到小动物或者食盆上松手', icon: 'none' })
      return
    }
    if (hit.bowl !== undefined) {
      this.save('camp.putFood', { bowl: hit.bowl, foodId: sel.foodId })
      return
    }
    const sprite = this.data.pets[hit.pet]
    const index = hit.pet
    api.call('camp.feed', { petId: sprite.id, foodId: sel.foodId })
      .then((view) => {
        this.cancel()
        if (this.life) this.life.feed(index, sel.foodId, view.liked)
        this.render(view)
        wx.showToast({ title: view.liked ? `${sprite.name}吃得很开心，亲密 +${view.gain}` : `${sprite.name}不太爱吃，亲密 +${view.gain}`, icon: 'none' })
      })
      .catch((err) => api.showError(err))
  },

  placeAt(p) {
    const sel = this.selected
    const problem = placeProblem(this.camp.decor.placed, sel.decorId, p.x, p.y, sel.type === 'move' ? sel.uid : undefined)
    if (problem) {
      wx.showToast({ title: problem, icon: 'none' })
      return
    }
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (sel.type === 'place') this.save('camp.place', { decorId: sel.decorId, x, y })
    else this.save('camp.move', { uid: sel.uid, x, y })
  },

  save(action, data, toast) {
    if (this.saving) return
    this.saving = true
    api.call(action, data)
      .then((view) => {
        this.saving = false
        this.cancel()
        this.render(view)
        if (toast) wx.showToast({ title: toast, icon: 'none' })
      })
      .catch((err) => {
        this.saving = false
        api.showError(err)
      })
  },

  cancel() {
    this.selected = null
    this.setData({ mode: 'view', selectedName: '', drag: null })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 找它

  openResidents() {
    const residents = this.life ? this.life.whereIs() : []
    this.setData({ residents, residentsOpen: true })
  },

  closeResidents() {
    this.setData({ residentsOpen: false })
  },

  findResident(e) {
    const { index } = e.currentTarget.dataset
    const at = this.life ? this.life.focus(index) : null
    this.setData({ residentsOpen: false })
    if (at) this.nudgeView(V.focusOffset(at.x, at.y, this.L, this.win(), 1.6))
  },

  // ---------------------------------------------------------------- 跳转

  closeWelcome() {
    this.setData({ welcome: null })
  },

  noop() {},

  goGacha() {
    this.setData({ welcome: null })
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop/shop' })
  },

  goAlbum() {
    wx.navigateTo({ url: '/pages/album/album' })
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
  },
})
