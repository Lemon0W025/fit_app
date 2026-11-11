// 亲友看板的截图（.preview/family/<场景>.png，整页）：页面用真实页面逻辑 + 假的云函数算出数据，渲染成 HTML 截图。
//
//   node scripts/preview/record-family.js [场景 ...]（不写全拍）
//   join：带着邀请码打开（先问称呼）   board：看板（两位亲友，一位拍了两顿、一位还没拍；开着「提醒我」）
//   empty：还没关注任何人             expired：邀请过期了
//   profile：「我的」页的亲友看板那块（邀请按钮、谁在看我、我关注的亲友）
//   today：被赞的人的今日页（新来的赞提示一次、每顿下面「❤ 红红 赞了」）   meal：结果页上的赞
// 需要 Playwright（云端环境里装好了）
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const REPO = path.join(__dirname, '..', '..')
const { createFakeCloud, loadCloudFunction } = require(`${REPO}/test/helpers/fake-cloud`)
const { createWx, loadPage, settle } = require(`${REPO}/test/helpers/page-harness`)
const { manualClock } = require(`${REPO}/test/helpers/manual-clock`)
const { fixDate } = require(`${REPO}/test/helpers/fixed-date`)
const { analysisJson } = require(`${REPO}/test/helpers/fake-repo`)
const { renderPage } = require('./wxml-render')

const OUT = path.join(REPO, '.preview', 'family')
fs.mkdirSync(OUT, { recursive: true })
const MP = `${REPO}/miniprogram`
const PHOTO = '/images/camp/family.jpg' // 假的云函数里没有真的照片，用包里的图顶一下
const mapSrc = (src) => (String(src).startsWith('/images/') ? `file://${MP}${src}` : String(src))
const snap = (p) => JSON.parse(JSON.stringify(p.data))
const T = { after() {} }
const config = require(`${REPO}/cloudfunctions/api/config`)
const profileOf = (nickname) => ({ nickname, sex: 'female', age: 52, heightCm: 158, weightKg: 70, targetWeightKg: 60, activity: 'light' })

// 小明（拍了午饭、晚饭）和老爸（今天还没拍）都邀请了红红；老王也关注了小明、给午饭点过赞
async function world() {
  config.remindTemplate = { id: 'tmpl', state: 'trial', fields: { meal: 'thing1', mealTime: 'time2', tip: 'thing3' } }
  const clock = fixDate(T, '2026-11-08T12:05:00+08:00')
  // 前两天各拍了一顿午饭（连续打卡 3 天），今天拍了午饭（有照片）和晚饭（过了点、只写了字）
  const MEALS = [
    ['08', '12:05', { mealType: 'lunch', note: '家常菜' }, { totalKcal: 480 }],
    ['09', '12:10', { mealType: 'lunch', note: '家常菜' }, { totalKcal: 450 }],
    ['10', '12:10', { mealType: 'lunch', fileID: 'cloud://env/meals/lunch.jpg' }, { totalKcal: 520, comment: '荤素搭配得好，米饭的量也合适，青菜再多夹两筷子就更好了。' }],
    ['10', '19:40', { mealType: 'dinner', note: '红烧肉、米饭、炒青菜' }, { totalKcal: 610, rating: 'yellow', comment: '红烧肉有点多，油也偏重，明天早饭清淡一点，多喝水。' }],
  ]
  const cloud = createFakeCloud({ openid: 'ming', replies: MEALS.map((m) => analysisJson(m[3])) })
  const { main } = loadCloudFunction(cloud)
  const as = (openid, action, data) => {
    cloud.setOpenid(openid)
    return main({ action, data })
  }
  const phone = (openid, patch) => createWx(async (req) => {
    cloud.setOpenid(openid)
    const res = await main(req)
    if (patch && res.ok) patch(req, res.data)
    return res
  })
  await as('ming', 'profile.save', profileOf('小明'))
  await as('dad', 'profile.save', profileOf('老爸'))
  for (const [day, hhmm, input] of MEALS) {
    clock.set(`2026-11-${day}T${hhmm}:00+08:00`)
    await as('ming', 'meal.analyze', input)
  }
  const today = (await as('ming', 'day.get')).data.meals
  const lunch = today.find((m) => m.mealType === 'lunch')
  const ming = (await as('ming', 'family.invite')).data.code
  const dad = (await as('dad', 'family.invite')).data.code
  await as('wang', 'family.accept', { code: ming, name: '老王' })
  await as('wang', 'family.like', { owner: 'ming', mealId: lunch._id })
  clock.set('2026-11-10T19:50:00+08:00')
  return { cloud, as, phone, codes: { ming, dad }, lunch, clock }
}

