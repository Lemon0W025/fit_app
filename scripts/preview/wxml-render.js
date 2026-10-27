// 极简 WXML → HTML 渲染器：把页面的 wxml + wxss + data 渲染成一张 HTML，在浏览器里预览样式、录屏（scripts/preview/record-camp.js 用）。
// 自定义组件按它自己的 JS 算出稳定下来的 data 再画（settledData），认 <slot>；<wxs> 不画（只有真机的渲染层跑）
const fs = require('fs')
const path = require('path')

const REPO = path.join(__dirname, '..', '..')
const MP = path.join(REPO, 'miniprogram')

function parse(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  const root = { tag: 'root', attrs: {}, children: [] }
  const stack = [root]
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) {
      if (m[5].trim()) stack[stack.length - 1].children.push({ text: m[5].replace(/\s+/g, ' ').trim() })
      continue
    }
    const [, closing, tag, attrStr, self] = m
    if (closing) {
      stack.pop()
      continue
    }
    const attrs = {}
    for (const a of attrStr.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? true : a[2]
    const node = { tag, attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!self) stack.push(node)
  }
  return root
}

function evalExpr(expr, scope) {
  const proxy = new Proxy(scope, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : t[k]) })
  try {
    return Function('scope', `with (scope) { return (${expr}) }`)(proxy)
  } catch (e) {
    return undefined
  }
}

function interp(str, scope) {
  if (typeof str !== 'string') return str
  const whole = str.match(/^\{\{([\s\S]*)\}\}$/)
  if (whole) return evalExpr(whole[1], scope)
  return str.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => {
    const v = evalExpr(e, scope)
    return v == null ? '' : v
  })
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const rpx = (css) => String(css).replace(/(-?\d*\.?\d+)rpx/g, (_, n) => `${parseFloat(n) / 2}px`)

function renderChildren(children, scope, ctx) {
  let out = ''
  let prev = null
  for (const c of children) {
    if (c.text !== undefined) {
      out += esc(interp(c.text, scope) ?? '')
      prev = null
      continue
    }
    // <wxs> 只在真机的渲染层跑（跟手的拖动之类），预览里不画
    if (c.tag === 'wxs') continue
    const a = c.attrs
    if ('wx:if' in a) {
      prev = !!interp(a['wx:if'], scope)
      if (!prev) continue
    } else if ('wx:elif' in a) {
      if (prev) continue
      prev = !!interp(a['wx:elif'], scope)
      if (!prev) continue
    } else if ('wx:else' in a) {
      if (prev) continue
      prev = null
    } else {
      prev = null
    }
    if ('wx:for' in a) {
      const list = interp(a['wx:for'], scope) || []
      const itemName = a['wx:for-item'] || 'item'
      const indexName = a['wx:for-index'] || 'index'
      list.forEach((item, index) => {
        out += renderNode(c, { ...scope, [itemName]: item, [indexName]: index }, ctx)
      })
    } else {
      out += renderNode(c, scope, ctx)
    }
  }
  return out
}

// 组件的 JS：拿到 Component({...}) 的定义（属性默认值、data、生命周期、方法）
function loadDef(file) {
  let def = null
  const prev = global.Component
  global.Component = (d) => {
    def = d
  }
  try {
    delete require.cache[require.resolve(file)]
    require(file)
  } finally {
    global.Component = prev
  }
  return def || {}
}

function setPath(obj, key, value) {
  const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] == null ? (cur[parts[i]] = {}) : cur[parts[i]]
  cur[parts[parts.length - 1]] = value
}

