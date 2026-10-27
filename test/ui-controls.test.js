// 第一批控件（docs/superpowers/specs/2026-10-27-ui-controls-design.md）：弹性抽屉 sheet、环形进度 ring、分段控制器 segmented、商店标签筛选
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createFakeCloud, loadCloudFunction } = require('./helpers/fake-cloud')
const { createWx, loadPage, loadComponent, settle, event, readWxml } = require('./helpers/page-harness')
const { manualClock } = require('./helpers/manual-clock')
const { fixDate } = require('./helpers/fixed-date')
const { CATEGORIES, decorById } = require('../miniprogram/utils/shared/decor')
const drag = require('../miniprogram/components/sheet/sheet.wxs')

const COMP = path.join(__dirname, '../miniprogram/components')
const wxss = (name) => fs.readFileSync(path.join(COMP, name, `${name}.wxss`), 'utf8')
const noCloud = () => createWx(async () => ({ ok: true, data: null }))
const PROFILE = { nickname: '妈妈', sex: 'female', age: 50, heightCm: 160, weightKg: 70, targetWeightKg: 60, activity: 'light' }

// ---------------------------------------------------------------- 样式的规矩

// transition 的每一项（括号里的逗号不算）
const transitions = (css) => [...css.matchAll(/transition:\s*([^;]+);/g)].filter((m) => m[1].trim() !== 'none').flatMap((m) => m[1].split(/,(?![^(]*\))/).map((s) => s.trim()))

test('三个组件：类名都带自己的前缀（预览渲染器没有样式隔离），过渡只动 transform / opacity 和颜色', () => {
  const ALLOWED = new Set(['transform', 'opacity', 'color', 'background-color', 'border-color'])
  const files = { sheet: 'sheet', ring: 'ring', segmented: 'seg' }
  for (const [name, prefix] of Object.entries(files)) {
    const css = wxss(name).replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      assert.ok(m[1] === prefix || m[1].startsWith(`${prefix}-`), `${name}.wxss 的 .${m[1]} 没带 ${prefix}- 前缀`)
    }
    transitions(css).forEach((part) => assert.ok(ALLOWED.has(part.split(/\s+/)[0]), `${name}.wxss 过渡了 ${part}`))
  }
  for (const file of ['pages/shop/shop.wxss', 'app.wxss']) {
    const css = fs.readFileSync(path.join(__dirname, '../miniprogram', file), 'utf8')
    transitions(css).forEach((part) => assert.ok(ALLOWED.has(part.split(/\s+/)[0]), `${file} 过渡了 ${part}`))
  }
})

