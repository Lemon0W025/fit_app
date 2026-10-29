// 联动滑杆（components/slider）：slider.wxs 的跟手和落格、组件的气泡文字和事件
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWx, loadComponent } = require('./helpers/page-harness')
const sl = require('../miniprogram/components/slider/slider.wxs')

const DIR = path.join(__dirname, '../miniprogram/components/slider')
const noCloud = () => createWx(async () => ({ ok: true, data: null }))

// 渲染层的假 owner：记下 setStyle、callMethod；轨道从 x = 20 开始、300 宽
function fakeOwner({ rect = { left: 20, width: 300 } } = {}) {
  const styles = {}
  const calls = []
  const state = {}
  return {
    styles,
    calls,
    selectComponent: (sel) => ({
      setStyle: (css) => {
        styles[sel] = css
      },
      getBoundingClientRect: rect && sel === '.sl-track' ? () => ({ left: rect.left, top: 100, width: rect.width, height: 9 }) : undefined,
    }),
    getState: () => state,
    callMethod: (name, arg) => calls.push([name, arg]),
  }
}

function touch(x, range = { min: 10, max: 400, step: 10 }, classes = new Set()) {
  return {
    touches: [{ clientX: x, clientY: 120 }],
    changedTouches: [{ clientX: x, clientY: 120 }],
    currentTarget: { dataset: range },
    instance: { addClass: (c) => classes.add(c), removeClass: (c) => classes.delete(c), classes },
  }
}

test('落格：按 step 取最近的一格、夹在 min～max 里、没有小数误差', () => {
  assert.equal(sl.snap(153, 10, 400, 10), 150)
  assert.equal(sl.snap(156, 10, 400, 10), 160)
  assert.equal(sl.snap(999, 10, 400, 10), 400)
  assert.equal(sl.snap(-5, 10, 400, 10), 10)
  assert.equal(sl.snap(1.37, 0.25, 3, 0.25), 1.25)
  assert.equal(sl.snap(0.1 + 0.2, 0.1, 1, 0.1), 0.3)
  assert.equal(sl.snap(5, 5, 5, 1), 5)
  assert.equal(sl.ratioOf(205, 10, 400), 0.5)
  assert.equal(sl.ratioOf(500, 10, 400), 1)
  assert.equal(sl.ratioOf(3, 3, 3), 0)
  assert.equal(sl.valueAt(20 + 150, 20, 300, 10, 400, 10), 210)
  assert.equal(sl.valueAt(0, 20, 300, 10, 400, 10), 10)
  assert.equal(sl.valueAt(999, 20, 300, 10, 400, 10), 400)
  assert.equal(sl.valueAt(100, 20, 0, 10, 400, 10), 10)
})

test('按住轨道：圆钮跳到手指底下（短过渡）、放大冒气泡、告诉组件新的数；拦住事件不让抽屉和内容区拿到', () => {
  const owner = fakeOwner()
  const classes = new Set()
  const ret = sl.start(touch(20 + 150, undefined, classes), owner)
  assert.equal(ret, false)
  assert.ok(classes.has('sl-on'))
  assert.deepEqual(owner.calls, [['onSlide', { value: 210 }]])
  assert.match(owner.styles['.sl-at'], /translate3d\(50%, 0, 0\); transition: transform 120ms/)
  assert.match(owner.styles['.sl-fill'], /scaleX\(0\.5\); transition: transform 120ms/)
  // 气泡往回挪自己宽度的一半（两头不出轨道），一直带着淡入淡出的过渡
  assert.match(owner.styles['.sl-bubble'], /translate3d\(-50%, 0, 0\); transition: transform 120ms[^;]*, opacity 120ms/)
})

test('拖着走：圆钮跟着手指不落格、没有过渡；数落到新的一格才告诉组件；松手落到整格上、收起气泡、发 onSlideEnd', () => {
  const owner = fakeOwner()
  const classes = new Set()
  sl.start(touch(20 + 150, undefined, classes), owner)
  assert.equal(sl.move(touch(20 + 61, undefined, classes), owner), false)
  // 0.2033 → 10 + 0.2033 × 390 = 89.3 → 90
  assert.match(owner.styles['.sl-at'], /translate3d\(20\.33\d*%, 0, 0\); transition: none/)
  assert.match(owner.styles['.sl-bubble'], /transition: opacity 120ms/)
  assert.deepEqual(owner.calls.at(-1), ['onSlide', { value: 90 }])
  sl.move(touch(20 + 62, undefined, classes), owner)
  assert.equal(owner.calls.length, 2, '同一格里挪不重复告诉')
  sl.move(touch(20 + 300 + 40, undefined, classes), owner)
  assert.deepEqual(owner.calls.at(-1), ['onSlide', { value: 400 }])
  assert.match(owner.styles['.sl-at'], /translate3d\(100%, 0, 0\)/)
  sl.move(touch(20 + 61, undefined, classes), owner)

  assert.equal(sl.end(touch(20 + 61, undefined, classes), owner), false)
  assert.ok(!classes.has('sl-on'))
  assert.deepEqual(owner.calls.at(-1), ['onSlideEnd', { value: 90 }])
  assert.match(owner.styles['.sl-at'], /translate3d\(20\.51\d*%, 0, 0\); transition: transform 120ms/)

  // 松手以后再挪不算
  const n = owner.calls.length
  sl.move(touch(200, undefined, classes), owner)
  sl.end(touch(200, undefined, classes), owner)
  assert.equal(owner.calls.length, n)
})

