// 打卡动效录屏：结果页（普通 / 三顿准时 / 里程碑）、首页（饭点内 / 过点）、打卡页等小暖、打卡日历的纪念章。
// 页面数据用真实页面逻辑（手动时钟快进到数字滚完）算出来渲染成 HTML，CSS 动画在浏览器里真跑；
// 庆祝（彩带 + 卡）按页面里的时间点插进去，彩带用 utils/confetti.js 同一套计算画。数字滚动不在录屏里（直接是最后的数）。
//
//   node scripts/preview/record-checkin.js [场景 ...]   场景：meal meal-allontime meal-milestone today-open today-warn checkin-wait checkin-pick calendar（不写全录）
//   checkin-pick：点「这是哪一餐」的分段控制器（taps：[毫秒, 第几项]），组件的 JS 在 Node 里真的跑，胶囊的样子写进浏览器的 DOM
//   输出到 .preview/checkin/<场景>.mp4、.gif，第一帧 <场景>.png（.preview 不进仓库）
// 需要 Playwright 和 ffmpeg（云端环境里都装好了）
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { chromium } = require('playwright')
const REPO = path.join(__dirname, '..', '..')
const { createFakeCloud, loadCloudFunction } = require(`${REPO}/test/helpers/fake-cloud`)
const { createWx, loadPage, loadComponent, settle } = require(`${REPO}/test/helpers/page-harness`)
const { manualClock } = require(`${REPO}/test/helpers/manual-clock`)
const { fixDate } = require(`${REPO}/test/helpers/fixed-date`)
const { analysisJson } = require(`${REPO}/test/helpers/fake-repo`)
const { renderPage, renderComponent } = require('./wxml-render')

const OUT = path.join(REPO, '.preview', 'checkin')
fs.mkdirSync(OUT, { recursive: true })
const MP = `${REPO}/miniprogram`
const mapSrc = (src) => (String(src).startsWith('/images/') ? `file://${MP}${src}` : String(src))
const snap = (p) => JSON.parse(JSON.stringify(p.data))
// fixDate 要一个能注册 after 的 t：录屏里不用换回真的 Date
const T = { after() {} }

const STAMPS = (dinner) => [
  { mealType: 'breakfast', label: '早', state: 'green', onTime: true },
  { mealType: 'lunch', label: '午', state: 'green', onTime: true },
  { mealType: 'dinner', label: '晚', state: dinner ? 'green' : 'none', onTime: !!dinner },
]
const MEAL = {
  _id: 'm1', mealType: 'lunch', status: 'done', createdAt: Date.parse('2026-10-22T12:10:00+08:00'), note: '', fileID: '/images/camp/family.jpg',
  analysis: {
    isFood: true, rating: 'green', totalKcal: 520, protein: 22, carbs: 64, fat: 16,
    comment: '荤素搭配得好，米饭的量也合适。', suggestion: '晚饭多来点绿叶菜。',
    foods: [{ name: '米饭', portion: '一碗', kcal: 230 }, { name: '青椒肉丝', portion: '半盘', kcal: 210 }, { name: '番茄蛋汤', portion: '一碗', kcal: 80 }],
  },
}
const GAIN = { beans: 20, beansToday: 35, hint: '下一顿晚饭 17:00～19:00 拍算准时', stamps: STAMPS(false), mealType: 'lunch', timing: 'on', allOnTime: false, milestone: null }
const profileInput = { nickname: '妈妈', sex: 'female', age: 52, heightCm: 158, weightKg: 70, targetWeightKg: 60, activity: 'light' }

async function mealData(gain) {
  const wx = createWx(async (req) => (req.action === 'meal.get' ? { ok: true, data: MEAL } : { ok: true, data: null }))
  wx.app.globalData.lastGain = { mealId: 'm1', gain, arrival: null }
  const page = loadPage('meal', wx)
  page.clock = manualClock()
  page.onLoad({ id: 'm1' })
  await settle()
  page.clock.advance(5000)
  const end = snap(page)
  page.onUnload()
  // 先渲染不带庆祝的页面，庆祝按页面里的时间点再插
  const later = end.celebrate ? { at: end.celebrate === 'milestone' ? 1400 : 700, mode: end.celebrate, milestone: end.milestone } : null
  return { data: { ...end, celebrate: '', milestone: null }, later }
}

