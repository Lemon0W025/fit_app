// 在 Node 里跑小程序页面逻辑：假的 wx / Page，wx.cloud.callFunction 直接调用真实云函数入口（配假的 wx-server-sdk）

const path = require('node:path')
const fs = require('node:fs')

const PAGES_DIR = path.join(__dirname, '../../miniprogram/pages')
const COMPONENTS_DIR = path.join(__dirname, '../../miniprogram/components')

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

// 和小程序一样支持 'a.b' 和 'list[0].x' 两种路径
function setPath(obj, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = clone(value)
}

function createWx(main) {
  const log = { toasts: [], modals: [], nav: [], uploads: [], downloads: [], vibrations: [] }
  const wx = {
    log,
    app: { globalData: { lastGain: null } },
    cloud: {
      callFunction({ name, data, success, fail }) {
        Promise.resolve()
          .then(() => {
            if (name !== 'api') throw new Error(`unknown function ${name}`)
            return main(data)
          })
          .then((result) => success && success({ result }), (err) => fail && fail({ errMsg: String(err) }))
      },
      uploadFile({ cloudPath, filePath, success }) {
        log.uploads.push({ cloudPath, filePath })
        setImmediate(() => success({ fileID: `cloud://env/${cloudPath}` }))
      },
      // 云存储的文件下到本地：临时路径用文件名；wx.failDownloads 设成 true 就都失败
      downloadFile({ fileID, success, fail }) {
        log.downloads.push(fileID)
        setImmediate(() => (wx.failDownloads ? fail && fail({ errMsg: 'downloadFile:fail' }) : success({ tempFilePath: `wxfile://tmp/${fileID.split('/').pop()}`, statusCode: 200 })))
      },
    },
    compressImage({ src, success }) {
      success({ tempFilePath: src })
    },
    chooseMedia({ success }) {
      success({ tempFiles: [{ tempFilePath: 'wxfile://tmp/photo.jpg' }] })
    },
    showToast(o) {
      log.toasts.push(o.title)
    },
    showModal(o) {
      log.modals.push(o.content || o.title)
      if (o.success) o.success({ confirm: true })
    },
    showLoading() {},
    hideLoading() {},
    navigateTo(o) {
      log.nav.push(['navigateTo', o.url])
    },
    redirectTo(o) {
      log.nav.push(['redirectTo', o.url])
    },
    switchTab(o) {
      log.nav.push(['switchTab', o.url])
    },
    navigateBack() {
      log.nav.push(['navigateBack'])
    },
    stopPullDownRefresh() {},
    previewImage() {},
    vibrateShort(o) {
      log.vibrations.push((o && o.type) || 'heavy')
    },
    // 本地存储：每个 wx 一份；wx.failStorage 设成 true 就都抛错（和真机存满 / 没权限一样）
    storage: {},
    setStorageSync(key, value) {
      if (wx.failStorage) throw new Error('setStorageSync:fail')
      wx.storage[key] = clone(value)
    },
    getStorageSync(key) {
      if (wx.failStorage) throw new Error('getStorageSync:fail')
      return wx.storage[key] === undefined ? '' : clone(wx.storage[key])
    },
    // 庭院容器 #garden 在屏幕上的位置；其他节点（如体重图 canvas）在测试里拿不到
    gardenRect: { left: 16, top: 100 },
    // 大地图 #world 在屏幕上的位置和宽度，测试里按拖动、缩放设置
    worldRect: null,
    // 其他节点的位置：{ 选择器: rect }（selectAll 的给数组），比如分段控制器量选项宽度
    rects: {},
    createSelectorQuery() {
      const selectors = []
      const rectOf = (sel) => (sel in wx.rects ? wx.rects[sel] : sel === '#world' ? wx.worldRect : sel === '#garden' ? wx.gardenRect : null)
      const q = {
        select: (sel) => {
          selectors.push(sel)
          return q
        },
        selectAll: (sel) => {
          selectors.push(sel)
          return q
        },
        fields: () => q,
        boundingClientRect: () => q,
        exec: (cb) => cb(selectors.map((sel) => clone(rectOf(sel)))),
      }
      return q
    },
    getWindowInfo: () => ({ pixelRatio: 2, windowWidth: 375, windowHeight: 700, statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({ top: 24, bottom: 56, height: 32, left: 281, right: 368, width: 87 }),
    // 弹出的操作菜单默认选第 actionSheetChoice 项
    actionSheetChoice: 0,
    showActionSheet(o) {
      log.actionSheets = (log.actionSheets || []).concat([o.itemList])
      if (o.success) o.success({ tapIndex: wx.actionSheetChoice })
    },
  }
  return wx
}

function loadPage(name, wx) {
  const file = path.join(PAGES_DIR, name, `${name}.js`)
  let def = null
  global.wx = wx
  global.getApp = () => wx.app
  global.Page = (d) => {
    def = d
  }
  delete require.cache[file]
  require(file)
  const page = { ...def, data: clone(def.data) }
  page.setData = function (patch, cb) {
    Object.entries(patch).forEach(([k, v]) => setPath(this.data, k, v))
    if (cb) cb()
  }
  return page
}

function getPath(obj, key) {
  return key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((cur, k) => (cur == null ? undefined : cur[k]), obj)
}

// 自定义组件：属性默认值 + data，props 覆盖；attach / ready / detach 调生命周期，pageShow / pageHide 调 pageLifetimes；
// setData 碰到 observers 监听的字段就调监听器（页面改属性也用 setData 模拟）；triggerEvent 记在 events 里
function loadComponent(name, wx, props = {}) {
  const file = path.join(COMPONENTS_DIR, name, `${name}.js`)
  let def = null
  global.wx = wx
  global.getApp = () => wx.app
  global.Component = (d) => {
    def = d
  }
  delete require.cache[file]
  require(file)
  const defaults = {}
  Object.entries(def.properties || {}).forEach(([k, p]) => {
    defaults[k] = p && p.value !== undefined ? p.value : null
  })
  const life = def.lifetimes || {}
  const pageLife = def.pageLifetimes || {}
  const observers = Object.entries(def.observers || {}).map(([keys, fn]) => ({ keys: keys.split(',').map((k) => k.trim()), fn }))
  return {
    ...(def.methods || {}),
    data: { ...clone(defaults), ...clone(def.data || {}), ...clone(props) },
    events: [],
    setData(patch, cb) {
      const changed = Object.keys(patch)
      changed.forEach((k) => setPath(this.data, k, patch[k]))
      observers.forEach(({ keys, fn }) => {
        const hit = keys.some((k) => changed.some((c) => c === k || c.startsWith(`${k}.`) || c.startsWith(`${k}[`)))
        if (hit) fn.apply(this, keys.map((k) => getPath(this.data, k)))
      })
      if (cb) cb()
    },
    triggerEvent(type, detail) {
      this.events.push([type, detail])
    },
    createSelectorQuery: () => wx.createSelectorQuery(),
    attach() {
      if (life.attached) life.attached.call(this)
    },
    ready() {
      if (life.ready) life.ready.call(this)
    },
    detach() {
      if (life.detached) life.detached.call(this)
    },
    pageShow() {
      if (pageLife.show) pageLife.show.call(this)
    },
    pageHide() {
      if (pageLife.hide) pageLife.hide.call(this)
    },
  }
}

async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r))
  // 让 setTimeout(0) 之类的定时器也跑完
  await new Promise((r) => setTimeout(r, 5))
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r))
}

