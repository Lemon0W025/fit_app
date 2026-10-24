// 让营地自己动起来：篝火火苗和烟、夜里帐篷里的暖光和萤火虫、水壶炉的热气、花坛的蝴蝶、灯的光晕。全是 CSS 动画，不占包
// 纯函数，有单测；坐标是屏幕像素（画的像素 × L.k）

const { SCENE, scaleAt } = require('./shared/camp')
const { decorById, patchRect } = require('./shared/decor')
const { zOf } = require('./camp-view')

const STEAM_IMAGE = '/images/garden/fx/steam.png'
const FIREFLY_COUNT = 8
const fmt = (n) => Math.round(n * 10) / 10

function noise(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function at(x, y, w, h, L) {
  return { left: fmt(x * L.k - (w * L.k) / 2), top: fmt(y * L.k - h * L.k), width: fmt(w * L.k), height: fmt(h * L.k) }
}

function fxViews(L, hour, placed) {
  const night = hour >= 19 || hour < 6
  const out = []
  const [fx, fy] = SCENE.fire
  const fireZ = zOf(fy) + 5
  for (let i = 0; i < 3; i++) {
    const w = 260 - i * 50
    out.push({ key: `flame-${i}`, kind: 'flame', ...at(fx + (i - 1) * 30, fy - 20, w, w * 1.3, L), z: fireZ + i, delay: fmt(i * 0.3) })
  }
  for (let i = 0; i < 3; i++) {
    out.push({ key: `smoke-${i}`, kind: 'smoke', ...at(fx + (i - 1) * 40, fy - 240, 200, 200, L), z: fireZ + 4, delay: fmt(i * 1.4) })
  }
  if (night) {
    // 帐篷里亮着灯
    const t = SCENE.nogo.tent
    out.push({ key: 'tent-glow', kind: 'glow', ...at((t[0][0] + t[1][0]) / 2, t[2][1] + 40, 900, 620, L), z: zOf(t[2][1]) + 2, delay: 0 })
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const x = 400 + noise(i * 3 + 1) * (SCENE.width - 800)
      const y = 900 + noise(i * 3 + 2) * (SCENE.height - 1500)
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
    if (d.fx === 'steam') out.push({ key: `steam-${p.uid}`, kind: 'steam', image: STEAM_IMAGE, ...at(cx, top, 220, 220, L), z: zOf(p.y) + 2, delay: 0 })
    if (d.fx === 'butterfly' && !night) out.push({ key: `butterfly-${p.uid}`, kind: 'butterfly', ...at(cx, top, 70, 50, L), z: 1800, delay: fmt(noise(p.x) * 3) })
    if (d.fx === 'glow' && night) out.push({ key: `glow-${p.uid}`, kind: 'glow', ...at(cx, rect.top + d.patch.h * 0.6 * s, d.patch.w * 1.3, d.patch.h * 1.3, L), z: zOf(p.y) + 2, delay: fmt(noise(p.y) * 2) })
  })
  return out
}

module.exports = { fxViews }