async function todayData(when, meals) {
  const clock = fixDate(T, '2026-10-22T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: meals.map(() => analysisJson({ totalKcal: 420 })) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  for (const [mealType, at] of meals) {
    clock.set(`2026-10-22T${at}:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType, note: '家常菜' } })
  }
  clock.set(`2026-10-22T${when}:00+08:00`)
  const page = loadPage('today', createWx(main))
  page.clock = manualClock()
  page.onShow()
  await settle()
  page.clock.advance(1000)
  const data = snap(page)
  page.onHide()
  return { data }
}

async function calendarData() {
  const clock = fixDate(T, '2026-10-16T08:00:00+08:00')
  const cloud = createFakeCloud({ replies: Array.from({ length: 7 }, () => analysisJson()) })
  const { main } = loadCloudFunction(cloud)
  await main({ action: 'profile.save', data: profileInput })
  for (let d = 16; d <= 22; d++) {
    clock.set(`2026-10-${d}T08:00:00+08:00`)
    await main({ action: 'meal.analyze', data: { mealType: 'breakfast', note: '小米粥' } })
  }
  const page = loadPage('forest', createWx(main))
  page.onShow()
  await settle()
  return { data: snap(page) }
}

const SCENARIOS = {
  meal: { page: 'meal', seconds: 2.5, build: () => mealData(GAIN) },
  'meal-allontime': { page: 'meal', seconds: 2.5, build: () => mealData({ ...GAIN, beans: 35, beansToday: 75, stamps: STAMPS(true), mealType: 'dinner', allOnTime: true }) },
  'meal-milestone': { page: 'meal', seconds: 4.5, build: () => mealData({ ...GAIN, milestone: { days: 7, times: 1, tier: 'bronze', glow: false, petId: 'doudou' } }) },
  'today-open': { page: 'today', tab: 'today', seconds: 5, build: () => todayData('12:20', [['breakfast', '07:40']]) },
  'today-warn': { page: 'today', tab: 'today', seconds: 4, build: () => todayData('13:30', [['breakfast', '07:40']]) },
  'checkin-wait': {
    page: 'checkin',
    seconds: 3,
    build: async () => {
      const page = loadPage('checkin', createWx(async () => ({ ok: true, data: null })))
      const { analysisSteps } = require(`${MP}/utils/view`)
      return { data: { ...snap(page), photo: '/images/camp/family.jpg', submitting: true, stage: '小暖正在仔细看你的饭菜…', steps: analysisSteps(true, 1) } }
    },
  },
  // 换餐次：午餐 → 晚餐 → 加餐，再连着快点 早餐 → 午餐 → 晚餐（胶囊总是转向最新的那个）
  'checkin-pick': {
    page: 'checkin',
    seconds: 4,
    taps: [[600, 2], [1600, 3], [2600, 0], [2680, 1], [2760, 2]],
    build: async () => {
      fixDate(T, '2026-10-22T12:10:00+08:00')
      const page = loadPage('checkin', createWx(async () => ({ ok: true, data: null })))
      page.onLoad({})
      return { data: snap(page) }
    },
  },
  calendar: { page: 'forest', seconds: 3, build: calendarData },
}

// 分段控制器：量页面上的选项，组件的 JS 在 Node 里跑（手动时钟跟着真实时间走），胶囊的 class / 样式写进 DOM，CSS 过渡在浏览器里播
async function driveSeg(page, data, taps, ms) {
  const wx = createWx(async () => ({ ok: true, data: null }))
  wx.rects = await page.evaluate(() => {
    const r = (e) => JSON.parse(JSON.stringify(e.getBoundingClientRect()))
    return { '.seg': r(document.querySelector('.seg')), '.seg-opt': [...document.querySelectorAll('.seg-opt')].map(r) }
  })
  const seg = loadComponent('segmented', wx, { options: data.mealTypes, value: data.mealType })
  const clock = manualClock()
  seg.clock = clock
  seg.attach()
  seg.ready()
  const queue = taps.slice()
  // 用 performance.now：场景里 fixDate 把 Date 定住了
  const t0 = performance.now()
  let last = 0
  let lastKey = ''
  while (performance.now() - t0 < ms) {
    const now = Math.round(performance.now() - t0)
    while (queue.length && queue[0][0] <= now) seg.onTap({ currentTarget: { dataset: { index: queue.shift()[1] } }, detail: {} })
    clock.advance(now - last)
    last = now
    const st = { ready: seg.data.ready, phase: seg.data.phase, pill: seg.data.pill, active: seg.data.active }
    const key = JSON.stringify(st)
    if (key !== lastKey) {
      lastKey = key
      await page.evaluate((st) => {
        const box = document.querySelector('.seg')
        box.className = `wx-view seg seg-p${st.phase}${st.ready ? ' seg-ready' : ''}`
        const [c1, mid, c2] = box.querySelectorAll('.seg-piece')
        const p = st.pill
        c1.style.cssText = `top: ${p.top}px; width: ${p.h}px; height: ${p.h}px; transform: translate3d(${p.l}px, 0, 0)`
        mid.style.cssText = `top: ${p.top}px; height: ${p.h}px; transform: translate3d(${p.m}px, 0, 0) scaleX(${p.s})`
        c2.style.cssText = `top: ${p.top}px; width: ${p.h}px; height: ${p.h}px; transform: translate3d(${p.r}px, 0, 0)`
        box.querySelectorAll('.seg-opt').forEach((o, i) => o.classList.toggle('seg-on', i === st.active))
      }, st)
    }
    await page.waitForTimeout(15)
  }
}

// 到点把庆祝插进页面，彩带用 confetti.js 同一套计算画
function laterScript(later) {
  if (!later) return ''
  const { html, css } = renderComponent('/components/celebrate/celebrate', { mode: later.mode, milestone: later.milestone }, mapSrc)
  const confetti = fs.readFileSync(`${MP}/utils/confetti.js`, 'utf8')
  return `<style>${css}</style><template id="later">${html}</template><script>
const module = { exports: {} };
(function (module) { ${confetti} })(module);
const C = module.exports;
setTimeout(() => {
  document.body.appendChild(document.getElementById('later').content.cloneNode(true));
  const canvas = document.querySelector('.cel-confetti');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * 2; canvas.height = h * 2;
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  const list = C.makeParticles({ mode: '${later.mode}', width: w, height: h, seed: 7 });
  const t0 = performance.now(); let prev = t0;
  const tick = (now) => {
    const alive = C.step(list, Math.min(0.05, (now - prev) / 1000), h); prev = now;
    ctx.clearRect(0, 0, w, h); C.draw(ctx, list);
    if (alive && now - t0 < C.RUN_MS['${later.mode}']) requestAnimationFrame(tick); else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(tick);
}, ${later.at});
</script>`
}

async function record(name, sc, browser) {
  const { data, later } = await sc.build()
  const file = path.join(OUT, `${name}.html`)
  fs.writeFileSync(file, renderPage({ name: sc.page, data, mapSrc, tab: sc.tab || null, back: !sc.tab, extraScript: laterScript(later) }))
  const vdir = path.join(OUT, `${name}-video`)
  fs.rmSync(vdir, { recursive: true, force: true })
  const size = { width: 375, height: 812 }
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, recordVideo: { dir: vdir, size } })
  const page = await context.newPage()
  const start = Date.now()
  await page.goto(`file://${file}`)
  const lead = (Date.now() - start) / 1000
  if (sc.taps) await driveSeg(page, data, sc.taps, sc.seconds * 1000)
  else await page.waitForTimeout(sc.seconds * 1000)
  await page.close()
  await context.close()
  const webm = fs.readdirSync(vdir).find((f) => f.endsWith('.webm'))
  execSync(`ffmpeg -loglevel error -y -ss ${Math.max(0, lead - 0.1).toFixed(2)} -i ${vdir}/${webm} -t ${sc.seconds} -c:v libx264 -pix_fmt yuv420p -r 25 ${OUT}/${name}.mp4`)
  execSync(`ffmpeg -loglevel error -y -i ${OUT}/${name}.mp4 -vf "fps=12,scale=375:-1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" ${OUT}/${name}.gif`)
  execSync(`ffmpeg -loglevel error -y -i ${OUT}/${name}.mp4 -frames:v 1 ${OUT}/${name}.png`)
  console.log(name, 'ok')
}

async function main() {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS)
  const browser = await chromium.launch()
  for (const n of names) await record(n, SCENARIOS[n], browser)
  await browser.close()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
