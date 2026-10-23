const api = require('../../utils/api')
const config = require('../../config')
const W = require('../../utils/world')
const A = require('../../utils/animals')
const { buildScene, inventoryList } = require('../../utils/garden-view')
const { beansCard } = require('../../utils/view')
const { itemById } = require('../../utils/shared/garden')
const { SPOTS, DOOR, areaById, tileInfo, walkable, placeProblem } = require('../../utils/shared/estate')
const { createLife } = require('../../utils/garden-life')
const O = require('../../utils/occlusion')
const SHEETS = require('../../utils/anim-sheets')

function windowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

// 右上角胶囊按钮的位置：浮在上面的按钮要避开它
function capsule() {
  try {
    return wx.getMenuButtonBoundingClientRect()
  } catch (e) {
    return null
  }
}

function areaName(id) {
  const a = areaById(id)
  return a ? a.name : ''
}

Page({
  data: {
    loaded: false,
    beans: 0,
    canSpin: false,
    daily: null,
    collectedCount: 0,
    totalCount: 0,
    termText: '',
    waitingText: '',
    hud: { top: 28, height: 32, below: 72 },
    world: null,
    view: { x: 0, y: 0, scale: 1 },
    art: [],
    artBase: config.estateArt || '',
    animBase: config.animArt || '',
    occluders: [],
    clouds: [],
    signs: [],
    sprites: [],
    animals: [],
    inventory: [],
    bagCount: 0,
    bagOpen: false,
    residents: [],
    residentsOpen: false,
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    placingFlip: false,
    hints: [],
    justOpened: '',
    burst: null,
    welcome: null,
  },

  onLoad() {
    this.badSheets = new Set()
    this.animalOcc = []
    this.occViews = {}
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

  load() {
    return api.call('garden.get', { markSeen: true })
      .then((view) => {
        // 花园是首页：第一次用、还没建档，先去建档
        if (!view.hasProfile) {
          wx.switchTab({ url: '/pages/profile/profile' })
          return
        }
        this.setData({ justOpened: '', burst: null })
        this.render(view, true)
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const win = this.win()
    if (!this.L) this.L = W.estateLayout(win.width)
    const L = this.L
    this.garden = view
    this.opened = view.areas.filter((a) => a.unlocked).map((a) => a.id)
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    const inventory = inventoryList(view.inventory)
    const patch = {
      loaded: true,
      beans: view.beans,
      canSpin: view.beans >= view.spinCost,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      world: { width: L.width, height: L.height, viewWidth: L.viewWidth, viewHeight: L.viewHeight, margin: L.margin },
      art: this.data.art.length ? this.data.art : W.artTiles(L, this.data.artBase),
      clouds: W.cloudViews(view.areas, L),
      signs: W.signViews(view.areas, this.opened, L),
      sprites: buildScene(view.placed, L),
      inventory,
      bagCount: inventory.reduce((sum, i) => sum + i.count, 0),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    }
    // 摆放、移动之后的结果里没有 daily，沿用上次的
    if (view.daily !== undefined) patch.daily = beansCard(view.daily)
    // 第一次进来把正院摆到屏幕正中；之后保留拖到的位置
    if (!this.centered) {
      patch.view = W.areaOffset('main', L, win)
      this.centered = true
    }
    this.setData(patch)
    // 墙和建筑要挡住站在后面的东西：摆的物件算一次，小动物每动一下算它自己的
    this.pieces = O.pieces(L)
    this.staticOcc = O.occludersFor(this.pieces, patch.sprites.map((s) => O.rectOf(s, L)))
    this.syncLife(view, fresh)
    this.syncOcc()
    if (view.testGift) {
      wx.showModal({ title: '测试福利', content: `送你 ${view.testGift} 暖豆，修整院子、扭蛋随便试试`, showCancel: false, confirmText: '好的' })
    }
  },

  // movable-view 只在 x / y / scale-value 的值变了才会动：每次换一点点不同的小数
  nudgeView(offset) {
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: offset.x + d, y: offset.y + d, scale: 1 + d / 100 } })
  },

  recenter() {
    this.nudgeView(W.areaOffset('main', this.L, this.win()))
  },

  // 云存储的底图加载失败（没传、没权限、断网）：退回包里的白模
  onArtError() {
    if (!this.data.artBase) return
    this.setData({ artBase: '', art: W.artTiles(this.L, '') })
    this.occViews = {}
    this.occKey = ''
    this.syncOcc()
  },

  // 小动物的动画拼图加载失败（没传、断网）：这只退回单张图
  onAnimError(e) {
    const { id } = e.currentTarget.dataset
    if (!id || this.badSheets.has(id)) return
    this.badSheets.add(id)
    if (this.life) this.life.noSheet(id)
  },

  // 把摆的物件和每只小动物需要的遮挡块合在一起，变了才 setData
  syncOcc() {
    if (!this.pieces) return
    const seen = {}
    const list = []
    ;[this.staticOcc || []].concat(this.animalOcc || []).forEach((arr) => {
      ;(arr || []).forEach((p) => {
        if (seen[p.key]) return
        seen[p.key] = true
        list.push(p)
      })
    })
    const key = list.map((p) => p.key).sort().join(',')
    if (key === this.occKey) return
    this.occKey = key
    const art = this.data.art
    this.setData({ occluders: list.map((p) => this.occViews[p.key] || (this.occViews[p.key] = O.view(p, art))) })
  },

  occFor(sprite) {
    return sprite.hidden ? [] : O.occludersFor(this.pieces, [O.rectOf(sprite, this.L)])
  },

  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' })
  },

  // ---------------------------------------------------------------- 背包与摆放

  openBag() {
    this.setData({ bagOpen: true })
  },

  closeBag() {
    this.setData({ bagOpen: false })
  },

  pickInventory(e) {
    const { id } = e.currentTarget.dataset
    const item = itemById(id)
    this.selected = { type: 'place', itemId: id }
    this.setData({
      bagOpen: false,
      mode: 'place',
      selectedName: item ? item.name : '',
      placingFlip: false,
      hints: W.hintViews(this.opened, this.garden.placed, id, null, this.L),
    })
    if (this.life) this.life.pause()
  },

  tapSprite(e) {
    if (this.data.mode !== 'view') return
    const uid = e.currentTarget.dataset.uid
    const sprite = this.data.sprites.find((s) => s.uid === uid)
    if (!sprite) return
    wx.showActionSheet({
      itemList: ['移动位置', '收回背包'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.selected = { type: 'move', uid, itemId: sprite.itemId }
          this.setData({
            mode: 'move',
            selectedName: sprite.name,
            placingFlip: sprite.flip,
            hints: W.hintViews(this.opened, this.garden.placed, sprite.itemId, uid, this.L),
          })
          if (this.life) this.life.pause()
        } else if (res.tapIndex === 1) {
          this.save('garden.stash', { uid }, `${sprite.name}收进背包了`)
        }
      },
    })
  },

  // 换个方向：摆放时记在本地，摆下去一起存；移动时直接改
  toggleFlip() {
    const sel = this.selected
    if (!sel) return
    if (sel.type === 'place') {
      this.setData({ placingFlip: !this.data.placingFlip })
      return
    }
    api.call('garden.flip', { uid: sel.uid })
      .then((view) => {
        this.setData({ placingFlip: !this.data.placingFlip })
        this.render(view)
      })
      .catch((err) => api.showError(err))
  },

  tapLand(e) {
    if (this.data.mode === 'view' || !this.selected) return
    const touch = (e.changedTouches && e.changedTouches[0]) || e.detail
    const x = touch.clientX != null ? touch.clientX : touch.x
    const y = touch.clientY != null ? touch.clientY : touch.y
    wx.createSelectorQuery()
      .select('#world')
      .boundingClientRect()
      .exec((res) => {
        const rect = res && res[0]
        if (!rect) return
        const tile = W.tileFromTouch(x, y, rect, this.L)
        if (!tile) return
        const sel = this.selected
        const problem = placeProblem(this.opened, this.garden.placed, sel.itemId, tile.c, tile.r, sel.type === 'move' ? sel.uid : undefined)
        if (problem) {
          wx.showToast({ title: problem, icon: 'none' })
          return
        }
        if (sel.type === 'place') this.save('garden.place', { itemId: sel.itemId, c: tile.c, r: tile.r, flip: this.data.placingFlip })
        else this.save('garden.move', { uid: sel.uid, c: tile.c, r: tile.r })
      })
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
    this.setData({ mode: 'view', selectedName: '', placingFlip: false, hints: [] })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 修整院子

  tapSign(e) {
    const { key } = e.currentTarget.dataset
    const area = this.garden && this.garden.areas.find((a) => a.id === key)
    if (this.data.mode !== 'view' || !area || !area.unlockable) return
    if (this.data.beans < area.cost) {
      wx.showToast({ title: `修整要 ${area.cost} 暖豆，再攒攒`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '修整院子',
      content: `花 ${area.cost} 暖豆修整${area.name}？`,
      confirmText: '修整',
      success: (res) => {
        if (!res.confirm) return
        api.call('garden.unlock', { area: key })
          .then((view) => {
            const box = W.areaBox(key, this.L)
            this.setData({ justOpened: key, burst: { left: box.left + box.width / 2, top: box.top + box.height / 2 } })
            this.render(view, true)
            this.nudgeView(W.areaOffset(key, this.L, this.win()))
            wx.showToast({ title: `${area.name}修整好啦！`, icon: 'none' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面、修整院子之后重新安排；摆放、移动之后只告诉它们东西变了
  syncLife(view, fresh) {
    if (this.life && !fresh) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    const opened = this.opened
    this.animalOcc = []
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
      walk: (c, r, swims) => walkable(opened, c, r, swims),
      areaOf: (c, r) => tileInfo(c, r).area,
      spots: SPOTS.filter((s) => opened.indexOf(s.area) !== -1),
      door: { c: DOOR[0][0], r: DOOR[0][1] },
      hour: this.hour || undefined,
      clock: this.clock || undefined,
      sheets: SHEETS,
      animBase: this.data.animBase,
      bad: this.badSheets,
      onChange: (i, sprite) => {
        this.setData({ [`animals[${i}]`]: sprite })
        this.animalOcc[i] = this.occFor(sprite)
        this.syncOcc()
      },
    })
    const animals = this.life.sprites()
    this.animalOcc = animals.map((s) => this.occFor(s))
    this.setData({ animals })
    if (this.data.mode === 'view') this.life.start()
  },

  stopLife() {
    if (this.life) this.life.stop()
    this.life = null
  },

  tapAnimal(e) {
    if (this.data.mode !== 'view' || !this.life) return
    this.life.tap(e.currentTarget.dataset.index)
  },

  // ---------------------------------------------------------------- 找它

  openResidents() {
    const list = this.life ? this.life.whereIs() : []
    const residents = list.map((w) => ({ ...w, text: A.describe(w.state, areaName(w.area), areaName(w.toArea)) }))
    this.setData({ residents, residentsOpen: true })
  },

  closeResidents() {
    this.setData({ residentsOpen: false })
  },

  findResident(e) {
    const { index } = e.currentTarget.dataset
    const at = this.life ? this.life.focus(index) : null
    this.setData({ residentsOpen: false })
    if (at) this.nudgeView(W.tileOffset(at.c, at.r, this.L, this.win()))
  },

  // ---------------------------------------------------------------- 跳转

  closeWelcome() {
    this.setData({ welcome: null })
  },

  // 点弹窗内容时不关闭弹窗
  noop() {},

  goGacha() {
    this.setData({ welcome: null })
    wx.navigateTo({ url: '/pages/gacha/gacha' })
  },

  goCollection() {
    wx.navigateTo({ url: '/pages/collection/collection' })
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/forest/forest' })
  },
})