test('抽屉的时长和曲线按设计：开 420ms 冲过头回弹、遮罩 280ms 淡入，关 260ms；底部留安全区', () => {
  const css = wxss('sheet')
  assert.match(css, /\.sheet-open \.sheet-panel \{[^}]*transition: transform 420ms cubic-bezier\(0\.34, 1\.4, 0\.64, 1\)/)
  assert.match(css, /\.sheet-open \.sheet-mask \{[^}]*transition: opacity 280ms/)
  assert.match(css, /\.sheet-panel \{[^}]*transition: transform 260ms/)
  assert.match(css, /\.sheet-mask \{[^}]*transition: opacity 260ms/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(fs.readFileSync(path.join(COMP, 'sheet', 'sheet.wxml'), 'utf8'), /class="sheet-mask" catchtap="onClose" catchtouchmove="noop"/)
})

// ---------------------------------------------------------------- 弹性抽屉

test('抽屉：show 打开先渲染出关着的样子、下一拍再打开；关的动画放完才不渲染；中途反悔从当前位置掉头', () => {
  const sheet = loadComponent('sheet', noCloud())
  sheet.clock = manualClock()
  sheet.attach()
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [false, false])

  sheet.setData({ show: true })
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [true, false])
  sheet.clock.advance(30)
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [true, true])

  sheet.setData({ show: false })
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [true, false])
  sheet.clock.advance(279)
  assert.equal(sheet.data.rendered, true)
  sheet.clock.advance(1)
  assert.equal(sheet.data.rendered, false)

  // 关到一半又打开：不拿掉，直接打开（CSS 过渡从当前位置弹回来）
  sheet.setData({ show: true })
  sheet.clock.advance(30)
  sheet.setData({ show: false })
  sheet.clock.advance(100)
  sheet.setData({ show: true })
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [true, true])
  sheet.clock.advance(1000)
  assert.deepEqual([sheet.data.rendered, sheet.data.open], [true, true])

  // 刚要打开就关：那一拍的打开取消掉
  sheet.setData({ show: false })
  sheet.clock.advance(1000)
  sheet.setData({ show: true })
  sheet.setData({ show: false })
  sheet.clock.advance(30)
  assert.equal(sheet.data.open, false)
  sheet.clock.advance(1000)
  assert.equal(sheet.data.rendered, false)
  assert.equal(sheet.clock.count(), 0)

  // 一出来就是开着的：也是先渲染、下一拍再打开；监听器先跑过一次的话 attached 不重来（不会同一拍就打开、没有动画）
  const shown = loadComponent('sheet', noCloud(), { show: true, title: '住户' })
  shown.clock = manualClock()
  shown.attach()
  assert.deepEqual([shown.data.rendered, shown.data.open], [true, false])
  shown.clock.advance(30)
  assert.equal(shown.data.open, true)
  shown.detach()
  assert.equal(shown.clock.count(), 0)
  const early = loadComponent('sheet', noCloud())
  early.clock = manualClock()
  early.setData({ show: true })
  early.attach()
  assert.deepEqual([early.data.rendered, early.data.open, early.clock.count()], [true, false, 1])
  early.clock.advance(30)
  assert.equal(early.data.open, true)
})

test('抽屉：点遮罩、点 ✕、往下拉过了都发 close（由页面关）', () => {
  const sheet = loadComponent('sheet', noCloud(), { show: true })
  sheet.clock = manualClock()
  sheet.attach()
  sheet.onClose()
  sheet.dragClose()
  assert.deepEqual(sheet.events, [['close', {}], ['close', {}]])
  const wxml = fs.readFileSync(path.join(COMP, 'sheet', 'sheet.wxml'), 'utf8')
  assert.equal((wxml.match(/catchtap="onClose"/g) || []).length, 2)
})

test('抽屉往下拉：过了面板高度的 1/4、或者往下甩得够快才关', () => {
  assert.equal(drag.shouldClose(100, 400, 0), true)
  assert.equal(drag.shouldClose(99, 400, 0), false)
  assert.equal(drag.shouldClose(40, 400, 0.8), true)
  assert.equal(drag.shouldClose(10, 400, 3), false, '手一抖不算甩')
  assert.equal(drag.shouldClose(-50, 400, 2), false)
  assert.equal(drag.shouldClose(0, 400, 0), false)
  assert.deepEqual([drag.follow(50), drag.follow(-40), drag.follow(-400)], [50, -10, -30])
})

// WXS 的 ownerInstance：记下设的样式和叫的方法
function fakeOwner(height = 400) {
  const state = {}
  const styles = {}
  const calls = []
  return {
    styles,
    calls,
    getState: () => state,
    selectComponent: (sel) => ({ setStyle: (css) => (styles[sel] = css), getBoundingClientRect: () => ({ height }) }),
    callMethod: (name) => calls.push(name),
  }
}
const touch = (x, y, t) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }], timeStamp: t })

test('抽屉往下拉（WXS）：跟手；没拉够、停住了再松手就弹回；拉够了叫 dragClose；往下甩也关', () => {
  const owner = fakeOwner()
  drag.startHead(touch(100, 100, 0), owner)
  assert.equal(drag.move(touch(101, 103, 10), owner), undefined, '还没动够，不抢')
  assert.equal(drag.move(touch(100, 130, 100), owner), false)
  assert.match(owner.styles['.sheet-move'], /translate3d\(0, 30px, 0\); transition: none/)
  drag.move(touch(100, 160, 300), owner)
  assert.match(owner.styles['.sheet-move'], /translate3d\(0, 60px, 0\)/)
  assert.match(owner.styles['.sheet-dim'], /^opacity: 0\.9/)
  drag.end(touch(100, 160, 600), owner)
  assert.deepEqual(owner.calls, [])
  assert.match(owner.styles['.sheet-move'], /translate3d\(0, 0, 0\); transition: transform 320ms/)
  assert.match(owner.styles['.sheet-dim'], /^opacity: 1;/)

  drag.startHead(touch(100, 100, 1000), owner)
  drag.move(touch(100, 160, 1100), owner)
  drag.move(touch(100, 220, 1300), owner)
  drag.end(touch(100, 220, 1600), owner)
  assert.deepEqual(owner.calls, ['dragClose'])

  const flick = fakeOwner()
  drag.startHead(touch(0, 0, 0), flick)
  drag.move(touch(0, 10, 10), flick)
  drag.move(touch(0, 40, 40), flick)
  drag.end(touch(0, 40, 50), flick)
  assert.deepEqual(flick.calls, ['dragClose'])
})