// 按组件自己的逻辑算出它稳定下来的 data：属性 + data，跑一遍 attached / ready，定时器（圆环滚数字、抽屉下一拍打开……）一口气走完。
// 量不到节点位置（selectorQuery 都给 null），要量的组件（分段控制器）就是还没量好的样子
function settledData(def, props) {
  const defaults = {}
  Object.entries(def.properties || {}).forEach(([k, p]) => (defaults[k] = p && typeof p === 'object' && 'value' in p ? p.value : null))
  const timers = []
  const inst = {
    ...(def.methods || {}),
    data: JSON.parse(JSON.stringify({ ...defaults, ...(def.data || {}), ...props })),
    setData(patch, cb) {
      Object.entries(patch).forEach(([k, v]) => setPath(this.data, k, v))
      if (cb) cb()
    },
    triggerEvent() {},
    createSelectorQuery() {
      let n = 0
      const q = {
        select: () => ((n += 1), q),
        selectAll: () => ((n += 1), q),
        fields: () => q,
        boundingClientRect: () => q,
        exec: (cb) => cb(Array.from({ length: n }, () => null)),
      }
      return q
    },
    clock: { set: (fn) => timers.push(fn), clear: (h) => (timers[h - 1] = null) },
  }
  const life = def.lifetimes || {}
  if (life.attached) life.attached.call(inst)
  if (life.ready) life.ready.call(inst)
  for (let i = 0; i < timers.length && i < 10000; i++) {
    const fn = timers[i]
    timers[i] = null
    if (fn) fn()
  }
  return inst.data
}

// 页面 / 组件 json 里的 usingComponents → { 标签: { name, dir, ast, def, using } }
function loadComponents(using) {
  const out = {}
  Object.entries(using || {}).forEach(([tag, ref]) => {
    const dir = path.join(MP, ref)
    const name = path.basename(ref)
    const json = JSON.parse(fs.readFileSync(`${dir}.json`, 'utf8'))
    out[tag] = { name, dir, ast: parse(fs.readFileSync(`${dir}.wxml`, 'utf8')), def: loadDef(`${dir}.js`), using: loadComponents(json.usingComponents) }
  })
  return out
}

// 用到的组件的样式（递归），按文件去重
function componentCss(components, seen = new Set()) {
  let css = ''
  Object.values(components).forEach((c) => {
    if (seen.has(c.dir)) return
    seen.add(c.dir)
    css += '\n' + fs.readFileSync(`${c.dir}.wxss`, 'utf8') + componentCss(c.using, seen)
  })
  return css
}

const TAGS = { 'movable-area': 'div', 'movable-view': 'div', 'scroll-view': 'div', view: 'div', text: 'span', image: 'img', button: 'button', input: 'input', textarea: 'textarea', canvas: 'canvas' }

