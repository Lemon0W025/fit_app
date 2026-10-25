// 极简 WXML → HTML 渲染器：把页面的 wxml + wxss + data 渲染成一张 HTML，在浏览器里预览样式、录屏（scripts/preview/record-camp.js 用）
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

const TAGS = { 'movable-area': 'div', 'movable-view': 'div', 'scroll-view': 'div', view: 'div', text: 'span', image: 'img', button: 'button', input: 'input', textarea: 'textarea', canvas: 'canvas' }

function renderNode(node, scope, ctx) {
  if (node.tag === 'block') return renderChildren(node.children, scope, ctx)
  const a = node.attrs
  const tag = TAGS[node.tag] || 'div'
  const cls = `wx-${node.tag} ${interp(a.class || '', scope)}`
  let attrs = ` class="${esc(cls)}"`
  let style = a.style ? rpx(interp(a.style, scope)) : ''
  if (node.tag === 'movable-area') style = 'position:relative;overflow:hidden;' + style
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

function pageCss(name) {
  const app = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
  const page = fs.readFileSync(path.join(MP, 'pages', name, `${name}.wxss`), 'utf8')
  return rpx(app + '\n' + page).replace(/(^|[\s,}])page(?=\s*[{,])/gm, '$1body')
}

function renderPage({ name, data, mapSrc, extraScript = '', tab = null, back = false }) {
  const wxml = fs.readFileSync(path.join(MP, 'pages', name, `${name}.wxml`), 'utf8')
  const json = JSON.parse(fs.readFileSync(path.join(MP, 'pages', name, `${name}.json`), 'utf8'))
  const body = renderChildren(parse(wxml).children, data, { mapSrc })
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
  const customCss = custom ? `.frame{position:relative}.content{flex:none;position:relative;height:${812 - (tab ? 76 : 0)}px;overflow:hidden}.screen{height:100%!important;width:375px!important}
.status-float{position:absolute;left:0;right:0;top:0;background:transparent;z-index:999}.capsule-float{position:absolute;top:24px;right:7px;width:87px;height:32px;border-radius:16px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:space-around;font-size:14px;z-index:999}` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}\n${pageCss(name)}\n${customCss}</style></head>
<body><div class="frame">${head}
<div class="content">${body}</div>${tabbar}</div>${extraScript}</body></html>`
}

module.exports = { renderPage }