test('抽屉往下拉（WXS）：内容滚着的时候不抢；滚到顶再拉才拖；横着划背包、往上推都不算', () => {
  const owner = fakeOwner()
  drag.scroll({ detail: { scrollTop: 80 } }, owner)
  drag.startBody(touch(50, 100, 0), owner)
  assert.equal(drag.move(touch(50, 200, 100), owner), undefined)
  assert.equal(owner.styles['.sheet-move'], undefined)
  drag.end(touch(50, 200, 400), owner)
  assert.deepEqual(owner.calls, [])

  drag.scroll({ detail: { scrollTop: 0 } }, owner)
  drag.startBody(touch(50, 100, 1000), owner)
  assert.equal(drag.move(touch(52, 140, 1100), owner), false)
  assert.match(owner.styles['.sheet-move'], /translate3d\(0, 40px, 0\)/)
  drag.end(touch(52, 140, 1400), owner)

  const side = fakeOwner()
  drag.startBody(touch(50, 100, 0), side)
  drag.move(touch(90, 104, 50), side)
  assert.equal(drag.move(touch(90, 200, 100), side), undefined, '先横着划了，这一下就不拖抽屉')
  assert.equal(side.styles['.sheet-move'], undefined)

  const up = fakeOwner()
  drag.startHead(touch(50, 100, 0), up)
  assert.equal(drag.move(touch(50, 60, 50), up), undefined)
  assert.equal(up.styles['.sheet-move'], undefined)

  // 每次打开：位置和遮罩归位、不带过渡；内容从顶上开始
  drag.scroll({ detail: { scrollTop: 120 } }, owner)
  drag.onOpen(true, false, owner)
  assert.equal(owner.styles['.sheet-move'], 'transform: translate3d(0, 0, 0); transition: none')
  assert.equal(owner.styles['.sheet-dim'], 'opacity: 1; transition: none')
  assert.equal(owner.getState().scrollTop, 0)
})

// ---------------------------------------------------------------- 环形进度

function ringAt(value, max, more = {}) {
  const ring = loadComponent('ring', noCloud(), { value, max, ...more })
  ring.clock = manualClock()
  ring.attach()
  ring.clock.advance(1000)
  return ring
}

test('圆环：0、1/4、一半、3/4、满都画对（右半边先走、过了一半左半边接着走）', () => {
  const pick = (r) => [r.data.right, r.data.left, r.data.rightOn, r.data.leftOn, r.data.full, r.data.warn]
  assert.deepEqual(pick(ringAt(0, 1000)), [-135, -135, false, false, false, false])
  assert.deepEqual(pick(ringAt(250, 1000)), [-45, -135, true, false, false, false])
  assert.deepEqual(pick(ringAt(500, 1000)), [45, -135, true, false, false, false])
  assert.deepEqual(pick(ringAt(750, 1000)), [45, -45, true, true, false, false])
  assert.deepEqual(pick(ringAt(1000, 1000)), [45, 45, true, true, true, false])
  assert.equal(ringAt(0, 1000).data.sub, '还能吃 1000')
  assert.equal(ringAt(1000, 1000).data.sub, '还能吃 0')
  assert.equal(ringAt(330, 1270).data.percent, 26)
})