function renderNode(node, scope, ctx) {
  if (node.tag === 'block') return renderChildren(node.children, scope, ctx)
  // 组件里的 <slot>：画页面塞进来的那几个节点（按 slot="名字" 分，用页面的数据）
  if (node.tag === 'slot') {
    const s = ctx.slot
    if (!s) return ''
    const name = node.attrs.name || ''
    return renderChildren(s.children.filter((c) => ((c.attrs && c.attrs.slot) || '') === name), s.scope, s.ctx)
  }
  const comp = ctx.components && ctx.components[node.tag]
  if (comp) {
    const props = { ...(comp.props || {}) }
    Object.entries(node.attrs).forEach(([k, v]) => {
      if (!/^(bind|catch|wx:|class$|style$)/.test(k)) props[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = interp(v, scope)
    })
    const inner = renderChildren(comp.ast.children, settledData(comp.def, props), { ...ctx, components: comp.using, slot: { children: node.children, scope, ctx } })
    return `<div class="wx-comp wx-${node.tag} ${esc(interp(node.attrs.class || '', scope))}">${inner}</div>`
  }
  const a = node.attrs
  const tag = TAGS[node.tag] || 'div'
  const cls = `wx-${node.tag} ${interp(a.class || '', scope)}`
  let attrs = ` class="${esc(cls)}"`
  let style = a.style ? rpx(interp(a.style, scope)) : ''
  if (node.tag === 'movable-area') style = 'position:relative;overflow:hidden;' + style
  // 竖着滚的 scroll-view：照常换行（横着滚的才不换行）
  if (node.tag === 'scroll-view' && a['scroll-y']) style = 'overflow-x:hidden;overflow-y:auto;white-space:normal;' + style
  if (node.tag === 'movable-view') {
    const x = Number(interp(a.x, scope)) || 0
    const y = Number(interp(a.y, scope)) || 0
    const k = Number(interp(a['scale-value'], scope)) || 1
    // 和微信一样：x / y 是缩放后的左上角位置
    style = `position:absolute;left:0;top:0;transform-origin:0 0;transform:translate(${x}px,${y}px) scale(${k});` + style
  }
  if (node.tag === 'image') {
    const fit = a.mode === 'aspectFill' ? 'object-fit:cover;' : a.mode === 'widthFix' ? 'height:auto;' : 'object-fit:contain;'
    style = fit + style
  }
  if (style) attrs += ` style="${esc(style)}"`
  if (a.id) attrs += ` id="${esc(a.id)}"`
  Object.keys(a).filter((k) => k.startsWith('data-')).forEach((k) => (attrs += ` ${k}="${esc(interp(a[k], scope))}"`))
  if (node.tag === 'image') {
    const src = ctx.mapSrc(interp(a.src, scope))
    attrs += ` src="${esc(src)}"`
    return `<img${attrs}>`
  }
  if (node.tag === 'input') {
    const value = interp(a.value || '', scope)
    attrs += ` value="${esc(value ?? '')}" placeholder="${esc(interp(a.placeholder || '', scope))}"`
    return `<input${attrs}>`
  }
  if (node.tag === 'textarea') {
    attrs += ` placeholder="${esc(interp(a.placeholder || '', scope))}"`
    return `<textarea${attrs}>${esc(interp(a.value || '', scope) ?? '')}</textarea>`
  }
  if (node.tag === 'button') {
    if (interp(a.disabled, scope)) attrs += ' disabled'
    const loading = interp(a.loading, scope) ? '<span class="btn-loading"></span>' : ''
    return `<button${attrs}>${loading}${renderChildren(node.children, scope, ctx)}</button>`
  }
  return `<${tag}${attrs}>${renderChildren(node.children, scope, ctx)}</${tag}>`
}

const BASE_CSS = `
html, body { margin: 0; }
body { -webkit-font-smoothing: antialiased; }
.wx-text { display: inline; }
.wx-scroll-view { overflow-x: auto; white-space: nowrap; }
button { display: block; position: relative; margin-left: auto; margin-right: auto; padding: 12px 24px; box-sizing: border-box;
  font-size: 17px; text-align: center; line-height: 1.41176471; border-radius: 8px; overflow: hidden; color: #000;
  background-color: #f2f2f2; width: 184px; font-weight: 700; border: none; font-family: inherit; }
button[disabled] { color: rgba(0,0,0,.3); background: #f7f7f7; }
input { display: block; height: 1.4rem; min-height: 1.4rem; font-family: inherit; border: none; background: transparent; outline: none; padding: 0; font-size: inherit; color: inherit; width: 100%; }
textarea { display: block; width: 300px; height: 150px; border: none; font-family: inherit; resize: none; outline: none; color: inherit; }
input::placeholder, textarea::placeholder { color: #b0a89c; }
img { display: inline-block; width: 320px; height: 240px; }
canvas { display: block; width: 300px; height: 150px; }
.btn-loading { display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px; border-radius: 50%; border: 2px solid rgba(255,255,255,.5); border-top-color: #fff; }
.frame { width: 375px; min-height: 812px; display: flex; flex-direction: column; background: var(--bg); }
.status { height: 24px; background: #F6F1E7; display:flex; justify-content: space-between; padding: 4px 20px 0; font: 600 13px -apple-system, sans-serif; color: #000; box-sizing: border-box; }
.nav { height: 44px; background: #F6F1E7; display: flex; align-items: center; justify-content: center; position: relative; font-size: 17px; font-weight: 600; color: #000; }
.nav .back { position: absolute; left: 12px; font-size: 22px; font-weight: 400; }
.nav .capsule { position: absolute; right: 8px; width: 87px; height: 32px; border-radius: 16px; border: 1px solid rgba(0,0,0,.12); background: rgba(255,255,255,.6); display:flex; align-items:center; justify-content: space-around; font-size: 14px; }
.content { flex: 1; }
.tabbar { height: 56px; background: #fff; display: flex; border-top: 1px solid #f0ebe3; padding-bottom: 20px; }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 10px; color: #8A8378; }
.tab img { width: 24px; height: 24px; margin-bottom: 2px; }
.tab.on { color: #4E7D5B; }
`

function pageCss(name, components = {}) {
  const app = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
  const page = fs.readFileSync(path.join(MP, 'pages', name, `${name}.wxss`), 'utf8')
  return rpx(app + '\n' + page + componentCss(components)).replace(/(^|[\s,}])page(?=\s*[{,])/gm, '$1body')
}

function renderPage({ name, data, mapSrc, extraScript = '', tab = null, back = false }) {
  const wxml = fs.readFileSync(path.join(MP, 'pages', name, `${name}.wxml`), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(MP, 'pages', name, `${name}.json`), 'utf8'))
  const components = loadComponents(json.usingComponents)
  const body = renderChildren(parse(wxml).children, data, { mapSrc, components })
  const tabs = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8')).tabBar.list
  const tabbar = tab
    ? `<div class="tabbar">${tabs
        .map((t) => {
          const on = t.pagePath === `pages/${tab}/${tab}`
          return `<div class="tab ${on ? 'on' : ''}"><img src="file://${MP}/${on ? t.selectedIconPath : t.iconPath}">${t.text}</div>`
        })
        .join('')}</div>`
    : ''
  // 自定义导航：内容铺到最上面，状态栏和胶囊按钮浮在上面
  const custom = json.navigationStyle === 'custom'
  const head = custom
    ? `<div class="status status-float"><span>9:41</span><span>●●● 5G ▮</span></div><span class="capsule capsule-float">··· ◉</span>`
    : `<div class="status"><span>9:41</span><span>●●● 5G ▮</span></div>
<div class="nav">${back ? '<span class="back">‹</span>' : ''}${esc(json.navigationBarTitleText)}<span class="capsule">··· ◉</span></div>`
  // （translateZ：页面里 position: fixed 的东西——抽屉、弹层——和真机一样只盖页面这块，不盖底部 tab）
  const customCss = custom ? `.frame{position:relative}.content{flex:none;position:relative;height:${812 - (tab ? 76 : 0)}px;overflow:hidden;transform:translateZ(0)}.screen{height:100%!important;width:375px!important}
.status-float{position:absolute;left:0;right:0;top:0;background:transparent;z-index:999}.capsule-float{position:absolute;top:24px;right:7px;width:87px;height:32px;border-radius:16px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:space-around;font-size:14px;z-index:999}` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}\n${pageCss(name, components)}\n${customCss}</style></head>
<body><div class="frame">${head}
<div class="content">${body}</div>${tabbar}</div>${extraScript}</body></html>`
}

// 单独渲染一个组件（录屏时等一会儿再插进页面用，比如结果页的庆祝）
function renderComponent(ref, props, mapSrc) {
  const tag = path.basename(ref)
  const components = loadComponents({ [tag]: ref })
  const withProps = { [tag]: { ...components[tag], props } }
  const html = renderChildren([{ tag, attrs: {}, children: [] }], {}, { mapSrc, components: withProps })
  return { html, css: rpx(componentCss(components)) }
}

module.exports = { renderPage, renderComponent }
