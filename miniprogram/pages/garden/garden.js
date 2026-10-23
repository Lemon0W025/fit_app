const api = require('../../utils/api')
const { worldLayout, centerOffset, plotViews, decorations, tileFromTouch, openChecker } = require('../../utils/world')
const { buildScene, inventoryList, hintTiles } = require('../../utils/garden-view')
const { itemById } = require('../../utils/shared/garden')
const { createLife } = require('../../utils/garden-life')

function windowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
}

// 右上角胶囊按钮的位置：屏幕上浮着的按钮要避开它
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
    collectedCount: 0,
    totalCount: 0,
    termText: '',
    waitingText: '',
    hud: { top: 28, height: 32, below: 72 },
    world: null,
    view: { x: 0, y: 0, scale: 1 },
    plots: [],
    decor: [],
    sprites: [],
    animals: [],
    inventory: [],
    bagCount: 0,
    bagOpen: false,
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    hints: [],
    justOpened: '',
    welcome: null,
  },

  onLoad() {
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

  load() {
    return api.call('garden.get', { markSeen: true })
      .then((view) => {
        this.setData({ justOpened: '' })
        this.render(view, true)
      })
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const info = windowInfo()
    if (!this.L) this.L = worldLayout(info.windowWidth || 375)
    const L = this.L
    this.garden = view
    this.open = openChecker(view.plots)
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    const inventory = inventoryList(view.inventory)
    const patch = {
      loaded: true,
      beans: view.beans,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      world: { width: L.width, height: L.height, viewWidth: L.viewWidth, viewHeight: L.viewHeight, margin: L.margin },
      plots: plotViews(view.plots, L, view.expandCost),
      decor: decorations(L),
      sprites: buildScene(view.placed, L),
      inventory,
      bagCount: inventory.reduce((sum, i) => sum + i.count, 0),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    }
    // 第一次进来把中间那块地摆到屏幕正中；之后保留拖到的位置
    if (!this.centered) {
      patch.view = centerOffset(L, info.windowWidth || 375, info.windowHeight || 667)
      this.centered = true
    }
    this.setData(patch)
    this.syncLife(view, fresh)
  },

  // movable-view 只在 x / y / scale-value 的值变了才会动：每次换一点点不同的小数
  recenter() {
    const info = windowInfo()
    const center = centerOffset(this.L, info.windowWidth || 375, info.windowHeight || 667)
    this.nudge = !this.nudge
    const d = this.nudge ? 0.01 : 0
    this.setData({ view: { x: center.x + d, y: center.y + d, scale: 1 + d / 100 } })
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
      hints: hintTiles(this.garden.placed, this.L, null, this.open),
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
          this.selected = { type: 'move', uid }
          this.setData({ mode: 'move', selectedName: sprite.name, hints: hintTiles(this.garden.placed, this.L, uid, this.open) })
          if (this.life) this.life.pause()
        } else if (res.tapIndex === 1) {
          this.save('garden.stash', { uid }, `${sprite.name}收进背包了`)
        }
      },
    })
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
        const tile = tileFromTouch(x, y, rect, this.L)
        if (!tile) return
        if (!this.data.hints.some((h) => h.c === tile.c && h.r === tile.r)) {
          wx.showToast({ title: this.open(tile.c, tile.r) ? '这块地上已经有东西了' : '这块地还没开荒呢', icon: 'none' })
          return
        }
        const sel = this.selected
        if (sel.type === 'place') this.save('garden.place', { itemId: sel.itemId, c: tile.c, r: tile.r })
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
    this.setData({ mode: 'view', selectedName: '', hints: [] })
    if (this.life) this.life.resume()
  },

  // ---------------------------------------------------------------- 开荒

  tapSign(e) {
    const { key } = e.currentTarget.dataset
    const cost = this.garden && this.garden.expandCost
    if (this.data.mode !== 'view' || cost == null) return
    if (this.data.beans < cost) {
      wx.showToast({ title: `开荒要 ${cost} 暖豆，再攒攒`, icon: 'none' })
      return
    }
    wx.showModal({
      title: '开荒',
      content: `花 ${cost} 暖豆开垦这块地？`,
      confirmText: '开垦',
      success: (res) => {
        if (!res.confirm) return
        api.call('garden.expand', { plot: key })
          .then((view) => {
            this.setData({ justOpened: key })
            this.render(view, true)
            wx.showToast({ title: '开垦好啦！', icon: 'none' })
          })
          .catch((err) => api.showError(err))
      },
    })
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面、开荒之后重新安排；摆放、移动之后只告诉它们物件变了
  syncLife(view, fresh) {
    if (this.life && !fresh) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
      open: this.open,
      clock: this.clock || undefined,
      onChange: (i, sprite) => this.setData({ [`animals[${i}]`]: sprite }),
    })
    this.setData({ animals: this.life.sprites() })
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