test('圆环：超过预算画满、换提醒色、写超了多少；over 也能直接要提醒色；预算是 0 不出错', () => {
  const over = ringAt(1300, 1000)
  assert.deepEqual([over.data.right, over.data.left, over.data.full, over.data.warn, over.data.percent, over.data.sub], [45, 45, true, true, 100, '超了 300'])
  assert.equal(ringAt(500, 1000, { over: true }).data.warn, true)
  const zero = ringAt(300, 0)
  assert.deepEqual([zero.data.shown, zero.data.right, zero.data.full, zero.data.warn, zero.data.sub], [300, -135, false, false, ''])
})

test('圆环：数字和圆环一起先快后慢滚 800ms；新数来了从当前显示的数接着滚（不归零）；页面藏起来跳到最后、不留定时器', () => {
  const ring = loadComponent('ring', noCloud(), { value: 0, max: 1000 })
  ring.clock = manualClock()
  ring.attach()
  ring.setData({ value: 800 })
  ring.clock.advance(200)
  // 先快后慢：四分之一的时间已经走了一大半的一半
  assert.ok(ring.data.shown > 400 && ring.data.shown < 800, String(ring.data.shown))
  // 圆环和数字是同一个进度
  assert.equal(ring.data.right, -135 + 360 * Math.min(ring.data.shown / 1000, 0.5))
  ring.clock.advance(200)
  const mid = ring.data.shown
  assert.ok(mid > 600 && mid < 800, String(mid))

  // 滚到一半来了新数：从 mid 往回滚到 300，一路往下、不跳回 0 也不先跳到 800
  ring.setData({ value: 300 })
  const seen = [ring.data.shown]
  for (let i = 0; i < 25; i++) {
    ring.clock.advance(40)
    seen.push(ring.data.shown)
  }
  assert.equal(seen[0], mid)
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] <= seen[i - 1], seen.join(','))
  assert.equal(seen[seen.length - 1], 300)
  assert.equal(ring.data.sub, '还能吃 700')

  // 同一个数再给一次不重滚
  ring.setData({ value: 300 })
  assert.equal(ring.clock.count(), 0)

  ring.setData({ value: 900 })
  ring.clock.advance(80)
  ring.pageHide()
  assert.equal(ring.data.shown, 900)
  assert.equal(ring.clock.count(), 0)

  ring.setData({ value: 100 })
  ring.detach()
  assert.equal(ring.clock.count(), 0)
})

// ---------------------------------------------------------------- 分段控制器

const MEALS = [
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '晚餐', value: 'dinner' },
  { label: '加餐', value: 'snack' },
]
// 控件在屏幕 (10, 100)，四个选项宽度不一样（字数不同也按量出来的算）
function segWx() {
  const wx = noCloud()
  wx.rects = {
    '.seg': { left: 10, top: 100, right: 310, bottom: 146, width: 300, height: 46 },
    '.seg-opt': [
      { left: 13, right: 85, top: 103, bottom: 143, width: 72, height: 40 },
      { left: 85, right: 160, top: 103, bottom: 143, width: 75, height: 40 },
      { left: 160, right: 235, top: 103, bottom: 143, width: 75, height: 40 },
      { left: 235, right: 307, top: 103, bottom: 143, width: 72, height: 40 },
    ],
  }
  return wx
}
function segWith(wx, value = 'lunch') {
  const seg = loadComponent('segmented', wx, { options: MEALS, value })
  seg.clock = manualClock()
  seg.attach()
  seg.ready()
  return seg
}
// 胶囊盖住 [left, right]：左圆头在 left，中间一段从 left + h/2 拉到 right - h/2，右圆头在 right - h
const pill = (left, right, h = 40) => ({ top: 3, h, l: left, m: left + h / 2, s: Math.round(((right - left - h) / 100) * 10000) / 10000, r: right - h })

test('分段控制器：量好了胶囊直接放在选中的那项上（不动画）；点别的发 change，点选中的不发', () => {
  const seg = segWith(segWx())
  assert.deepEqual([seg.data.ready, seg.data.phase, seg.data.active], [true, 0, 1])
  assert.deepEqual(seg.data.pill, pill(75, 150))
  seg.onTap(event({ index: 1 }))
  assert.deepEqual(seg.events, [])
  seg.onTap(event({ index: 2 }))
  assert.deepEqual(seg.events, [['change', { value: 'dinner' }]])
  assert.equal(seg.data.active, 2)
})

