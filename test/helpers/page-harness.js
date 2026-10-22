// 在 Node 里跑小程序页面逻辑：假的 wx / Page，wx.cloud.callFunction 直接调用真实云函数入口（配假的 wx-server-sdk）

const path = require('node:path')
const fs = require('node:fs')

const PAGES_DIR = path.join(__dirname, '../../miniprogram/pages')

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

function setPath(obj, key, value) {
  const parts = key.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = clone(value)
}

function createWx(main) {
  const log = { toasts: [], modals: [], nav: [], uploads: [] }
  const wx = {
    log,
    app: { globalData: { lastTree: null } },
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
    createSelectorQuery() {
      const q = {
        select: () => q,
        fields: () => q,
        exec: (cb) => cb([null]),
      }
      return q
    },
    getWindowInfo: () => ({ pixelRatio: 2 }),
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

async function settle() {
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

function boundHandlers(wxml) {
  return [...wxml.matchAll(/\b(?:bind|catch)\w+="(\w+)"/g)].map((m) => m[1])
}

// 取出 {{ }} 里作为表达式开头的变量名（不含 a.b 里的 b）
function referencedRoots(wxml) {
  const roots = new Set()
  const keywords = new Set(['true', 'false', 'null', 'undefined'])
  for (const m of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const expr = m[1].replace(/'[^']*'|"[^"]*"/g, '')
    for (const id of expr.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)/g)) {
      if (!keywords.has(id[2])) roots.add(id[2])
    }
  }
  return [...roots]
}

module.exports = { createWx, loadPage, settle, event, readWxml, checkTags, boundHandlers, referencedRoots }
