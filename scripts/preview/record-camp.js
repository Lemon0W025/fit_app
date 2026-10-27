// 营地实时录屏：真实的页面逻辑（假云 + 手动时钟 + 真实的宠物走动）驱动，浏览器里只改宠物的样式，CSS 过渡真的在跑，
// Playwright 录成视频再转 MP4 / GIF。用来逐帧看宠物从锅后面、木盖旁、提灯旁、帐篷门口经过时前后对不对、夜里的光对不对。
//
//   node scripts/preview/record-camp.js [场景 ...]      场景：pot-day pot-night tent-night overview-day overview-dusk pit-off-day pit-off-night decor-day decor-night decor2-day decor2-night all-pets-phone home-phone home-phone-night panorama-phone panorama-phone-night detail-phone pot-cook night-lit night-lamps naps facing walks（不写全录）
//   potLevel：锅里煮着几样（种进今天的锅里，火点没点、夜里的光都跟着它）；visitors：客人；events：[毫秒, (life) => …] 录的时候到点调
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
const { dateKey } = require(`${REPO}/miniprogram/utils/shared/date`)
const V = require(`${REPO}/miniprogram/utils/camp-view`)
const { placeProblem } = require(`${REPO}/miniprogram/utils/shared/decor`)
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
  // 宠物拼图页面会先下到本地（假的 wx.cloud.downloadFile 给的是 wxfile://tmp/<文件名>）
  if (src.startsWith('wxfile://tmp/')) return `file://${REPO}/art/anim/${src.slice('wxfile://tmp/'.length)}`
  const m = src.match(/cloud:\/\/.*\/camp\/(base|cut|decor|anim)(-v\d+)?\/(.+)$/)
  if (m) return `file://${REPO}/art/${m[1] === 'base' ? 'camp' : m[1]}/${m[3]}`
  return src
}

// 按想放的位置一件件摆（和游戏里一样过 placeProblem）：放不下就在附近一圈圈往外找（装饰 10/26 放大了 2.5 倍，以前的位置挤）
function layout(list, prefix) {
  const placed = []
  list.forEach(([id, x, y]) => {
    for (let r = 0; r <= 2000; r += 50) {
      const n = r ? Math.ceil((2 * Math.PI * r) / 50) : 1
      for (let i = 0; i < n; i++) {
        const px = Math.round(x + r * Math.cos((2 * Math.PI * i) / n))
        const py = Math.round(y + r * Math.sin((2 * Math.PI * i) / n))
        if (!placeProblem(placed, id, px, py)) {
          placed.push({ uid: `${prefix}${placed.length}`, id, x: px, y: py })
          return
        }
      }
    }
    console.warn(`  ${id} 摆不下`)
  })
  return placed
}
// 第 1 批 B 画好的装饰（小帐篷、小树 10/27 下架了，换成秋千、向日葵），摆在火堆周围的草地上
const DECOR_1B = layout([['swing', 3300, 2150], ['strawbed', 2600, 3700], ['picnic', 1300, 3400], ['ball', 3000, 3400],
  ['flowerbed', 1100, 2600], ['sunflower', 3700, 2800], ['windmill', 3650, 3500], ['lantern', 1850, 3750]], 'd')
// 第 2 批的 17 件
const DECOR_2 = layout([['hammock', 3350, 2300], ['lights', 2850, 2200], ['clothesline', 3800, 2500], ['treehouse', 3700, 2950], ['gold_swing', 3450, 3450],
  ['ladder', 3850, 3700], ['mailbox', 3050, 3750], ['kettle', 2600, 3550], ['fence', 2350, 3950], ['pumpkins', 2000, 3700], ['sunflower', 1650, 3800],
  ['stonelamp', 1250, 3850], ['table', 1500, 3300], ['slide', 850, 3450], ['swing', 1050, 2750], ['scarecrow', 600, 3050], ['bunting', 1600, 2400]], 'e')