test('组件改 pos：拖着的时候不管，没拖时带过渡滑过去；第一次（还没有 owner）不出错', () => {
  const owner = fakeOwner()
  sl.sync(0.5, 0, undefined)
  sl.start(touch(20 + 150), owner)
  owner.styles['.sl-at'] = 'kept'
  sl.sync(0.9, 0.5, owner)
  assert.equal(owner.styles['.sl-at'], 'kept')
  sl.end(touch(20 + 150), owner)
  sl.sync(0.9, 0.5, owner)
  assert.match(owner.styles['.sl-at'], /translate3d\(90%, 0, 0\); transition: transform 260ms/)
})

test('量不到轨道就什么都不做', () => {
  const owner = fakeOwner({ rect: null })
  assert.equal(sl.start(touch(100), owner), undefined)
  sl.move(touch(120), owner)
  sl.end(touch(120), owner)
  assert.deepEqual(owner.calls, [])
})

test('组件：值换成位置和气泡里的字（按 step 的小数位，不带多余的 0）', () => {
  const c = loadComponent('slider', noCloud(), { min: 10, max: 400, step: 10, value: 150, unit: ' 克' })
  c.attach()
  assert.equal(c.data.ratio, 0.359)
  assert.equal(c.data.shown, '150')
  c.setData({ value: 400 })
  assert.equal(c.data.ratio, 1)

  const f = loadComponent('slider', noCloud(), { min: 0.25, max: 3, step: 0.25, value: 1.5, prefix: '×' })
  f.attach()
  assert.equal(f.data.shown, '1.5')
  f.setData({ value: 1 })
  assert.equal(f.data.shown, '1')
  f.setData({ value: 0.25 })
  assert.equal(f.data.shown, '0.25')
})

test('组件：拖着的时候数变了发 changing、气泡跟着变、位置交给 wxs；页面这时改值不管；松手发 change、位置对上', () => {
  const c = loadComponent('slider', noCloud(), { min: 10, max: 400, step: 10, value: 150 })
  c.attach()
  c.onSlide({ value: 210 })
  c.onSlide({ value: 210 })
  c.onSlide({ value: 220 })
  assert.deepEqual(c.events, [['changing', { value: 210 }], ['changing', { value: 220 }]])
  assert.equal(c.data.shown, '220')
  assert.equal(c.data.ratio, 0.359, '拖的时候不重设位置（圆钮在 wxs 里跟手）')
  c.setData({ value: 300 })
  assert.equal(c.data.shown, '220')
  c.onSlideEnd({ value: 220 })
  assert.deepEqual(c.events.at(-1), ['change', { value: 220 }])
  assert.equal(c.data.ratio, 0.5385)
  // 松手以后页面再改值照常
  c.setData({ value: 10 })
  assert.equal(c.data.ratio, 0)
  // 再按一次同一个数也发（上一次拖完清掉了）
  c.onSlide({ value: 220 })
  assert.deepEqual(c.events.at(-1), ['changing', { value: 220 }])
})

test('组件 wxml：手势都交给 slider.wxs，位置变化走 change:pos；样式只过渡 transform / opacity', () => {
  const wxml = fs.readFileSync(path.join(DIR, 'slider.wxml'), 'utf8')
  assert.match(wxml, /<wxs module="sl" src="\.\/slider\.wxs">/)
  assert.match(wxml, /change:pos="\{\{sl\.sync\}\}" pos="\{\{ratio\}\}"/)
  for (const ev of ['touchstart="{{sl.start}}"', 'touchmove="{{sl.move}}"', 'touchend="{{sl.end}}"', 'touchcancel="{{sl.end}}"']) {
    assert.ok(wxml.includes(`bind${ev}`), ev)
  }
  const css = fs.readFileSync(path.join(DIR, 'slider.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) assert.ok(m[1] === 'sl' || m[1].startsWith('sl-'), m[1])
  for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
    m[1].split(/,(?![^(]*\))/).forEach((part) => assert.ok(/^(transform|opacity)\b/.test(part.trim()), part))
  }
})
