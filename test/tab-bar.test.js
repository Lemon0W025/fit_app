// 自定义底栏（miniprogram/custom-tab-bar）和便当盒首页的版面字段（docs/superpowers/specs/2026-11-07-ui-bento-design.md）
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createWx } = require('./helpers/page-harness')
const { syncTabBar } = require('../miniprogram/utils/tab-bar')
const { nextMealHero, macroBars } = require('../miniprogram/utils/view')

const MP = path.join(__dirname, '../miniprogram')

// 把底栏组件装起来：Component 的定义拿出来，data / setData 自己接
function loadBar(wx, route) {
  const file = path.join(MP, 'custom-tab-bar/index.js')
  let def = null
  global.wx = wx
  global.Component = (d) => {
    def = d
  }
  global.getCurrentPages = () => (route ? [{ route }] : [])
  delete require.cache[file]
  require(file)
  const bar = {
    ...def.methods,
    data: { selected: '', ...JSON.parse(JSON.stringify(def.data)) },
    setData(patch) {
      Object.assign(this.data, patch)
    },
  }
  def.lifetimes.attached.call(bar)
  return { bar, def }
}

test('底栏：五格（中间是拍照），按当前页面点亮；点别的 tab 切过去，点自己不动，点拍照去打卡页', () => {
  const wx = createWx(async () => ({ ok: true, data: null }))
  const { bar, def } = loadBar(wx, 'pages/camp/camp')
  assert.deepEqual(bar.data.tabs.map((t) => t.key), ['today', 'camp', 'camera', 'weight', 'profile'])
  assert.equal(bar.data.current, 'pages/camp/camp')
  bar.go({ currentTarget: { dataset: { page: 'pages/camp/camp' } } })
  assert.deepEqual(wx.log.nav, [])
  bar.go({ currentTarget: { dataset: { page: 'pages/weight/weight' } } })
  bar.shoot()
  assert.deepEqual(wx.log.nav, [['switchTab', '/pages/weight/weight'], ['navigateTo', '/pages/checkin/checkin']])
  // 页面再显示时按路径重算；页面 onShow 也会直接告诉它
  global.getCurrentPages = () => [{ route: 'pages/today/today' }]
  def.pageLifetimes.show.call(bar)
  assert.equal(bar.data.current, 'pages/today/today')
  syncTabBar({ route: 'pages/profile/profile', getTabBar: () => bar })
  assert.equal(bar.data.current, 'pages/profile/profile')
  syncTabBar({ route: 'pages/today/today' }) // 测试里没有 getTabBar 不报错
  delete global.getCurrentPages
})

test('底栏：app.json 开了自定义，四个 tab 页都在底栏里，onShow 都对一下底栏；图标文件都在', () => {
  const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))
  assert.equal(app.tabBar.custom, true)
  const wx = createWx(async () => ({ ok: true, data: null }))
  const { bar } = loadBar(wx, '')
  const pages = bar.data.tabs.filter((t) => t.page).map((t) => t.page)
  assert.deepEqual(pages, app.tabBar.list.map((t) => t.pagePath))
  pages.forEach((p) => assert.match(fs.readFileSync(path.join(MP, `${p}.js`), 'utf8'), /onShow\(\) \{\n\s+syncTabBar\(this\)/, p))
  bar.data.tabs.filter((t) => t.icon).forEach((t) => {
    ;['', '-off'].forEach((suffix) => assert.ok(fs.existsSync(path.join(MP, 'images/icons', `${t.icon}${suffix}.svg`)), t.icon + suffix))
  })
  assert.ok(fs.existsSync(path.join(MP, 'images/icons/camera-white.svg')))
  // 页面里用到的图标都有文件
  const used = new Set()
  const walk = (dir) => fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.wxml')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\/images\/icons\/([\w-]+)\.svg/g)) used.add(m[1])
  })
  walk(MP)
  assert.ok(used.size > 10)
  used.forEach((n) => assert.ok(fs.existsSync(path.join(MP, 'images/icons', `${n}.svg`)), n))
})

test('nextMealHero：首页黑卡的版面（小标题、超大的时间、右上角胶囊、下面一句、按钮上的字）', () => {
  const base = { mealType: 'lunch', word: '午饭', time: '12:00', window: '11:00～13:00' }
  assert.deepEqual(nextMealHero({ state: 'upcoming', ...base }), { kicker: '下一顿 · 午饭', big: '12:00', pill: '', line: '11:00～13:00 拍算准时', button: '拍午饭' })
  assert.deepEqual(nextMealHero({ state: 'open', ...base, minutesLeft: 40 }), { kicker: '午饭时间到啦', big: '12:00', pill: '还剩 40 分钟', line: '11:00～13:00 拍算准时', button: '拍午饭' })
  assert.deepEqual(nextMealHero({ state: 'missed', ...base }), { kicker: '午饭还没拍', big: '12:00', pill: '过点了', line: '现在补拍也有 5 暖豆', button: '补拍午饭' })
  assert.deepEqual(nextMealHero({ state: 'done', ...base, onTime: true, next: { mealType: 'dinner', word: '晚饭', time: '18:00' } }), { kicker: '下一顿 · 晚饭', big: '18:00', pill: '午饭准时拍了 ✓', line: '', button: '' })
  assert.equal(nextMealHero({ state: 'done', ...base, onTime: false, next: null }).kicker, '午饭拍了 ✓')
  assert.equal(nextMealHero({ state: 'allDone', allOnTime: true }).pill, '全部准时')
  assert.equal(nextMealHero({ state: 'allDone', allOnTime: false }).pill, '')
  assert.equal(nextMealHero(null), null)
})

test('macroBars：三大营养素按每日预算的能量比例给参照克数，进度条最多画满', () => {
  const bars = macroBars({ kcal: 900, carbs: 100, protein: 31, fat: 60.4 }, 1240)
  assert.deepEqual(bars.map((b) => [b.key, b.label, b.got, b.goal]), [['carbs', '碳水', 100, 155], ['protein', '蛋白质', 31, 62], ['fat', '脂肪', 60, 41]])
  assert.deepEqual(bars.map((b) => [b.percent, b.width]), [[65, 65], [50, 50], [146, 100]])
  assert.deepEqual(macroBars({}, 1240).map((b) => b.got), [0, 0, 0])
})
