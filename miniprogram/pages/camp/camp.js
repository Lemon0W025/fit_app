const api = require('../../utils/api')
const config = require('../../config')
const V = require('../../utils/camp-view')
const { createLife } = require('../../utils/camp-life')
const { todayOf } = require('../../utils/pet-talk')
const { fxViews } = require('../../utils/scene-fx')
const { beansCard } = require('../../utils/view')
const { petById } = require('../../utils/shared/pets')
const { foodById } = require('../../utils/shared/foods')
const { decorById, placeProblem, nearestSpot } = require('../../utils/shared/decor')
const SHEETS = require('../../utils/anim-sheets')
const { TOURS, seen, markSeen } = require('../../utils/tours')
const { syncTabBar } = require('../../utils/tab-bar')

const DOUBLE_TAP_MS = 300
const HOUR_CHECK_MS = 60000
const VIEW_SETTLE_MS = 300 // 第一次进来排好版后再对准一次篝火
const ZOOM_SETTLE_MS = 550 // 缩回 1 倍的弹簧动画大约这么久，缩完再平移
const SPOTS_KEY = 'campSpots' // 离开营地时小动物各自在哪（本地存储，重开小程序也在原地）
const SIDE_PAD = 64 // 屏幕两边按钮那一溜多宽（px），说话的气泡让开
const TOUR_AFTER_MS = 900 // 画面摆好、锅的点击区出来以后再开始导览
const BAG_SLOP = 10 // 背包里的吃的：手指往上挪过这么多（px）才算拖出来
const HOME_NOTE_MS = 8000 // 「住下啦」的提示条留多久
const CHEER_GAP_MS = 200 // 两张庆祝卡之间隔多久
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
    hungryText: '',
    termText: '',
    mode: 'view',
    selectedName: '',
    // 摆 / 挪装饰时底下那条提示；placingMore：已经摆下一个、手里接着拿着同一种（按钮写「好了」）
    placingText: '',
    placingMore: false,
    selectedSmell: [],
    drag: null,
    swayOn: {},
    bagOpen: false,
    bagForPot: false, // 点锅打开的背包：点一样就下锅
    bagTuck: false, // 背包里按住吃的往上拖：抽屉先收下去（不卸）
    bagTab: 'food',
    bagTabs: [
      { label: '食物', value: 'food' },
      { label: '装饰', value: 'decor' },
    ],
    foodBag: [],
    decorBag: [],
    bagCount: 0,
    residents: [],
    residentsOpen: false,
    giftReady: false,
    giftShown: false,
    welcome: null,
    cheer: null, // 庆祝卡（住下的到了 4 / 8 / 12 只、满级后多了一颗星），一张一张出
    tourSteps: TOURS.camp,
    tourShow: false,
    celebrate: false,
  },

  onLoad() {
    this.badSheets = new Set()
    const rect = capsule()
    if (rect && rect.height) this.setData({ hud: { top: rect.top, height: rect.height, below: rect.bottom + 12 } })
  },

  onShow() {
    syncTabBar(this)
    this.cancel()
    this.load()
  },

  onHide() {
    this.stopLife()
    this.later('viewTimer', null)
    this.later('tourTimer', null)
    this.later('cheerTimer', null) // 两张庆祝卡之间正好切走：剩下的回来接着出（render 里）
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

  nowMs() {
    return this.now ? this.now().getTime() : Date.now()
  },

  load() {
    return api.call('camp.get', { markSeen: true })
      .then((view) => {
        if (!view.hasProfile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.render(view, true)
        this.maybeTour()
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
    const foodBag = V.foodBag(view.foods, view.menu, view.met || view.pets.map((p) => p.id))
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
      termText: treats ? `${view.term.name}限定点心「${treats}」正在扭蛋机里` : '',
      foodBag,
      decorBag,
      bagCount: foodBag.reduce((s, f) => s + f.count, 0) + decorBag.reduce((s, d) => s + d.count, 0),
      giftReady: view.giftReady,
      welcome: view.welcome || this.data.welcome,
    }
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    // 小动物聊今天打卡用的（拍了几顿、吃了多少、该吃哪顿了）
    if (view.daily !== undefined) this.talkToday = todayOf(view.daily, view.intake, this.now ? this.now() : new Date())
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
    this.updateHungry()
    // 夜里火刚点着：小动物马上换成火光下的颜色（不等它下一步）
    if (this.life && !fresh && wasLit !== potLevel > 0) view.pets.forEach((p) => this.life.refresh(p.id))
    if (!this.hourTimer) this.watchHour()
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，扭蛋、买装饰随便试试`, showCancel: false, confirmText: '好的' })
    }
    if (view.giftReady && !this.data.giftShown && this.life) this.offerGift(view)
    this.queueCheers(view.cheers)
  },

  // 捏着缩放：记下现在几倍（挪镜头前要知道）
  onZoom(e) {
    this.zoom = e.detail.scale
    if (e.detail.x !== undefined) this.viewX = e.detail.x
  },

  // 拖着看：只记下镜头在哪（不 setData），小动物说话的气泡别跑到屏幕外、别躲在两边的按钮底下
  onPan(e) {
    if (e.detail && e.detail.x !== undefined) this.viewX = e.detail.x
  },

  // 现在屏幕上看得到的那段（画的坐标 × k，就是世界里的像素），两边让开按钮那一溜
  visibleRange() {
    const s = this.zoom || 1
    const vx = this.viewX !== undefined ? this.viewX : (this.data.view && this.data.view.x) || 0
    const pad = SIDE_PAD / s
    return { left: -vx / s + pad, right: (this.win().width - vx) / s - pad }
  },

  // 挪镜头到 offset（1 倍时的 x / y）。movable-view 同一次 setData 里又改 scale-value 又改 x / y 会吞掉一个，
  // 所以放大过就先缩回 1 倍、等它缩完再平移；值和上次一样组件不动，每次加减一点点小数让它一定变
  moveView(offset) {
    this.viewX = offset.x
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

  // 锅空着出去找吃的那几只：提示条
  updateHungry() {
    const text = this.life ? V.hungryNote(this.life.hungryAway()) : ''
    if (text !== this.data.hungryText) this.setData({ hungryText: text })
  },

  // 庆祝卡：云函数带回来几条就排几张，关了一张再出下一张
  queueCheers(cheers) {
    this.cheerQueue = (this.cheerQueue || []).concat((cheers || []).map(V.cheerCard))
    if (this.cheerQueue.length && !this.data.cheer && !this.cheerTimer) this.nextCheer()
  },

  nextCheer() {
    const cheer = (this.cheerQueue || []).shift() || null
    this.setData({ cheer })
    if (cheer) wx.vibrateShort && wx.vibrateShort({ type: 'medium' })
    else this.maybeTour()
  },

  // 收下：先收起来，隔一下再出下一张（卡片弹出来的动画重新放一遍）
  closeCheer() {
    if (!(this.cheerQueue || []).length) return this.nextCheer()
    this.setData({ cheer: null })
    this.later('cheerTimer', () => this.nextCheer(), CHEER_GAP_MS)
  },

  // 喂够了、住下了：提示一会儿，大家围着火蹦一蹦
  movedIn(ids) {
    const text = V.homeNote(ids)
    if (!text) return
    this.setData({ peekText: text })
    this.later('homeTimer', () => this.setData({ peekText: '' }), HOME_NOTE_MS)
    if (this.life) this.life.celebrate()
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
      sways: (id) => (config.decorArt && !this.decorFailed && V.DECOR_PARTS[id]) || null,
      today: () => this.talkToday || null,
      visible: () => this.visibleRange(),
      // 只发变了的字段：拼图的 src 一样也重发的话，宠物每换个动作就闪一下。
      // 坐上 / 下了秋千：秋千座位那层的摆动开关和它放在同一次 setData 里，一起开始摆（不然差一两帧，看着在座位上滑）
      onChange: (i, sprite) => {
        const prev = this.data.pets[i]
        const patch = V.changedPaths(`pets[${i}]`, prev, sprite)
        const before = prev && prev.sway ? prev.sway.uid : ''
        const after = sprite.sway ? sprite.sway.uid : ''
        if (before !== after) {
          if (before) patch[`swayOn.${before}`] = ''
          if (after) patch[`swayOn.${after}`] = sprite.sway.cls
        }
        if (Object.keys(patch).length) this.setData(patch)
      },
    })
    // 回来时睡在吊床里的：布和它一起接着晃（同一次 setData）
    const pets = this.life.sprites()
    const swayOn = {}
    pets.forEach((p) => {
      if (p.sway) swayOn[p.sway.uid] = p.sway.cls
    })
    this.setData({ pets, swayOn })
    this.loadSheets(view.pets.map((p) => p.id))
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
      this.life.freeze()
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
      // 锅到期（最后一样下锅 8 小时）：锅清空、火熄掉、重画，没住下的常客就回去了
      const expired = this.camp && this.pot && this.pot.until && this.nowMs() >= this.pot.until && (this.pot.foods || []).length
      if (expired) this.camp = { ...this.camp, pot: { foods: [], until: 0 } }
      if (this.camp && (expired || V.isNight(h) !== this.baseNight || V.tintFor(h) !== this.data.tint)) this.render(this.camp)
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
    this.setData({ bagOpen: true, bagForPot: false })
  },

  // 点锅：打开背包的「吃的」，点一样就下锅
  openPotBag() {
    this.setData({ bagOpen: true, bagTab: 'food', bagForPot: true })
  },

  closeBag() {
    this.setData({ bagOpen: false, bagForPot: false, bagTuck: false })
  },

  // 背包顶上的「食物 / 装饰」（components/segmented）
  switchBag(e) {
    this.setData({ bagTab: e.detail.value })
  },

  // 背包里的吃的：按住往上拖出来，拖到锅上 / 小动物身上松手（11/07 用户：不想先点一下再点一下）。
  // 横着划是滚背包、往下拉是拖抽屉，都不算；往上拖过 BAG_SLOP 就拿起来：抽屉收下去（tuck，不卸载，手指按着的元素还在、touchmove 不断），
  // 进 feed 模式、幽灵图跟着手指，松手按落点处理。点一下照旧问一句
  onBagTouchStart(e) {
    const t = e.touches && e.touches[0]
    this.suppressTap = false
    this.bagTouch = t ? { id: e.currentTarget.dataset.id, x0: t.clientX, y0: t.clientY, dragging: false } : null
  },

  onBagTouchMove(e) {
    const bt = this.bagTouch
    const t = e.touches && e.touches[0]
    if (!bt || !t) return
    if (!bt.dragging) {
      const dx = t.clientX - bt.x0
      const dy = t.clientY - bt.y0
      if (Math.abs(dx) < BAG_SLOP && Math.abs(dy) < BAG_SLOP) return
      if (-dy <= Math.abs(dx)) {
        this.bagTouch = null
        return
      }
      bt.dragging = true
      this.liftFood(bt.id)
    }
    this.updateDrag(t.clientX, t.clientY)
  },

  onBagTouchEnd(e) {
    const bt = this.bagTouch
    this.bagTouch = null
    if (!bt || !bt.dragging) return
    this.suppressTap = true
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
    this.setData({ drag: null, bagOpen: false, bagTuck: false, bagForPot: false })
    if (!t || !this.worldRect) return this.cancel()
    this.feedAt(V.fromTouch(t.clientX, t.clientY, this.worldRect, this.L), true)
  },

  // 从背包里拿起来（抽屉收下去、不卸）
  liftFood(id) {
    const f = foodById(id)
    const item = this.data.foodBag.find((x) => x.id === id)
    this.selected = { type: 'feed', foodId: id }
    this.setData({ bagTuck: true, mode: 'feed', selectedName: f ? f.name : '', selectedSmell: item ? item.smell : [] })
    if (this.life) this.life.pause()
    this.queryWorldRect()
  },

  // 点了背包里一样吃的：点锅打开的，问一句就下锅；背包按钮打开的，问放进锅里还是拿去喂一只（拖拽对长辈难，下锅不用拖）
  pickFood(e) {
    if (this.suppressTap) {
      this.suppressTap = false
      return
    }
    const { id } = e.currentTarget.dataset
    const f = foodById(id)
    const name = f ? f.name : '它'
    if (this.data.bagForPot) {
      this.closeBag()
      wx.showModal({
        title: '放进锅里？',
        content: `把${name}放进锅里煮上，爱吃的小动物会闻着香味来`,
        confirmText: '放进去',
        success: (res) => {
          if (res.confirm) this.cook(id)
        },
      })
      return
    }
    wx.showActionSheet({
      itemList: ['放进锅里煮上', `拿着${name}去喂一只小动物`],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.closeBag()
          this.cook(id)
        } else this.holdFood(id)
      },
    })
  },

  // 拿在手里：拖到小动物身上喂它（拖进锅里也能下锅）
  holdFood(id) {
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
    const item = this.data.decorBag.find((x) => x.id === id)
    this.selected = { type: 'place', decorId: id }
    this.setData({ bagOpen: false, mode: 'place', selectedName: d ? d.name : '', placingText: V.placingText('place', d ? d.name : '', item ? item.count : 1), placingMore: false })
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
      this.openPotBag()
      return
    }
    const more = foods.length < 3 && this.data.foodBag.length > 0
    wx.showModal({
      title: '暖暖锅',
      content: V.potNote(this.pot, this.nowMs()),
      showCancel: more,
      cancelText: '好的',
      confirmText: more ? '再放一样' : '好的',
      success: (res) => {
        if (more && res.confirm) this.openPotBag()
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
    this.setData({ mode: 'move', selectedName: d.name, placingText: V.placingText('move', d.name, 1), placingMore: false })
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
    if (this.selected.type === 'feed') this.feedAt(V.fromTouch(t.clientX, t.clientY, this.worldRect, this.L))
    else this.placeAt(this.dropPoint(t.clientX, t.clientY))
  },

  // 摆 / 挪装饰：落脚点在手指上方一点（V.DRAG_LIFT，手指不挡着它和脚下的占地框）
  dropPoint(x, y) {
    return V.fromTouch(x, y - V.DRAG_LIFT, this.worldRect, this.L)
  },

  // 想放在 p：能放就是那儿；放不下就靠到旁边最近能放的地方（shared/decor.js 的 nearestSpot），太远了才算放不下（null）
  spotFor(p) {
    const sel = this.selected
    return nearestSpot(this.camp.decor.placed, sel.decorId, Math.round(p.x), Math.round(p.y), sel.type === 'move' ? sel.uid : undefined)
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
    // 影子画在会落下去的地方：挤的时候已经靠到旁边了（绿的），哪儿都靠不过去才是红的、跟着手指
    const at = this.dropPoint(x, y)
    const spot = this.spotFor(at)
    this.setData({ drag: V.ghostView(sel.decorId, spot ? spot.x : at.x, spot ? spot.y : at.y, this.L, !!spot) })
  },

  // 松手时手指在谁身上：小动物（外框）或锅
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
    if (V.onPot(p.x, p.y)) return { pot: true }
    return null
  },

  // fromBag：从背包里直接拖出来的，没放到锅上 / 小动物身上就算了（不留在手里）
  feedAt(p, fromBag = false) {
    const sel = this.selected
    const hit = this.hitTarget(p)
    if (!hit) {
      wx.showToast({ title: fromBag ? '没放进去：拖到锅上再松手' : '拖到锅里或者小动物身上松手', icon: 'none' })
      if (fromBag) this.cancel()
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
        this.movedIn(view.movedIn)
      })
      .catch((err) => api.showError(err))
  },

  // 下锅：火点上；在场爱吃的跑过来吃，闻着香味来的（云函数说的 comers）排着队从屏幕边上进来
  cook(foodId) {
    if (this.saving) return
    this.saving = true
    api.call('camp.putFood', { foodId })
      .then((view) => {
        this.saving = false
        this.cancel()
        this.render(view)
        const cooked = view.cooked || { eaters: [], comers: [], movedIn: [] }
        const comers = cooked.comers || []
        if (this.life) {
          this.life.cook(cooked.eaters)
          comers.forEach((id) => this.life.addGuest({ id, foodId }))
          if (comers.length) this.loadSheets(comers)
          this.updateHungry()
        }
        const food = foodById(foodId)
        const nameOf = (ids) => ids.map((id) => petById(id)).filter(Boolean).map((p) => p.name)
        const eating = nameOf(cooked.eaters)
        const coming = nameOf(comers)
        const title = coming.length ? `${food.name}下锅啦，${coming.slice(0, 3).join('、')}闻着香味来了…` : eating.length ? `${food.name}下锅啦，${eating.slice(0, 3).join('、')}跑来吃` : `${food.name}下锅啦，火点上了`
        wx.showToast({ title, icon: 'none', duration: 2500 })
        this.movedIn(cooked.movedIn)
      })
      .catch((err) => {
        this.saving = false
        api.showError(err)
      })
  },

  placeAt(p) {
    const sel = this.selected
    const spot = this.spotFor(p)
    if (!spot) {
      const why = placeProblem(this.camp.decor.placed, sel.decorId, p.x, p.y, sel.type === 'move' ? sel.uid : undefined)
      wx.showToast({ title: why || '这儿放不下，换个地方', icon: 'none' })
      return
    }
    if (sel.type === 'place') this.save('camp.place', { decorId: sel.decorId, x: spot.x, y: spot.y }, '', (view) => this.moreToPlace(sel.decorId, view))
    else this.save('camp.move', { uid: sel.uid, x: spot.x, y: spot.y })
  },

  // 摆好一个，背包里还有同一种：接着拿着下一个（种一排花不用每朵都回背包拿），返回底下那条提示要写的；没有了返回 ''
  moreToPlace(decorId, view) {
    const d = decorById(decorId)
    const more = (view.decor.unplaced || []).find((u) => u.id === decorId)
    return d && more && more.count > 0 ? V.placingText('place', d.name, more.count) : ''
  },

  // keep(view)：存好以后要不要接着拿着（返回提示的字就接着，不退出摆放）
  save(action, data, toast, keep) {
    if (this.saving) return
    this.saving = true
    api.call(action, data)
      .then((view) => {
        this.saving = false
        const more = keep ? keep(view) : ''
        if (more) this.setData({ drag: null, placingText: more, placingMore: true })
        else this.cancel()
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
    this.setData({ mode: 'view', selectedName: '', drag: null, placingMore: false })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 找它

  // 住户列表：在哪、在干什么；满级后有星星的在名字后面带上
  openResidents() {
    const stars = {}
    const stay = {}
    ;((this.camp && this.camp.pets) || []).forEach((p) => {
      stars[p.id] = p.stars ? V.starText(p.stars) : ''
      stay[p.id] = V.stayText(p)
    })
    // 常客：在干什么后面带一句「再喂 N 顿就住下」
    const residents = this.life ? this.life.whereIs().map((w) => ({ ...w, stars: stars[w.id] || '', stay: stay[w.id] || '' })) : []
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
    this.maybeTour()
  },

  // 第一次进营地：有欢迎卡先看欢迎卡（关了再开始），没有就等画面摆好再开始；看过就不再自动出来
  maybeTour() {
    if (this.data.welcome || this.data.cheer || this.data.tourShow || seen('camp')) return
    this.later('tourTimer', () => this.setData({ tourShow: true }), TOUR_AFTER_MS)
  },

  onTourDone() {
    markSeen('camp')
    this.setData({ tourShow: false })
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