function event(dataset = {}, detail = {}) {
  return { currentTarget: { dataset }, detail }
}

function readWxml(name) {
  return fs.readFileSync(path.join(PAGES_DIR, name, `${name}.wxml`), 'utf8')
}

// 粗略检查 WXML：标签配对
function checkTags(wxml) {
  const errors = []
  const stack = []
  const src = wxml.replace(/<!--[\s\S]*?-->/g, '')
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = re.exec(src))) {
    const [, closing, tag, , selfClosing] = m
    if (selfClosing) continue
    if (closing) {
      const open = stack.pop()
      if (open !== tag) errors.push(`</${tag}> 与 <${open}> 不匹配`)
    } else {
      stack.push(tag)
    }
  }
  if (stack.length) errors.push(`未闭合：${stack.join(', ')}`)
  return errors
}

function readComponentWxml(name) {
  return fs.readFileSync(path.join(COMPONENTS_DIR, name, `${name}.wxml`), 'utf8')
}

function boundHandlers(wxml) {
  return [...wxml.matchAll(/\b(?:bind|catch)\w+="(\w+)"/g)].map((m) => m[1])
}

// 取出 {{ }} 里作为表达式开头的变量名（不含 a.b 里的 b）；wx:for-item 声明的名字、<wxs module> 的模块名除外
function referencedRoots(wxml) {
  const roots = new Set()
  const loopNames = new Set([...wxml.matchAll(/(?:wx:for-(?:item|index)|<wxs[^>]*\bmodule)="(\w+)"/g)].map((m) => m[1]))
  const keywords = new Set(['true', 'false', 'null', 'undefined'])
  for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const expr = m[1].replace(/'[^']*'|"[^"]*"/g, '')
    for (const id of expr.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)/g)) {
      if (!keywords.has(id[2]) && !loopNames.has(id[2])) roots.add(id[2])
    }
  }
  return [...roots]
}

module.exports = { createWx, loadPage, loadComponent, settle, event, readWxml, readComponentWxml, checkTags, boundHandlers, referencedRoots }