// 亲友页：打卡照片换成包里的图
const withPhotos = (req, data) => {
  if (req.action !== 'family.get') return
  data.people.forEach((p) => p.meals.forEach((m) => {
    if (m.photoUrl) m.photoUrl = PHOTO
  }))
}

async function familyPage(wx, options) {
  const page = loadPage('family', wx)
  page.onLoad(options || {})
  page.onShow()
  await settle()
  return page
}

const SCENES = {
  async join() {
    const w = await world()
    const page = await familyPage(w.phone('hong', withPhotos), { code: w.codes.ming })
    return { page: 'family', data: snap(page) }
  },
  async board() {
    const w = await world()
    await w.as('hong', 'family.accept', { code: w.codes.ming, name: '红红' })
    w.clock.set('2026-11-10T19:51:00+08:00')
    await w.as('hong', 'family.accept', { code: w.codes.dad, name: '红红' })
    await w.as('hong', 'remind.subscribed', { accepted: true })
    await w.as('hong', 'remind.subscribed', { accepted: true })
    await w.as('hong', 'family.setNotify', { owner: 'ming', on: true })
    await w.as('hong', 'family.like', { owner: 'ming', mealId: w.lunch._id })
    const page = await familyPage(w.phone('hong', withPhotos))
    return { page: 'family', data: snap(page) }
  },
  async empty() {
    const w = await world()
    const page = await familyPage(w.phone('nobody'))
    return { page: 'family', data: snap(page) }
  },
  async expired() {
    const w = await world()
    const page = await familyPage(w.phone('hong'), { code: 'ZZZZZZZZZZ' })
    return { page: 'family', data: snap(page) }
  },
  async profile() {
    const w = await world()
    await w.as('hong', 'family.accept', { code: w.codes.ming, name: '红红' })
    await w.as('ming', 'family.accept', { code: w.codes.dad })
    const page = loadPage('profile', w.phone('ming'))
    page.onLoad()
    page.onShow()
    await settle()
    return { page: 'profile', data: snap(page), tab: 'profile' }
  },
  async today() {
    const w = await world()
    await w.as('hong', 'family.accept', { code: w.codes.ming, name: '红红' })
    await w.as('hong', 'family.like', { owner: 'ming', mealId: w.lunch._id })
    const wx = w.phone('ming', (req, data) => {
      if (req.action === 'day.get') data.meals.forEach((m) => {
        if (m.fileID) m.fileID = PHOTO
      })
    })
    wx.storage.toursSeen = { today: true }
    const page = loadPage('today', wx)
    page.clock = manualClock()
    page.onShow()
    await settle()
    page.clock.advance(1000)
    const data = { ...snap(page), tourShow: false }
    page.onHide()
    return { page: 'today', data, tab: 'today' }
  },
  async meal() {
    const w = await world()
    await w.as('hong', 'family.accept', { code: w.codes.ming, name: '红红' })
    await w.as('hong', 'family.like', { owner: 'ming', mealId: w.lunch._id })
    const wx = w.phone('ming', (req, data) => {
      if (req.action === 'meal.get' && data.fileID) data.fileID = PHOTO
    })
    const page = loadPage('meal', wx)
    page.clock = manualClock()
    page.onLoad({ id: w.lunch._id })
    await settle()
    page.clock.advance(5000)
    return { page: 'meal', data: snap(page) }
  },
}

async function shoot(browser, name) {
  const sc = await SCENES[name]()
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, renderPage({ name: sc.page, data: sc.data, mapSrc, tab: sc.tab || null, back: !sc.tab }))
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
  console.log(name, 'ok')
  await page.close()
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES)
  const browser = await chromium.launch()
  for (const n of names) await shoot(browser, n)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
