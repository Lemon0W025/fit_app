const api = require('../../utils/api')
const { isoLayout, tileAt } = require('../../utils/iso')
const { buildScene, inventoryList, hintTiles } = require('../../utils/garden-view')
const { itemById } = require('../../utils/shared/garden')
const { createLife } = require('../../utils/garden-life')

// 页面左右各留 32rpx（≈ 屏幕宽的 1/23.4），庭院占满中间
const SIDE_PADDING_RATIO = 64 / 750

function windowWidth() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  return info.windowWidth || 375
}

Page({
  data: {
    loaded: false,
    beans: 0,
    collectedCount: 0,
    totalCount: 0,
    term: null,
    termText: '',
    layout: null,
    landImage: '',
    sprites: [],
    inventory: [],
    mode: 'view', // view 看 / place 从背包摆放 / move 移动已摆的
    selectedName: '',
    hints: [],
    welcome: null,
    animals: [],
    waitingText: '',
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
      .then((view) => this.render(view, true))
      .catch((err) => api.showError(err))
  },

  render(view, fresh) {
    const width = windowWidth() * (1 - SIDE_PADDING_RATIO)
    const L = isoLayout(view.size, width)
    this.garden = view
    this.L = L
    const termItems = view.term && view.term.items.length ? view.term.items.map((id) => itemById(id).name).join('、') : ''
    this.setData({
      loaded: true,
      beans: view.beans,
      collectedCount: view.collectedCount,
      totalCount: view.totalCount,
      term: view.term,
      termText: termItems ? `${view.term.name}限定「${termItems}」正在扭蛋机里` : '',
      waitingText: view.waiting && view.waiting.length ? '👀 有小动物在院子外张望…下次打卡它就来了' : '',
      layout: { width: L.width, height: L.height, top: L.top, landHeight: L.landHeight },
      landImage: `/images/garden/land-${view.size}.png`,
      sprites: buildScene(view.placed, L),
      inventory: inventoryList(view.inventory),
      welcome: view.welcome || this.data.welcome,
      hints: this.data.mode === 'view' ? [] : this.data.hints,
    })
    this.syncLife(view, fresh)
  },

  // ---------------------------------------------------------------- 小动物

  // 刚进页面或庭院变大了就重新安排；摆放、移动之后只告诉它们物件变了
  syncLife(view, fresh) {
    if (this.life && !fresh && this.lifeSize === view.size) {
      this.life.updatePlaced(view.placed)
      return
    }
    this.stopLife()
    this.lifeSize = view.size
    this.life = createLife({
      L: this.L,
      placed: view.placed,
      residents: view.residents || [],
      arrivals: view.arrivals || [],
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

  // ---------------------------------------------------------------- 摆放

  pickInventory(e) {
    const { id } = e.currentTarget.dataset
    const item = itemById(id)
    this.selected = { type: 'place', itemId: id }
    this.setData({ mode: 'place', selectedName: item ? item.name : '', hints: hintTiles(this.garden.placed, this.L) })
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
          this.setData({ mode: 'move', selectedName: sprite.name, hints: hintTiles(this.garden.placed, this.L, uid) })
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
      .select('#garden')
      .boundingClientRect()
      .exec((res) => {
        const rect = res && res[0]
        if (!rect) return
        const tile = tileAt(x - rect.left, y - rect.top, this.L)
        if (!tile) return
        if (!this.data.hints.some((h) => h.c === tile.c && h.r === tile.r)) {
          wx.showToast({ title: '这块地上已经有东西了', icon: 'none' })
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
