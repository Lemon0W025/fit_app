// 让营地自己动起来：篝火（从画上取的逐帧火苗 + 一圈跟着跳的火光 + 往上飘的火星）、暖暖锅的热气、
// 夜里帐篷的灯光和萤火虫、水壶炉的热气、灯的光晕。
// 原则：不在画上「画东西」（CSS 画的火团、烟团、蝴蝶跟手绘的画放一起很假），只加光和很小的颗粒；
// 有形状的东西用从画上取的帧（火苗）或很淡的半透明图（热气）。纯函数，有单测；坐标是屏幕像素（画的像素 × L.k）

const { SCENE, scaleAt } = require('./shared/camp')
const { decorById, patchRect } = require('./shared/decor')
const { zOf } = require('./camp-view')

const WISP_IMAGE = '/images/camp/fx/wisp.png'
const FIRE_FRAMES = 8 // 和 camp.wxss 的 .fx-fire-strip steps(8)、scripts/camp/fx_art.py 的 FRAMES 一致
const FIRE_MS = 960
const FIREFLY_COUNT = 8
// 火星：从火口两边往上飘 [x, y, 变体, 错开的秒数]；白天 3 颗、夜里 6 颗
const EMBERS = [[1950, 2720, 'a', 0], [2230, 2715, 'b', 0.9], [2090, 2745, 'c', 1.7], [2010, 2735, 'b', 2.3], [2170, 2730, 'a', 1.3], [2120, 2720, 'c', 0.4]]
const fmt = (n) => Math.round(n * 10) / 10

function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

// 底边中点在 (x, y)
function at(x, y, w, h, L) {
  return { left: fmt(x * L.k - (w * L.k) / 2), top: fmt(y * L.k - h * L.k), width: fmt(w * L.k), height: fmt(h * L.k) }
}

// 中心在 (x, y)
function centered(x, y, w, h, L) {
  return { left: fmt((x - w / 2) * L.k), top: fmt((y - h / 2) * L.k), width: fmt(w * L.k), height: fmt(h * L.k) }
}

function boxRect([l, t, r, b], L) {
  return { left: fmt(l * L.k), top: fmt(t * L.k), width: fmt((r - l) * L.k), height: fmt((b - t) * L.k) }
}

// base：帐篷 / 锅抠图层的前缀（config.cutArt），火苗的逐帧图也在那儿；空的用包里的小图
function fxViews(L, hour, placed, potLevel = 0, base = '') {
  const night = hour >= 19 || hour < 6
  const out = []
  const potZ = zOf(SCENE.cutouts.pot.zy) // 锅的抠图层在 potZ + 1
  // 火苗：逐帧，压在锅下面（火苗本来就在锅底下、木柴之间）
  // 逐帧图每帧比框大一圈（pad，原画），框只露中间：这里算好图在框里的大小和偏移（百分比，跟着缩放走）
  const [fl, ft, fr, fb] = SCENE.flame.box
  const pad = SCENE.flame.pad
  const strip = {
    width: fmt(FIRE_FRAMES * ((fr - fl + 2 * pad) / (fr - fl)) * 100),
    height: fmt(((fb - ft + 2 * pad) / (fb - ft)) * 100),
    left: fmt((-pad / (fr - fl)) * 100),
    top: fmt((-pad / (fb - ft)) * 100),
  }
  out.push({ key: 'fire', kind: 'fire', image: `${base || '/images/camp/cut/'}${night ? 'night-' : ''}fire.jpg`, frames: FIRE_FRAMES, ms: FIRE_MS, strip, ...boxRect(SCENE.flame.box, L), z: potZ, delay: 0 })
  // 火光：一圈暖光盖在锅底、石头和草上，一跳一跳（夜里大一圈、亮一点）
  const [gx, gy] = [SCENE.fire[0] - 40, SCENE.fire[1] - 60]
  out.push({ key: 'fire-glow', kind: 'fireglow', variant: night ? 'fireglow-night' : '', ...centered(gx, gy, night ? 2200 : 1300, night ? 1400 : 800, L), z: potZ + 2, delay: 0 })
  EMBERS.slice(0, night ? 6 : 3).forEach(([x, y, v, d], i) => {
    out.push({ key: `ember-${i}`, kind: 'ember', variant: `ember-${v}`, ...centered(x, y, 22, 22, L), z: potZ + 3, delay: d })
  })
  // 暖暖锅：打了两顿起冒热气（从锅口飘起来），三顿两缕
  const [rx, ry] = SCENE.cutouts.pot.rim
  for (let i = 0; i < (potLevel >= 3 ? 2 : potLevel >= 2 ? 1 : 0); i++) {
    out.push({ key: `pot-steam-${i}`, kind: 'wisp', image: WISP_IMAGE, ...at(rx + (i ? 70 : -50), ry + 30, 150, 600, L), z: potZ + 3, delay: fmt(i * 1.7), ms: 3600 })
  }
  if (night) {
    // 帐篷里亮着灯（门口那块）
    out.push({ key: 'tent-glow', kind: 'glow', ...centered(1150, 1250, 800, 560, L), z: zOf(SCENE.cutouts.tent.zy) + 2, delay: 0 })
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const x = 400 + noise(i * 3 + 1) * (SCENE.width - 800)
      const y = 1000 + noise(i * 3 + 2) * (SCENE.height - 1400)
      out.push({ key: `firefly-${i}`, kind: 'firefly', ...at(x, y, 24, 24, L), z: 1900, delay: fmt(noise(i * 3 + 3) * 4) })
    }
  }
  placed.forEach((p) => {
    const d = decorById(p.id)
    if (!d || !d.fx) return
    const rect = patchRect(p.id, p.x, p.y)
    const s = scaleAt(p.y)
    const cx = rect.left + (d.patch.w / 2) * s
    const top = rect.top + d.patch.h * 0.25 * s
    if (d.fx === 'steam') out.push({ key: `steam-${p.uid}`, kind: 'wisp', image: WISP_IMAGE, ...at(cx, top + 40, 100, 400, L), z: zOf(p.y) + 2, delay: fmt(noise(p.x) * 2), ms: 3200 })
    if (d.fx === 'glow' && night) out.push({ key: `glow-${p.uid}`, kind: 'glow', ...at(cx, rect.top + d.patch.h * 0.6 * s, d.patch.w * 1.3, d.patch.h * 1.3, L), z: zOf(p.y) + 2, delay: fmt(noise(p.y) * 2) })
    // 花坛的蝴蝶：等有画了再加（CSS 画的两个圆片太假）
  })
  return out
}

module.exports = { fxViews, FIRE_FRAMES }
