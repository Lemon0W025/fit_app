// 营地实时录屏：真实的页面逻辑（假云 + 手动时钟 + 真实的宠物走动）驱动，浏览器里只改宠物的样式，CSS 过渡真的在跑，
// Playwright 录成视频再转 MP4 / GIF。用来逐帧看宠物从锅后面、木盖旁、提灯旁、帐篷门口经过时前后对不对、夜里的光对不对。
//
//   node scripts/preview/record-camp.js [场景 ...]      场景：pot-day pot-night tent-night overview-day overview-dusk pit-off-day pit-off-night home-phone home-phone-night panorama-phone panorama-phone-night detail-phone（不写全录）
//   输出到 .preview/camp/<场景>.mp4、.gif，开头一帧存成 <场景>.png（.preview 不进仓库）
//   home-phone*：按手机屏（375×736 + 底部 tab）带着界面录，看一进来的样子（画要盖满屏幕、篝火在正中）
//
// 需要 Playwright 和 ffmpeg（云端环境里都装好了；Playwright 不进 package.json，测试仍然零依赖）。云存储的图换成仓库里 art/ 下的同名文件
const fs = require('fs')
const path = require('path')
const REPO = path.join(__dirname, '..', '..')
const { createFakeCloud, loadCloudFunction } = require(`${REPO}/test/helpers/fake-cloud`)
const { createWx, loadPage, settle } = require(`${REPO}/test/helpers/page-harness`)
const { manualClock } = require(`${REPO}/test/helpers/manual-clock`)
const { renderPage } = require('./wxml-render')
const { SCENE } = require(`${REPO}/miniprogram/utils/shared/camp`)
const V = require(`${REPO}/miniprogram/utils/camp-view`)
const { chromium } = require('playwright')
const { execSync } = require('child_process')

const OUT = path.join(REPO, '.preview', 'camp')
fs.mkdirSync(OUT, { recursive: true })
const WIN = { width: 750, height: 1472 }
const PHONE = { width: 375, height: 736 } // 页面可用的高度（812 的屏去掉底部 tab）
const winOf = (sc) => (sc.phone ? PHONE : WIN)
const snap = (p) => JSON.parse(JSON.stringify(p.data))
const MP = `${REPO}/miniprogram`
const mapSrc = (src) => {
  src = String(src)
  if (src.startsWith('/images/')) return `file://${MP}${src}`
  const m = src.match(/cloud:\/\/.*\/camp\/(base|cut[^/]*)\/(.+)$/)
  if (m) return `file://${REPO}/art/${m[1] === 'base' ? 'camp' : 'cut'}/${m[2]}`
  return src
}