test('分段控制器：胶囊先朝移动方向拉长盖住旧的到新的，再收到新选项的宽度；往左也一样', () => {
  const seg = segWith(segWx())
  seg.onTap(event({ index: 3 }))
  assert.equal(seg.data.phase, 1)
  assert.deepEqual(seg.data.pill, pill(75, 297))
  seg.clock.advance(129)
  assert.equal(seg.data.phase, 1)
  seg.clock.advance(1)
  assert.equal(seg.data.phase, 2)
  assert.deepEqual(seg.data.pill, pill(225, 297))

  seg.onTap(event({ index: 0 }))
  assert.deepEqual(seg.data.pill, pill(3, 297))
  seg.clock.advance(130)
  assert.deepEqual(seg.data.pill, pill(3, 75))
  assert.equal(seg.clock.count(), 0)
})

test('分段控制器：连着快点总是转向最新的目标（不排队、不先回到旧的）；页面改 value 也会滑过去', () => {
  const seg = segWith(segWx(), 'breakfast')
  seg.onTap(event({ index: 3 }))
  seg.clock.advance(50)
  seg.onTap(event({ index: 1 }))
  // 第一段还在伸：目标还是盖住 0～3 的那块，接着收到 1
  assert.deepEqual([seg.data.phase, seg.data.pill], [1, pill(3, 297)])
  seg.clock.advance(130)
  assert.deepEqual([seg.data.phase, seg.data.pill], [2, pill(75, 150)])
  assert.deepEqual(seg.events.map((e) => e[1].value), ['snack', 'lunch'])
  assert.equal(seg.clock.count(), 0)

  // 页面改了 value（比如带着餐次进来）：滑过去，不发 change
  seg.setData({ value: 'dinner' })
  assert.deepEqual([seg.data.active, seg.data.phase], [2, 1])
  seg.clock.advance(130)
  assert.deepEqual(seg.data.pill, pill(150, 225))
  assert.equal(seg.events.length, 2)
  seg.detach()
  assert.equal(seg.clock.count(), 0)
})

