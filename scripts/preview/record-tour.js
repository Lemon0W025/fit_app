// 新手导览、使用说明、「我的」的截图：每一步一张（.preview/tour/<场景>-<第几步>.png）。
// 页面用真实页面逻辑算出数据渲染成 HTML；导览组件的位置要量页面里的节点，所以先在浏览器里量好目标的位置，
// 再交给组件自己的 place() 算圈和卡片，渲染出来盖在页面那一块上（和真机一样只盖页面，不盖导航栏和底部 tab）。
//
//   node scripts/preview/record-tour.js [today | manual | gacha | profile]（不写全拍）
// 需要 Playwright（云端环境里装好了）
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const REPO = path.join(__dirname, '..', '..')
const { createFakeCloud, loadCloudFunction } = require(`${REPO}/test/helpers/fake-cloud`)
const { createWx, loadPage, loadComponent, settle } = require(`${REPO}/test/helpers/page-harness`)
const { manualClock } = require(`${REPO}/test/helpers/manual-clock`)
const { fixDate } = require(`${REPO}/test/helpers/fixed-date`)
const { analysisJson } = require(`${REPO}/test/helpers/fake-repo`)
const { renderPage, renderComponent } = require('./wxml-render')
const { TOURS } = require(`${REPO}/miniprogram/utils/tours`)

const OUT = path.join(REPO, '.preview', 'tour')
fs.mkdirSync(OUT, { recursive: true })
const MP = `${REPO}/miniprogram`
const mapSrc = (src) => (String(src).startsWith('/images/') ? `file://${MP}${src}` : String(src))
const snap = (p) => JSON.parse(JSON.stringify(p.data))
const T = { after() {} }
const PROFILE = { nickname: '妈妈', sex: 'female', age: 52, heightCm: 158, weightKg: 70, targetWeightKg: 60, activity: 'light' }
// 页面那一块（导航栏下面、tab 上面）：状态栏 24 + 导航 44，tab 76
const TOP = 68
const TAB = 76
const H = 812 - TOP - TAB

async function todayData() {
  const clock = fixDate(T, '2026-11-01T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: [analysisJson({ totalKcal: 420 })] })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: PROFILE })
  clock.set('2026-11-01T07:40:00+08:00')
  await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥、鸡蛋' } })
  clock.set('2026-11-01T11:20:00+08:00')
  const page = loadPage('today', createWx(main))
  page.clock = manualClock()
  page.onShow()
  await settle()
  page.clock.advance(1000)
  const data = { ...snap(page), tourShow: false }
  page.onHide()
  return data
}

// 页面渲染成一个固定高度、能滚的「屏幕」，上面盖一层放导览（量的位置都相对这一层）
function pageHtml(name, data, tab) {
  const html = renderPage({ name, data, mapSrc, tab, back: !tab })
  const css = `<style>.content{flex:none;height:${H + (tab ? 0 : TAB)}px;overflow-y:auto}.tour-layer{position:absolute;left:0;top:${TOP}px;width:375px;height:${H + (tab ? 0 : TAB)}px;transform:translateZ(0);pointer-events:none}.frame{position:relative}</style>`
  return html.replace('</head>', `${css}</head>`).replace('</body>', '<div class="tour-layer"></div></body>')
}

async function shootTour(browser, name, data, steps, tab) {
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, pageHtml(name === 'camp' ? 'camp' : 'today', data, tab))
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(1500)
  const { css } = renderComponent('/components/tour/tour', {}, mapSrc)
  await page.addStyleTag({ content: css })
  for (let k = 0; k < steps.length; k++) {
    const step = steps[k]
    const rect = !step.selector
      ? null
      : await page.evaluate(({ sel, scroll }) => {
          const el = document.querySelector(sel)
          if (!el) return null
          const content = document.querySelector('.content')
          if (scroll) content.scrollTop = el.offsetTop - 120
          const r = el.getBoundingClientRect()
          const c = document.querySelector('.tour-layer').getBoundingClientRect()
          return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height }
        }, { sel: step.selector, scroll: !!step.scroll })
    const wx = createWx(async () => ({ ok: true, data: null }))
    wx.getWindowInfo = () => ({ windowWidth: 375, windowHeight: H })
    const tour = loadComponent('tour', wx, { steps, show: true })
    const last = k + 1 >= steps.length
    tour.setData({ i: k, step, last, nextText: last ? step.done || '知道了' : '下一步' })
    tour.place(rect)
    const { html } = renderComponent('/components/tour/tour', tour.data, mapSrc)
    await page.evaluate((h) => {
      document.querySelector('.tour-layer').innerHTML = h
    }, html)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, `${name}-${k + 1}.png`) })
    console.log(`${name}-${k + 1}`, rect ? 'ok' : '(没圈)')
  }
  await page.close()
}

async function shootPage(browser, name, data, opts = {}) {
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, renderPage({ name: opts.page || name, data, mapSrc, tab: opts.tab || null, back: !opts.tab }))
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  console.log(name, 'ok')
  await page.close()
}

const SCENES = {
  async today(browser) {
    await shootTour(browser, 'today', await todayData(), TOURS.today, 'today')
  },
  async manual(browser) {
    const wx = createWx(async () => ({ ok: true, data: null }))
    const page = loadPage('manual', wx)
    page.onLoad()
    await shootPage(browser, 'manual', snap(page))
  },
  // 扭蛋页：单抽、十连并排的两个大按钮（暖豆够 / 十连不够两张）
  async gacha(browser) {
    const view = { beans: 650, spinCost: 30, spinMany: 10, spinManyCost: 300, pityLeft: 6, rates: [{ id: 'common', label: '普通', weight: 65 }, { id: 'rare', label: '稀有', weight: 25 }, { id: 'epic', label: '珍稀', weight: 8 }, { id: 'legendary', label: '传说', weight: 2 }], term: null }
    for (const [name, beans] of [['gacha', 650], ['gacha-poor', 120]]) {
      const wx = createWx(async () => ({ ok: true, data: { ...view, beans } }))
      const page = loadPage('gacha', wx)
      page.onShow()
      await settle()
      await shootPage(browser, name, snap(page), { page: 'gacha' })
    }
  },
  async profile(browser) {
    config().testReset = { until: '2999-12-31' }
    const cloud = createFakeCloud()
    const { main } = loadCloudFunction(cloud)
    await main({ action: 'profile.save', data: PROFILE })
    const page = loadPage('profile', createWx(main))
    page.onLoad()
    page.onShow()
    await settle()
    config().testReset = null
    await shootPage(browser, 'profile', snap(page), { tab: 'profile' })
  },
}

function config() {
  return require(`${REPO}/cloudfunctions/api/config`)
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES)
  const browser = await chromium.launch()
  for (const n of names) await SCENES[n](browser)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