const SCENARIOS = {
  // 白天，镜头对着锅：杞杞从锅后面横穿（被锅身和两条腿挡住）、薯薯从锅前面绕到左边（过木盖时前后要对）、糯糯从提灯右边往下走、花花从三脚架顶后面走过
  'pot-day': {
    hour: 10, potLevel: 2, focus: [SCENE.fire[0], 2560], scale: 1.95, seconds: 14,
    pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan'],
    plan: [
      [0, 0, 1550, 2380], [0, 1, 2550, 3300], [0, 2, 2960, 2560], [0, 3, 1900, 2080],
      [500, 0, 2620, 2380], [500, 1, 1380, 2700], [1000, 2, 2930, 3200], [1500, 3, 2350, 2000],
      [8000, 2, 2960, 2560], [8000, 3, 1900, 2080],
    ],
  },
  // 夜里：从远处暗的地方走到火边亮起来、暖起来；火光一闪一闪照在宠物身上
  'pot-night': {
    hour: 22, potLevel: 3, focus: [SCENE.fire[0], 2800], scale: 1.67, seconds: 12,
    pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan'],
    plan: [
      [0, 0, 1500, 3400], [0, 1, 3450, 3600], [0, 2, 2400, 2150], [0, 3, 2950, 2560],
      [500, 0, 2700, 3300], [500, 1, 2600, 3200], [1000, 2, 1450, 2300], [1000, 3, 2950, 3250],
    ],
  },
  // 夜里帐篷门口：三只走到门口的睡觉点，要盖在门帘上面（不被帐篷挡住）
  'tent-night': {
    hour: 22, potLevel: 1, focus: [1050, 1300], scale: 1.8, seconds: 10,
    pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan'],
    plan: [[0, 0, 1700, 1750], [0, 1, 800, 1850], [0, 2, 1650, 1450], [500, 0, 1210, 1460], [500, 1, 1000, 1530], [500, 2, 1420, 1400]],
  },
  'overview-day': { hour: 10, potLevel: 2, focus: null, scale: null, seconds: 12, pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan', 'lianlian', 'guigui'], plan: [] },
  // 锅是空的（今天还没打卡）：火不烧，盖着熄了火的那块；宠物走过火堆前后、夜里火边也只有月光
  'pit-off-day': {
    hour: 10, potLevel: 0, focus: [SCENE.fire[0], 2700], scale: 1.4, seconds: 8,
    pets: ['qiqi', 'shushu', 'nuonuo', 'huahua'],
    plan: [[0, 0, 1550, 2380], [0, 1, 2550, 3300], [0, 2, 2960, 2560], [500, 0, 2620, 2380], [500, 1, 1380, 2700], [1000, 2, 2930, 3200]],
  },
  'pit-off-night': {
    hour: 22, potLevel: 0, focus: [SCENE.fire[0], 2800], scale: 1.2, seconds: 8,
    pets: ['qiqi', 'shushu', 'nuonuo', 'huahua'],
    plan: [[0, 0, 1500, 3400], [0, 1, 3450, 3600], [0, 2, 2400, 2150], [500, 0, 2700, 3300], [500, 1, 2600, 3200], [1000, 2, 1450, 2300]],
  },
  // 手机上一进来：默认视角、带界面；今天还没打卡（锅是空的，火没点）
  'home-phone': { phone: true, hour: 10, potLevel: 0, focus: null, scale: null, seconds: 4, pets: ['doudou', 'nuonuo', 'qiqi'], plan: [] },
  'home-phone-night': { phone: true, hour: 21, potLevel: 0, focus: null, scale: null, seconds: 4, pets: ['doudou', 'nuonuo', 'qiqi'], plan: [] },
  // 手机上捏到最小：全景（整幅宽度），上下是补出来的天空和草地，看不到边
  'panorama-phone': { phone: true, hour: 10, potLevel: 2, focus: [2048, 2048], scale: 'min', seconds: 4, pets: ['doudou', 'nuonuo', 'qiqi', 'shushu'], plan: [] },
  'panorama-phone-night': { phone: true, hour: 22, potLevel: 2, focus: [2048, 2048], scale: 'min', seconds: 4, pets: ['doudou', 'nuonuo', 'qiqi', 'shushu'], plan: [] },
  // 捏到最大
  'detail-phone': { phone: true, hour: 10, potLevel: 2, focus: [SCENE.fire[0], 2700], scale: 'max', seconds: 4, pets: ['doudou', 'nuonuo', 'qiqi'], plan: [] },
  // 傍晚：大家围着锅坐（马蹄形坐点），整张画叠一层橙
  'overview-dusk': { hour: 18, potLevel: 3, focus: [SCENE.fire[0], 2900], scale: 1.39, seconds: 8, pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan', 'lianlian', 'guigui'], plan: [] },
}

async function build(sc) {
  const cloud = createFakeCloud({ replies: [] })
  const { main: fn } = loadCloudFunction(cloud)
  const wx = createWx(fn)
  wx.getWindowInfo = () => ({ pixelRatio: 1, windowWidth: winOf(sc).width, windowHeight: winOf(sc).height, statusBarHeight: 20 })
  await fn({ action: 'profile.save', data: { nickname: '妈妈', sex: 'female', age: 52, heightCm: 158, weightKg: 70, targetWeightKg: 60, activity: 'light' } })
  const camp = loadPage('camp', wx)
  camp.clock = manualClock()
  camp.hour = () => sc.hour
  let seed = 4242
  camp.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  camp.onLoad()
  camp.onShow()
  await settle()
  camp.closeWelcome()
  const gardens = cloud.db.collections.get('gardens')
  const doc = gardens.get('u1')
  const fedOf = {}
  sc.pets.forEach((id, i) => (fedOf[id] = [9, 16, 5, 3, 8, 2, 4, 1][i] || 3))
  gardens.set('u1', {
    ...doc,
    foods: { xiaomi: 2 },
    bowls: ['kaohongshu', null],
    pets: Object.keys(fedOf).map((id) => ({ id, since: '2026-10-20', fed: fedOf[id], fedToday: { date: '', n: 0 } })),
    decor: { owned: {}, placed: [] },
    gift: '',
  })
  camp.data.giftShown = true
  camp.onShow()
  await settle()
  // 今天打了几顿正餐（锅里几层）：火点没点、锅里的样子、夜里宠物 / 食盆 / 装饰身上的光都跟着它
  const stamps = ['breakfast', 'lunch', 'dinner'].map((meal, i) => ({ meal, state: i < sc.potLevel ? 'green' : 'none' }))
  camp.camp.daily = { ...(camp.camp.daily || {}), stamps, beansToday: sc.potLevel * 10 }
  camp.render(camp.camp, true)
  await settle()
  return camp
}

async function record(name, sc, browser) {
  const camp = await build(sc)
  const L = camp.L
  const life = camp.life
  const night = V.isNight(sc.hour)
  // 夜里也让它们醒着走（录走路的样子）：先把睡觉的叫起来
  const d = snap(camp)
  d.cuts = V.cutoutViews(L, sc.potLevel, require(`${REPO}/miniprogram/config`).cutArt, night)
  d.fx = require(`${REPO}/miniprogram/utils/scene-fx`).fxViews(L, sc.hour, [], sc.potLevel, require(`${REPO}/miniprogram/config`).cutArt)
  const scale = sc.scale === 'min' ? L.minScale : sc.scale === 'max' ? L.maxScale : sc.scale
  d.view = sc.focus ? V.focusOffset(sc.focus[0], sc.focus[1], L, winOf(sc), scale) : V.homeView(L, winOf(sc))
  d.daily = null
  d.termText = ''
  d.peekText = ''
  d.giftReady = false
  d.pets = life.sprites()
  const hideUi = '<style>.hud-res,.hud-today,.hud-notes,.side,.recenter,.checkin-btn,.tabbar,.bubble,.act-emoji,.status-float,.capsule-float{display:none!important}.frame{width:750px!important;min-height:1472px!important}.content{height:1472px!important}.screen{width:750px!important;height:1472px!important}</style>'
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, renderPage({ name: 'camp', data: d, mapSrc, tab: 'camp' }).replace('</head>', `${sc.phone ? '' : hideUi}</head>`))
  const vdir = path.join(OUT, `${name}-video`)
  fs.rmSync(vdir, { recursive: true, force: true })
  const size = sc.phone ? { width: 375, height: 812 } : { width: 750, height: 1472 }
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: sc.phone ? 2 : 1, recordVideo: { dir: vdir, size } })
  const page = await context.newPage()
  const pageStart = Date.now()
  await page.goto(`file://${file}`)
  await page.waitForTimeout(500)
  // 每只宠物的元素按顺序（都没藏起来）
  const apply = async (i, s) => {
    await page.evaluate(({ i, s }) => {
      const pet = document.querySelector(`.pet[data-index="${i}"]`)
      if (!pet) return
      const shadow = pet.previousElementSibling
      pet.style.transitionDuration = `${s.duration}ms`
      pet.style.zIndex = s.z
      pet.style.left = `${s.left}px`
      pet.style.bottom = `${s.bottom}px`
      pet.style.width = `${s.width}px`
      const body = pet.querySelector('.pet-body')
      body.style.height = `${s.width}px`
      body.className = `wx-view pet-body ${s.flip ? 'flip' : ''}`
      const imgs = body.querySelectorAll('img')
      const gait = `${s.cssAction} gait-${s.action === 'walk' || s.action === 'fly' || s.action === 'gift' ? 'on' : 'off'}`
      if (imgs[0]) {
        imgs[0].className = `wx-image pet-img ${gait}`
        imgs[0].style.filter = s.light || 'none'
        imgs[0].style.transition = `filter ${s.duration}ms linear`
      }
      if (imgs[1]) {
        imgs[1].className = `wx-image pet-img moon ${gait}`
        imgs[1].style.filter = s.moonLight
        imgs[1].style.opacity = s.moon
        imgs[1].style.transition = `filter ${s.duration}ms linear, opacity ${s.duration}ms linear`
      }
      shadow.style.transitionDuration = `${s.duration}ms`
      shadow.style.zIndex = s.z - 1
      shadow.style.left = `${s.shadow.left}px`
      shadow.style.bottom = `${s.shadow.bottom}px`
      shadow.style.width = `${s.shadow.width}px`
      shadow.style.height = `${s.shadow.height}px`
    }, { i, s })
  }
  // 初始：每只先瞬移到第一个计划点附近（不录这段）
  const plan = sc.plan.slice()
  const dir = path.join(OUT, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir)
  let last = camp.data.pets.map((p) => JSON.stringify(p))
  const sync = async (jump) => {
    const now = camp.data.pets
    for (let i = 0; i < now.length; i++) {
      const j = JSON.stringify(now[i])
      if (j !== last[i]) {
        last[i] = j
        await apply(i, jump ? { ...now[i], duration: 0 } : now[i])
      }
    }
  }
  // 起点：瞬移（duration 0）
  const starts = {}
  plan.filter((p) => p[0] === 0).forEach(([, i, x, y]) => (starts[i] = [x, y]))
  for (const [i, [x, y]] of Object.entries(starts)) {
    life.goTo(Number(i), x, y, 120000)
  }
  // 快进到都走到起点、停下来（goTo 到了以后歇 6～12 秒，录的时候还在那儿）
  const arrivedAll = () => Object.entries(starts).every(([i, [x, y]]) => {
    const w = life.whereIs()[i]
    return Math.hypot(w.x - x, w.y - y) < 2 && w.action === 'idle'
  })
  for (let t = 0; t < 800 && !arrivedAll(); t++) {
    camp.clock.advance(100)
    Object.entries(starts).forEach(([i, [x, y]]) => {
      const w = life.whereIs()[i]
      if (w.action !== 'walk' && Math.hypot(w.x - x, w.y - y) >= 2) life.goTo(Number(i), x, y, 120000)
    })
  }
  if (!arrivedAll()) console.log(name, '没全走到起点', JSON.stringify(life.whereIs().map((w) => [w.id, w.x | 0, w.y | 0, w.action])))
  // 起点之后都设成 0 时长瞬间到位
  await page.evaluate(() => document.querySelectorAll('.pet,.shadow').forEach((e) => (e.style.transitionDuration = '0ms')))
  last = camp.data.pets.map(() => '')
  await sync(true)
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  const t0 = Date.now()
  const lead = (t0 - pageStart) / 1000
  let clockMs = 0
  const total = sc.seconds * 1000
  const pending = plan.filter((p) => p[0] > 0).sort((a, b) => a[0] - b[0])
  while (clockMs < total) {
    const now = Date.now() - t0
    const dt = now - clockMs
    if (dt > 0) {
      // 先把这段时间里到点的计划发出去
      while (pending.length && pending[0][0] <= now) {
        const [, i, x, y] = pending.shift()
        const ok = life.goTo(i, x, y)
        if (!ok) console.log(name, 'goTo failed', i, x, y)
      }
      camp.clock.advance(dt)
      clockMs = now
      await sync()
    }
    await page.waitForTimeout(30)
  }
  await page.close()
  await context.close()
  const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
  const crop = sc.phone ? 'crop=iw:ih:0:0' : sc.focus ? 'crop=750:1180:0:140' : 'crop=750:1472:0:0'
  execSync(`ffmpeg -loglevel error -y -ss ${lead.toFixed(2)} -i ${vdir}/${webm} -t ${sc.seconds} -vf "${crop}" -c:v libx264 -pix_fmt yuv420p -r 25 ${OUT}/${name}.mp4`)
  execSync(`ffmpeg -loglevel error -y -i ${OUT}/${name}.mp4 -vf "fps=12,scale=375:-1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" ${OUT}/${name}.gif`)
  console.log(name, 'lead', lead.toFixed(2))
  camp.onUnload()
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS)
  const browser = await chromium.launch()
  for (const n of names) await record(n, SCENARIOS[n], browser)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