const PETS_2 = ['huahua', 'guigui', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'chacha', 'hehe']
// 夜里的灯：两盏小灯笼、一个石灯笼、一串灯，宠物有的站在灯边、有的站得远
const LAMPS = layout([['lantern', 1500, 3300], ['lantern', 3300, 3500], ['stonelamp', 2700, 3700], ['lights', 3200, 2300]], 'l')
const POT_FOODS = ['xiaomi', 'huluobo', 'kaohongshu']
const PLAN_2 = [[0, 0, 1300, 3000], [0, 1, 2200, 3500], [0, 2, 3300, 2650], [0, 3, 1800, 3550], [0, 4, 2850, 3500], [0, 5, 1100, 3600], [0, 6, 3550, 3200], [0, 7, 2500, 2300],
  [3000, 0, 2000, 3300], [3000, 2, 2700, 2500], [3000, 4, 3300, 3900], [3000, 6, 1500, 2700], [3000, 7, 3600, 2350]]

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
  // 第 1 批 B 的装饰和四只有逐帧动画的宠物：在装饰中间走来走去（装饰要像长在草上、宠物走到装饰后面被挡住）
  'decor-day': {
    hour: 10, potLevel: 2, focus: [2450, 2950], scale: 1.1, seconds: 12, decor: DECOR_1B,
    pets: ['doudou', 'nuonuo', 'lianlian', 'shishi'],
    plan: [[0, 0, 2550, 3300], [0, 1, 1700, 3400], [0, 2, 3150, 2500], [0, 3, 2200, 3700],
      [500, 0, 2950, 3500], [500, 1, 1350, 3050], [1500, 2, 2600, 2200], [1500, 3, 3300, 3600]],
  },
  'decor-night': {
    hour: 22, potLevel: 2, focus: [2450, 2950], scale: 1.1, seconds: 10, decor: DECOR_1B,
    pets: ['doudou', 'nuonuo', 'lianlian', 'shishi'],
    plan: [[0, 0, 2550, 3300], [0, 1, 1700, 3400], [0, 2, 3150, 2500], [0, 3, 2200, 3700],
      [500, 0, 2950, 3500], [500, 1, 1350, 3050], [1500, 2, 2600, 2200], [1500, 3, 3300, 3600]],
  },
  // 第 2 批的 17 件装饰和 8 只宠物：拉远看一大片（白天录早上 8 点，鹤鹤只在 5～9 点在）
  'decor2-day': { hour: 8, potLevel: 2, focus: [2250, 3150], scale: 0.85, seconds: 10, decor: DECOR_2, pets: PETS_2, plan: PLAN_2 },
  'decor2-night': { hour: 22, potLevel: 2, focus: [2250, 3150], scale: 0.85, seconds: 8, decor: DECOR_2, pets: PETS_2, plan: PLAN_2 },
  // 橘团、茶茶侧面走路（第 4 批重画的走路）：拉近，在空草地上左右来回走
  walks: {
    hour: 10, potLevel: 2, focus: [2600, 3550], scale: 2.4, seconds: 10, pets: ['jutuan', 'chacha'],
    plan: [[0, 0, 2250, 3450], [0, 1, 2250, 3700], [3500, 0, 3150, 3450], [3500, 1, 3150, 3700], [7000, 0, 2300, 3460], [7000, 1, 2300, 3710]],
  },
  // 测试期间 12 只全放出来（config.testPets）：手机上一进来的样子
  'all-pets-phone': { phone: true, hour: 10, potLevel: 2, focus: null, scale: null, seconds: 6, pets: require(`${REPO}/miniprogram/utils/shared/pets`).PETS.map((p) => p.id), plan: [] },
  // 傍晚：大家围着锅坐（马蹄形坐点），整张画叠一层橙
  'overview-dusk': { hour: 18, potLevel: 3, focus: [SCENE.fire[0], 2900], scale: 1.39, seconds: 8, pets: ['qiqi', 'shushu', 'nuonuo', 'huahua', 'doudou', 'jutuan', 'lianlian', 'guigui'], plan: [] },
  // 下锅：锅里煮着小米、胡萝卜，豆豆（爱吃小米）跑来吃；闻着胡萝卜来的糯糯（客人）从树林边走到锅边
  'pot-cook': {
    phone: true, hour: 10, potLevel: 2, focus: null, scale: null, seconds: 12,
    pets: ['doudou', 'qiqi', 'shushu', 'lianlian'], visitors: [{ id: 'nuonuo', foodId: 'huluobo' }],
    plan: [[0, 0, 3300, 3600], [0, 4, 2600, 900], [600, 4, 2500, 3150]],
    events: [[400, (life) => life.cook(['doudou'])]],
  },
  // 夜里火着着：全营地本来的颜色（略暗略暖），装饰也是
  'night-lit': { hour: 22, potLevel: 2, focus: [2450, 2950], scale: 0.85, seconds: 8, decor: LAMPS, pets: ['doudou', 'nuonuo', 'qiqi', 'shushu', 'jutuan', 'sunbao'], plan: [[0, 0, 1500, 3450], [0, 1, 3600, 3700], [0, 2, 3200, 2450], [0, 3, 900, 2300], [0, 4, 2000, 3900], [0, 5, 3700, 2600]] },
  // 夜里火没着：远处月光色，小灯笼 / 石灯笼 / 灯串边上的暖亮；走过灯边慢慢变
  'night-lamps': {
    hour: 22, potLevel: 0, focus: [2450, 2950], scale: 0.85, seconds: 12, decor: LAMPS, pets: ['doudou', 'nuonuo', 'qiqi', 'shushu', 'jutuan', 'sunbao'],
    plan: [[0, 0, 1500, 3450], [0, 1, 3600, 3700], [0, 2, 3200, 2450], [0, 3, 900, 2300], [0, 4, 2000, 3900], [0, 5, 3700, 2600], [1000, 3, 1500, 3350], [1500, 4, 2800, 3700]],
  },
  // 正面 / 背影（C 张）：四只往上（远处）走、过一会儿再走回来，豆豆从锅前面过去吃（背对着吃）
  facing: {
    hour: 10, potLevel: 1, focus: [2900, 3250], scale: 1.3, seconds: 16, pets: ['nuonuo', 'jutuan', 'sunbao', 'qiqi', 'doudou'],
    plan: [[0, 0, 2500, 3700], [0, 1, 2900, 3750], [0, 2, 3300, 3700], [0, 3, 3650, 3450], [0, 4, 2300, 3500],
      [500, 0, 2550, 2950], [700, 1, 2950, 3000], [900, 2, 3350, 2950], [1100, 3, 3650, 2800],
      [8500, 0, 2500, 3700], [8700, 1, 2900, 3750], [8900, 2, 3300, 3700], [9100, 3, 3650, 3450]],
    events: [[300, (life) => life.cook(['doudou'])]],
  },
  // 白天随机打盹：8 只各玩各的，录 40 秒，有的趴下睡一会儿（同时最多 2 只）
  naps: { hour: 12, potLevel: 1, focus: [2250, 3000], scale: 0.85, seconds: 40, pets: ['doudou', 'nuonuo', 'qiqi', 'shushu', 'jutuan', 'sunbao', 'lianlian', 'guigui'], plan: [] },
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
  // 锅里煮着几样：火点没点、锅里的样子、夜里宠物 / 装饰身上的光都跟着它
  gardens.set('u1', {
    ...doc,
    foods: { xiaomi: 2 },
    pot: { date: dateKey(new Date()), foods: POT_FOODS.slice(0, sc.potLevel) },
    visitors: (sc.visitors || []).map((v) => ({ ...v, since: '' })),
    pets: Object.keys(fedOf).map((id) => ({ id, since: '2026-10-20', fed: fedOf[id], fedToday: { date: '', n: 0 } })),
    decor: { owned: {}, placed: sc.decor || [] },
    gift: '',
  })
  camp.data.giftShown = true
  wx.app.globalData.campSpots = null
  camp.life.stop()
  camp.life = null
  camp.onShow()
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
  d.fx = require(`${REPO}/miniprogram/utils/scene-fx`).fxViews(L, sc.hour, sc.decor || [], sc.potLevel, require(`${REPO}/miniprogram/config`).cutArt)
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
      pet.style.transform = `translate3d(${s.left}px, ${-s.bottom}px, 0)`
      pet.style.width = `${s.width}px`
      // 影子先挪（有逐帧拼图的下面会提前 return，以前影子留在原地）
      shadow.style.transitionDuration = `${s.duration}ms`
      shadow.style.zIndex = s.z - 1
      shadow.style.transform = `translate3d(${s.shadow.left}px, ${-s.shadow.bottom}px, 0)`
      shadow.style.width = `${s.shadow.width}px`
      shadow.style.height = `${s.shadow.height}px`
      const body = pet.querySelector('.pet-body')
      body.style.height = `${s.width}px`
      body.className = `wx-view pet-body ${s.flip ? 'flip' : ''}`
      // 有逐帧拼图的：换行（动作）、拼图（a / b 张）、快慢、光
      const strips = body.querySelectorAll('.anim-strip')
      if (strips.length && s.anim) {
        const frame = body.querySelector('.anim-frame')
        frame.style.width = `${s.width}px`
        frame.style.height = `${s.width}px`
        strips.forEach((img, k) => {
          if (img.getAttribute('src') !== s.sheetSrc) img.setAttribute('src', s.sheetSrc)
          img.className = `wx-image anim-strip anim-f${s.anim.frames}${k ? ' moon' : ''}`
          img.style.marginTop = `-${s.anim.row * 100}%`
          img.style.animationDuration = `${s.anim.ms}ms`
          img.style.filter = k ? s.moonLight : s.light || 'none'
          if (k) img.style.opacity = s.moon
          img.style.transition = `filter ${s.duration}ms linear, opacity ${s.duration}ms linear`
        })
        return
      }
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
        const s = { ...now[i], sheetSrc: now[i].sheet ? mapSrc(now[i].sheet) : '' }
        await apply(i, jump ? { ...s, duration: 0 } : s)
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
  // 第 i 只在哪（客人不在 whereIs 里，从精灵反推）
  const posOf = (i) => {
    const sp = camp.data.pets[i]
    return { id: sp.id, x: (sp.left + sp.width / 2) / L.k, y: (L.height - sp.bottom) / L.k, action: sp.action }
  }
  const arrivedAll = () => Object.entries(starts).every(([i, [x, y]]) => {
    const w = posOf(i)
    return Math.hypot(w.x - x, w.y - y) < 2 && w.action === 'idle'
  })
  for (let t = 0; t < 800 && !arrivedAll(); t++) {
    camp.clock.advance(100)
    Object.entries(starts).forEach(([i, [x, y]]) => {
      const w = posOf(i)
      if (w.action !== 'walk' && Math.hypot(w.x - x, w.y - y) >= 2) life.goTo(Number(i), x, y, 120000)
    })
  }
  if (!arrivedAll()) console.log(name, '没全走到起点', JSON.stringify(camp.data.pets.map((p, i) => posOf(i)).map((w) => [w.id, w.x | 0, w.y | 0, w.action])))
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
  const events = (sc.events || []).slice().sort((a, b) => a[0] - b[0])
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
      while (events.length && events[0][0] <= now) events.shift()[1](life)
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