test('分段控制器：量不到位置时选中的那项自己带底色，点了照样换、照样发 change', () => {
  const seg = segWith(noCloud())
  assert.equal(seg.data.ready, false)
  seg.onTap(event({ index: 0 }))
  assert.deepEqual([seg.data.active, seg.data.phase, seg.data.ready], [0, 0, false])
  assert.deepEqual(seg.events, [['change', { value: 'breakfast' }]])
  assert.match(wxss('segmented'), /\.seg-on \{[^}]*background: var\(--primary/)
  assert.match(wxss('segmented'), /\.seg-ready \.seg-on \{[^}]*background: transparent/)
})

test('分段控制器：一开始没显示出来（在关着的抽屉里，量到 0 宽）不算量好；手指碰到时再量，第一下就能滑', () => {
  const wx = segWx()
  const shown = wx.rects
  wx.rects = { '.seg': { ...shown['.seg'], width: 0, right: 10 }, '.seg-opt': shown['.seg-opt'].map((r) => ({ ...r, left: 0, right: 0, width: 0 })) }
  const seg = segWith(wx, 'breakfast')
  assert.equal(seg.data.ready, false)
  wx.rects = shown
  seg.onTouch()
  assert.deepEqual([seg.data.ready, seg.data.phase, seg.data.pill], [true, 0, pill(3, 75)])
  seg.onTap(event({ index: 1 }))
  assert.deepEqual([seg.data.phase, seg.data.pill], [1, pill(3, 150)])
  // 量好了以后再碰不重量
  wx.rects = {}
  seg.onTouch()
  assert.equal(seg.data.ready, true)
})

// ---------------------------------------------------------------- 页面

test('打卡页：这是哪一餐用分段控制器，换餐次跟着说准不准时', (t) => {
  fixDate(t, '2026-10-22T12:10:00+08:00')
  const wx = segWx()
  const checkin = loadPage('checkin', wx)
  checkin.onLoad({})
  assert.match(readWxml('checkin'), /<segmented options="\{\{mealTypes\}\}" value="\{\{mealType\}\}" bindchange="pickMealType" \/>/)
  const seg = segWith(wx, checkin.data.mealType)
  assert.equal(seg.data.active, 1)
  seg.onTap(event({ index: 2 }))
  checkin.pickMealType(event({}, seg.events.pop()[1]))
  assert.equal(checkin.data.mealType, 'dinner')
  assert.equal(checkin.data.timingText, '还没到晚饭时间（17:00～19:00），提前拍也算数')
  checkin.pickMealType(event({}, { value: 'lunch' }))
  assert.equal(checkin.data.timingText, '现在拍午饭：准时 ✓')
})

test('我的页：性别用分段控制器，换了预算跟着变；活动量的小块按下有反馈', async () => {
  const profile = loadPage('profile', createWx(async () => ({ ok: true, data: null })))
  profile.onShow()
  await settle()
  for (const [field, value] of Object.entries({ age: '50', heightCm: '160', weightKg: '70', targetWeightKg: '60' })) profile.onInput(event({ field }, { value }))
  const female = profile.data.previewKcal
  const wxml = readWxml('profile')
  assert.match(wxml, /<segmented options="\{\{sexOptions\}\}" value="\{\{form\.sex\}\}" data-field="sex" bindchange="onSegment" \/>/)
  assert.match(wxml, /class="chip [^"]*" hover-class="chip-press"/)
  assert.deepEqual(profile.data.sexOptions.map((o) => o.value), ['female', 'male'])
  profile.onSegment(event({ field: 'sex' }, { value: 'male' }))
  assert.equal(profile.data.form.sex, 'male')
  assert.ok(profile.data.previewKcal > female)
})

test('营地背包：两个抽屉换成 sheet（点遮罩 / ✕ / 往下拉都由页面关），食物 / 装饰换成分段控制器', () => {
  const wxml = readWxml('camp')
  assert.match(wxml, /<sheet show="\{\{bagOpen\}\}" bindclose="closeBag">/)
  assert.match(wxml, /<sheet show="\{\{residentsOpen\}\}" title="住户[^"]*" bindclose="closeResidents">/)
  assert.match(wxml, /<view slot="head" class="bag-tabs">\s*<segmented options="\{\{bagTabs\}\}" value="\{\{bagTab\}\}" bindchange="switchBag" \/>/)
  assert.doesNotMatch(wxml, /drawer/)
  // 食物、装饰两页都在、叠在一起（抽屉高度不随切换跳），只换显示哪页
  assert.match(wxml, /class="bag-pane \{\{bagTab === 'food' \? 'bag-pane-on' : ''\}\}"/)
  assert.match(wxml, /class="bag-pane \{\{bagTab === 'decor' \? 'bag-pane-on' : ''\}\}"/)
  assert.doesNotMatch(wxml, /wx:if="\{\{bagTab/)
  const camp = loadPage('camp', noCloud())
  const sheet = loadComponent('sheet', noCloud(), { show: camp.data.bagOpen })
  sheet.clock = manualClock()
  sheet.attach()
  // 页面开：抽屉跟着开
  camp.openBag()
  sheet.setData({ show: camp.data.bagOpen })
  sheet.clock.advance(30)
  assert.equal(sheet.data.open, true)
  // 切到装饰
  const seg = loadComponent('segmented', noCloud(), { options: camp.data.bagTabs, value: camp.data.bagTab })
  seg.attach()
  seg.onTap(event({ index: 1 }))
  camp.switchBag(event({}, seg.events.pop()[1]))
  assert.equal(camp.data.bagTab, 'decor')
  // 点遮罩：抽屉发 close → 页面关 → 抽屉收起来
  sheet.onClose()
  assert.deepEqual(sheet.events.pop(), ['close', {}])
  camp.closeBag()
  sheet.setData({ show: camp.data.bagOpen })
  sheet.clock.advance(280)
  assert.equal(sheet.data.rendered, false)
  camp.openResidents()
  assert.equal(camp.data.residentsOpen, true)
  camp.closeResidents()
  assert.equal(camp.data.residentsOpen, false)
})
