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
const VIEW_SETTLE_MS = 300 // 第一次进来排好版后再对准一次篝火
const ZOOM_SETTLE_MS = 550 // 缩回 1 倍的弹簧动画大约这么久，缩完再平移
const SPOTS_KEY = 'campSpots' // 离开营地时小动物各自在哪（本地存储，重开小程序也在原地）
// 点家具「叫一只来……」叫不来的时候说什么（camp-life 的 callTo）
const CALL_FAILS = { busy: '上面已经有小家伙了', asleep: '大家都睡着了，等会儿再叫', far: '它们过不去，挪个地方试试', none: '这个没什么好玩的' }

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
    backdrop: '/images/camp/base/world.jpg',
    base: [],
    frame: [],
    decor: [],
    pets: [],
    potHit: null,
    fx: [],
    cuts: [],
    tint: '',
    lit: null,
    litFade: false,
    peekText: '',
    termText: '',
    mode: 'view',
    selectedName: '',
    selectedSmell: [],
    drag: null,
    swayOn: {},
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
    this.later('viewTimer', null)
  },

  onUnload() {
    this.stopLife()
    this.later('viewTimer', null)
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
    // 背包里每样吃的下面：今天闻着它会来的（今日菜单），没来过的是剪影
    const foodBag = V.foodBag(view.foods, view.menu, view.pets.map((p) => p.id), (view.visitors || []).map((v) => v.id))
    const decorBag = V.decorBag(view.decor.unplaced)
    const treats = view.term && view.term.treats.length ? view.term.treats.map((id) => foodById(id).name).join('、') : ''
    // 锅里煮着几样就几层；第一样下锅就点火
    if (view.pot) this.pot = view.pot
    const wasLit = (this.potLevel || 0) > 0
    this.potLevel = V.potLevel(this.pot)
    const potLevel = this.potLevel
    const night = V.isNight(this.nowHour())
    if (!this.data.base.length || this.baseNight !== night) this.baseNight = night
    const patch = {
      loaded: true,
      beans: view.beans,
      canSpin: view.beans >= view.spinCost,
      world: { width: L.width, height: L.height, top: L.top, worldWidth: L.worldWidth, worldHeight: L.worldHeight, minScale: L.minScale, maxScale: L.maxScale, night },
      backdrop: V.backdropImage(night),
      base: this.data.base.length && this.data.base[0].image.indexOf(night ? 'night-t00' : '/t00') !== -1 ? this.data.base : V.baseTiles(L, this.baseFailed ? '' : config.campArt || '', night),
      frame: this.data.frame.length && this.data.frame[0].image.indexOf(night ? 'night-u00' : '/u00') !== -1 ? this.data.frame : V.frameTiles(L, this.baseFailed ? '' : config.campArt || '', night),
      decor: V.decorViews(view.decor.placed, L, config.decorArt || '', night, potLevel > 0),
      potHit: V.potHitView(L),
      fx: fxViews(L, this.nowHour(), view.decor.placed, potLevel, this.cutBase()),
      cuts: V.cutoutViews(L, potLevel, this.cutBase(), night),
      tint: V.tintFor(this.nowHour()),
      peekText: V.visitorNote(view.visitors),
      termText: treats ? `${view.term.name}限定点心「${treats}」正在扭蛋机里` : '',
      foodBag,
      decorBag,
      bagCount: foodBag.reduce((s, f) => s + f.count, 0) + decorBag.reduce((s, d) => s + d.count, 0),
      giftReady: view.giftReady,
      welcome: view.welcome || this.data.welcome,
    }
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    // 夜里火着：夜景上面盖一层点火版（整片草坪被火照亮）；正看着时下锅点火，这一层慢慢显出来；块不重发（云存储的图重设会闪）
    const lit = night && potLevel > 0
    if (!lit) {
      if (this.data.lit) Object.assign(patch, { lit: null, litFade: false })
    } else if (!this.data.lit) {
      patch.lit = { backdrop: V.LIT_BACKDROP, tiles: V.litTiles(L, this.baseFailed ? '' : config.campArt || '') }
      patch.litFade = !!this.data.loaded && !wasLit
    }
    // 带云存储图的几层没变就不重发：云存储的图 setData 一次就重新取一次，切回营地、喂完、买完都会闪一下
    ;['cuts', 'fx', 'decor', 'potHit'].forEach((k) => {
      if (JSON.stringify(this.data[k]) === JSON.stringify(patch[k])) delete patch[k]
    })
    const first = !this.centered
    if (first) {
      patch.view = V.homeView(L, win)
      this.centered = true
    }
    this.setData(patch)
    // 第一次进来：等画面排好版再对准篝火一次（个别机型 movable-view 刚建出来时不认初始 x / y）
    if (first) this.later('viewTimer', () => this.moveView(V.homeView(L, this.win())), VIEW_SETTLE_MS)
    this.syncLife(view, fresh)
    // 夜里火刚点着：小动物马上换成火光下的颜色（不等它下一步）
    if (this.life && !fresh && wasLit !== potLevel > 0) view.pets.concat(view.visitors || []).forEach((p) => this.life.refresh(p.id))
    if (!this.hourTimer) this.watchHour()
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，扭蛋、买装饰随便试试`, showCancel: false, confirmText: '好的' })
    }
    if (view.giftReady && !this.data.giftShown && this.life) this.offerGift(view)
  },

  // 捏着缩放：记下现在几倍（挪镜头前要知道）
  onZoom(e) {
    this.zoom = e.detail.scale
  },

  // 挪镜头到 offset（1 倍时的 x / y）。movable-view 同一次 setData 里又改 scale-value 又改 x / y 会吞掉一个，
  // 所以放大过就先缩回 1 倍、等它缩完再平移；值和上次一样组件不动，每次加减一点点小数让它一定变
  moveView(offset) {
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    const pan = () => this.setData({ 'view.x': offset.x + d, 'view.y': offset.y + d })
    if (Math.abs((this.zoom || 1) - 1) < 0.005) {
      this.later('viewTimer', null)
      return pan()
    }
    this.zoom = 1
    this.setData({ 'view.scale': this.data.view.scale === 1 ? 1.0001 : 1 })
    this.later('viewTimer', pan, ZOOM_SETTLE_MS)
  },

  // 一个名字只挂一个定时器：再挂就把旧的换掉，fn 为空就只取消
  later(name, fn, ms) {
    const clock = this.clock || { set: (f, t) => setTimeout(f, t), clear: (h) => clearTimeout(h) }
    if (this[name]) clock.clear(this[name])
    this[name] = null
    if (!fn) return
    this[name] = clock.set(() => {
      this[name] = null
      fn()
    }, ms)
  },

  recenter() {
    this.moveView(V.homeView(this.L, this.win()))
  },

  // 云端高清块（营地画和上下补的天空、草地）加载失败：都不再铺，只剩包里垫的整个世界（低清版）
  onBaseError() {
    if (this.baseFailed || (!this.data.base.length && !this.data.frame.length)) return
    this.baseFailed = true
    this.setData({ base: [], frame: [] })
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
    })
  },

  onDecorError() {
    if (!config.decorArt || !this.camp) return
    this.decorFailed = true
    this.setData({ decor: V.decorViews(this.camp.decor.placed, this.L, '', this.baseNight, (this.potLevel || 0) > 0) })
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
      visitors: view.visitors || [],
      saved: this.savedSpots(),
      hour: this.hour || undefined,
      lit: () => (this.potLevel || 0) > 0,
      pot: () => (this.pot && this.pot.foods) || [],
      clock: this.clock || undefined,
      random: this.random || undefined,
      sheets: SHEETS,
      sheetSrc: (id) => this.sheetSrc(id),
      bad: this.badSheets,
      // 秋千座位那层：只有用着云端高清块（拆成两层的）才摆
      sways: (id) => (config.decorArt && !this.decorFailed && V.DECOR_PARTS[id] ? V.DECOR_PARTS[id].pivot : null),
      // 只发变了的字段：拼图的 src 一样也重发的话，宠物每换个动作就闪一下。
      // 坐上 / 下了秋千：秋千座位那层的摆动开关和它放在同一次 setData 里，一起开始摆（不然差一两帧，看着在座位上滑）
      onChange: (i, sprite) => {
        const prev = this.data.pets[i]
        const patch = V.changedPaths(`pets[${i}]`, prev, sprite)
        const before = prev && prev.sway ? prev.sway.uid : ''
        const after = sprite.sway ? sprite.sway.uid : ''
        if (before !== after) {
          if (before) patch[`swayOn.${before}`] = false
          if (after) patch[`swayOn.${after}`] = true
        }
        if (Object.keys(patch).length) this.setData(patch)
      },
    })
    this.setData({ pets: this.life.sprites() })
    // 住户和客人都要（客人没拼图就退回单张图、按 CSS 一跳一跳地走，还闪）
    this.loadSheets(view.pets.concat(view.visitors || []).map((p) => p.id))
    if (this.data.mode === 'view') this.life.start()
  },

  // 宠物的动画拼图在云存储里，先下到本地再用（云存储的图 setData 一次就重新取一次，会闪）。一只一张（A、B、C 上下拼着），
  // 换动作、转身只挪行、不换图（换图也会闪）。下好的记在 globalData，切回营地不用再下；下载失败的先用单张图，下次进营地再试
  sheetFiles() {
    const g = getApp().globalData
    return (g.animFiles = g.animFiles || {})
  },

  sheetSrc(id) {
    const base = config.animArt || ''
    return (base && this.sheetFiles()[`${base}${id}.png`]) || ''
  },

  loadSheets(ids) {
    const base = config.animArt || ''
    if (!base) return
    const files = this.sheetFiles()
    ids.filter((id) => SHEETS[id]).forEach((id) => {
      const fileID = `${base}${id}.png`
      if (files[fileID] !== undefined) return
      files[fileID] = ''
      wx.cloud.downloadFile({
        fileID,
        success: (res) => {
          files[fileID] = res.tempFilePath || ''
          if (this.life) this.life.refresh(id)
        },
        fail: () => delete files[fileID],
      })
    })
  },

  // 离开营地（切 tab、关页面、重新进来前）记下小动物各自在哪，回来从原地接着来；本地存储失败就只记在内存里
  stopLife() {
    if (this.life) {
      this.saveSpots(this.life.snapshot())
      this.life.stop()
    }
    this.life = null
    this.stopWatchHour()
  },

  saveSpots(spots) {
    getApp().globalData.campSpots = spots
    try {
      wx.setStorageSync(SPOTS_KEY, spots)
    } catch (e) {
      // 存不了就算了：这次打开期间还记在 globalData 里
    }
  },

  savedSpots() {
    const g = getApp().globalData
    if (g.campSpots) return g.campSpots
    try {
      return wx.getStorageSync(SPOTS_KEY) || null
    } catch (e) {
      return null
    }
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

  // ---------------------------------------------------------------- 背包、锅

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
    const item = this.data.foodBag.find((x) => x.id === id)
    this.selected = { type: 'feed', foodId: id }
    this.setData({ bagOpen: false, mode: 'feed', selectedName: f ? f.name : '', selectedSmell: item ? item.smell : [] })
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

  // 点锅：空着就打开背包的「吃的」；煮着东西就说一句煮着什么（还能再放就问要不要再放一样）
  tapPot() {
    if (this.data.mode !== 'view') return
    const foods = (this.pot && this.pot.foods) || []
    if (!foods.length) {
      if (!this.data.foodBag.length) {
        wx.showToast({ title: '背包里没有吃的，去扭蛋机抽一个吧', icon: 'none' })
        return
      }
      this.setData({ bagOpen: true, bagTab: 'food' })
      return
    }
    const more = foods.length < 3 && this.data.foodBag.length > 0
    wx.showModal({
      title: '暖暖锅',
      content: V.potNote(this.pot),
      showCancel: more,
      cancelText: '好的',
      confirmText: more ? '再放一样' : '好的',
      success: (res) => {
        if (more && res.confirm) this.setData({ bagOpen: true, bagTab: 'food' })
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
    // 能玩的家具：第一项叫一只最近的、醒着的小家伙过来用
    const call = this.life ? V.callLabel(d.id) : ''
    const items = (call ? [call] : []).concat(['挪个地方', '收回背包'])
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const pick = items[res.tapIndex]
        if (pick === call) this.callPet(uid)
        else if (pick === '挪个地方') this.startMove(d)
        else if (pick === '收回背包') this.save('camp.stash', { uid }, `${d.name}收进背包了`)
      },
    })
  },

  callPet(uid) {
    const r = this.life.callTo(uid)
    const text = r.ok ? `${r.name}跑过来了` : CALL_FAILS[r.reason] || '这会儿叫不来'
    wx.showToast({ title: text, icon: 'none' })
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

  // 松手时手指在谁身上：住户（外框，客人不能喂）或锅
  hitTarget(p) {
    const L = this.L
    const px = p.x * L.k
    const py = p.y * L.k
    const pets = this.data.pets
    for (let i = pets.length - 1; i >= 0; i--) {
      const s = pets[i]
      if (s.hidden || s.visitor) continue
      const top = L.height - s.bottom - s.width
      if (px >= s.left && px <= s.left + s.width && py >= top && py <= L.height - s.bottom) return { pet: i }
    }
    if (V.onPot(p.x, p.y)) return { pot: true }
    return null
  },

  feedAt(p) {
    const sel = this.selected
    const hit = this.hitTarget(p)
    if (!hit) {
      wx.showToast({ title: '拖到锅里或者小动物身上松手', icon: 'none' })
      return
    }
    if (hit.pot) {
      this.cook(sel.foodId)
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

  // 下锅：火点上；爱吃的住户跑过来吃，闻着香味来的客人从营地边上进来
  cook(foodId) {
    if (this.saving) return
    this.saving = true
    api.call('camp.putFood', { foodId })
      .then((view) => {
        this.saving = false
        this.cancel()
        this.render(view)
        const cooked = view.cooked || { eaters: [] }
        if (this.life) {
          if (cooked.visitor) {
            this.life.addVisitor({ id: cooked.visitor, foodId })
            this.loadSheets([cooked.visitor])
          }
          this.life.cook(cooked.eaters)
        }
        const food = foodById(foodId)
        const names = cooked.eaters.map((id) => petById(id)).filter(Boolean).map((p) => p.name)
        const title = cooked.visitor ? `${food.name}下锅啦，香味飘出去了…` : names.length ? `${food.name}下锅啦，${names.slice(0, 3).join('、')}跑来吃` : `${food.name}下锅啦，火点上了`
        wx.showToast({ title, icon: 'none', duration: 2500 })
      })
      .catch((err) => {
        this.saving = false
        api.showError(err)
      })
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
    if (at) this.moveView(V.focusOffset(at.x, at.y, this.L, this.win()))
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
